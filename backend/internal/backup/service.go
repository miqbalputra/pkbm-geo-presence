package backup

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/config"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/httpx"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
	"gorm.io/gorm"
)

const (
	KindSQL       = "sql"
	KindFull      = "full"
	StatusQueued  = "queued"
	StatusRunning = "running"
	StatusSuccess = "succeeded"
	StatusFailed  = "failed"
	StatusExpired = "expired"
)

var (
	ErrBackupBusy        = &serviceError{Code: "BACKUP_BUSY", Message: "Backup lain sedang berjalan. Silakan tunggu sampai selesai."}
	ErrBackupNotFound    = &serviceError{Code: "BACKUP_NOT_FOUND", Message: "Backup tidak ditemukan."}
	ErrBackupExpired     = &serviceError{Code: "BACKUP_EXPIRED", Message: "File backup sudah kedaluwarsa."}
	ErrBackupUnsupported = &serviceError{Code: "BACKUP_MYSQL_REQUIRED", Message: "Backup hanya tersedia saat database menggunakan MySQL."}
)

type serviceError struct {
	Code    string
	Message string
}

func (e *serviceError) Error() string { return e.Message }

type Manifest struct {
	BackupID         string           `json:"backupId"`
	Kind             string           `json:"kind"`
	CreatedAt        string           `json:"createdAt"`
	AppVersion       string           `json:"appVersion"`
	DatabaseEngine   string           `json:"databaseEngine"`
	DatabaseVersion  string           `json:"databaseVersion"`
	Timezone         string           `json:"timezone"`
	SchemaMigrations []string         `json:"schemaMigrations"`
	Tables           map[string]int64 `json:"tables"`
	PayloadFile      string           `json:"payloadFile"`
	PayloadSize      int64            `json:"payloadSize"`
	PayloadSHA256    string           `json:"payloadSha256"`
	FileSize         int64            `json:"fileSize"`
	SHA256           string           `json:"sha256"`
}

type Service struct {
	db  *gorm.DB
	cfg config.Config

	mu            sync.Mutex
	uploadMu      sync.Mutex
	active        bool
	restoreActive bool
}

func NewService(db *gorm.DB, cfg config.Config) *Service {
	return &Service{db: db, cfg: cfg}
}

func (s *Service) Initialize() error {
	if err := os.MkdirAll(s.cfg.BackupDir, 0o700); err != nil {
		return fmt.Errorf("buat direktori backup: %w", err)
	}
	return s.recoverInterruptedJobs()
}

func (s *Service) StartCleanup(ctx context.Context) {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			_ = s.cleanupExpired()
		}
	}
}

func (s *Service) recoverInterruptedJobs() error {
	now := time.Now().UTC()
	message := "Job dihentikan saat proses aplikasi restart. Silakan jalankan backup ulang."
	return s.db.Model(&models.BackupJob{}).
		Where("status IN ?", []string{StatusQueued, StatusRunning}).
		Updates(map[string]any{"status": StatusFailed, "error_code": "BACKUP_PROCESS_RESTARTED", "error_message": message, "finished_at": now}).Error
}

func (s *Service) StartJob(kind, source string, requestedBy *uint, idempotencyKey string) (models.BackupJob, error) {
	return s.startJob(kind, source, requestedBy, idempotencyKey, false)
}

func (s *Service) startJob(kind, source string, requestedBy *uint, idempotencyKey string, allowDuringRestore bool) (models.BackupJob, error) {
	if kind != KindSQL && kind != KindFull {
		return models.BackupJob{}, &serviceError{Code: "BACKUP_KIND_INVALID", Message: "Jenis backup harus sql atau full."}
	}
	if s.cfg.DBDriver != "mysql" {
		return models.BackupJob{}, ErrBackupUnsupported
	}
	if len(idempotencyKey) > 255 {
		return models.BackupJob{}, &serviceError{Code: "BACKUP_IDEMPOTENCY_INVALID", Message: "Idempotency key terlalu panjang."}
	}
	if strings.TrimSpace(source) == "" {
		source = "admin"
	}

	if idempotencyKey != "" {
		var existing models.BackupJob
		if err := s.db.Where("idempotency_key = ?", idempotencyKey).First(&existing).Error; err == nil {
			return existing, nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return models.BackupJob{}, err
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.active || (s.restoreActive && !allowDuringRestore) {
		return models.BackupJob{}, ErrBackupBusy
	}
	var activeCount int64
	if err := s.db.Model(&models.BackupJob{}).Where("status IN ?", []string{StatusQueued, StatusRunning}).Count(&activeCount).Error; err != nil {
		return models.BackupJob{}, err
	}
	if activeCount > 0 {
		return models.BackupJob{}, ErrBackupBusy
	}

	now := time.Now().UTC()
	job := models.BackupJob{
		ID:          uuid.New().String(),
		Kind:        kind,
		Status:      StatusQueued,
		Source:      source,
		RequestedBy: requestedBy,
		RequestedAt: now,
		ExpiresAt:   now.Add(s.cfg.BackupArtifactTTL),
	}
	if idempotencyKey != "" {
		job.IdempotencyKey = &idempotencyKey
	}
	if err := s.db.Create(&job).Error; err != nil {
		if idempotencyKey != "" {
			var existing models.BackupJob
			if lookupErr := s.db.Where("idempotency_key = ?", idempotencyKey).First(&existing).Error; lookupErr == nil {
				return existing, nil
			}
		}
		return models.BackupJob{}, err
	}
	s.active = true
	go func(id string) {
		defer func() {
			s.mu.Lock()
			s.active = false
			s.mu.Unlock()
		}()
		s.runJob(id)
	}(job.ID)
	return job, nil
}

func (s *Service) ListJobs(limit int) ([]models.BackupJob, error) {
	if limit < 1 || limit > 200 {
		limit = 50
	}
	if err := s.cleanupExpired(); err != nil {
		return nil, err
	}
	var jobs []models.BackupJob
	if err := s.db.Order("created_at DESC, id DESC").Limit(limit).Find(&jobs).Error; err != nil {
		return nil, err
	}
	return jobs, nil
}

func (s *Service) GetJob(id string) (models.BackupJob, error) {
	var job models.BackupJob
	if err := s.db.Where("id = ?", id).First(&job).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.BackupJob{}, ErrBackupNotFound
		}
		return models.BackupJob{}, err
	}
	if job.Status == StatusSuccess && time.Now().UTC().After(job.ExpiresAt) {
		_ = s.expireJob(job)
		job.Status = StatusExpired
	}
	return job, nil
}

func (s *Service) VerifyJob(id string) (models.BackupJob, error) {
	job, err := s.GetJob(id)
	if err != nil {
		return models.BackupJob{}, err
	}
	if job.Status != StatusSuccess || job.FilePath == nil || job.SHA256 == nil {
		return job, &serviceError{Code: "BACKUP_NOT_READY", Message: "Backup belum siap diverifikasi."}
	}
	path, err := s.safePath(*job.FilePath)
	if err != nil {
		return job, err
	}
	stat, err := os.Stat(path)
	if err != nil {
		return job, &serviceError{Code: "BACKUP_FILE_MISSING", Message: "File backup tidak ditemukan di server."}
	}
	if stat.Size() != job.FileSize {
		return job, &serviceError{Code: "BACKUP_SIZE_MISMATCH", Message: "Ukuran file backup tidak sesuai manifest."}
	}
	hash, err := fileSHA256(path)
	if err != nil {
		return job, err
	}
	if !strings.EqualFold(hash, *job.SHA256) {
		return job, &serviceError{Code: "BACKUP_CHECKSUM_MISMATCH", Message: "Checksum file backup tidak sesuai."}
	}
	if job.Kind == KindFull {
		workspace, err := os.MkdirTemp(s.cfg.BackupDir, ".verify-")
		if err != nil {
			return job, &serviceError{Code: "BACKUP_ARCHIVE_INVALID", Message: "Paket full backup tidak dapat diverifikasi."}
		}
		defer os.RemoveAll(workspace)
		if err := validateFullArchive(path, workspace); err != nil {
			return job, &serviceError{Code: "BACKUP_ARCHIVE_INVALID", Message: "Paket full backup tidak valid."}
		}
	} else if err := validateGzip(path); err != nil {
		return job, &serviceError{Code: "BACKUP_GZIP_INVALID", Message: "SQL backup tidak valid."}
	}
	return job, nil
}

func (s *Service) OpenArtifact(id string) (*os.File, models.BackupJob, error) {
	job, err := s.GetJob(id)
	if err != nil {
		return nil, models.BackupJob{}, err
	}
	if job.Status != StatusSuccess || job.FilePath == nil {
		return nil, job, &serviceError{Code: "BACKUP_NOT_READY", Message: "Backup belum siap diunduh."}
	}
	path, err := s.safePath(*job.FilePath)
	if err != nil {
		return nil, job, err
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, job, &serviceError{Code: "BACKUP_FILE_MISSING", Message: "File backup tidak ditemukan di server."}
	}
	return file, job, nil
}

func (s *Service) StartRestore(backupID, phrase string, requestedBy uint) (models.BackupRestoreJob, error) {
	if !s.cfg.BackupRestoreEnabled {
		return models.BackupRestoreJob{}, &serviceError{Code: "BACKUP_RESTORE_DISABLED", Message: "Restore production belum diaktifkan."}
	}
	job, err := s.GetJob(backupID)
	if err != nil {
		return models.BackupRestoreJob{}, err
	}
	if job.Status != StatusSuccess {
		return models.BackupRestoreJob{}, &serviceError{Code: "BACKUP_NOT_READY", Message: "Hanya backup yang berhasil yang dapat direstore."}
	}
	expectedPhrase := "RESTORE PRODUCTION " + strings.ToUpper(job.ID)
	if strings.TrimSpace(phrase) != expectedPhrase {
		return models.BackupRestoreJob{}, &serviceError{Code: "BACKUP_CONFIRMATION_INVALID", Message: "Phrase konfirmasi restore tidak sesuai."}
	}
	if _, err := s.VerifyJob(backupID); err != nil {
		return models.BackupRestoreJob{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.active || s.restoreActive {
		return models.BackupRestoreJob{}, ErrBackupBusy
	}
	var running int64
	if err := s.db.Model(&models.BackupRestoreJob{}).Where("status IN ?", []string{"queued", "preparing", "running"}).Count(&running).Error; err != nil {
		return models.BackupRestoreJob{}, err
	}
	if running > 0 {
		return models.BackupRestoreJob{}, ErrBackupBusy
	}
	restore := models.BackupRestoreJob{
		ID: uuid.New().String(), BackupJobID: backupID, Status: "queued", RequestedBy: requestedBy,
		Confirmation: phrase, CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(),
	}
	if err := s.db.Create(&restore).Error; err != nil {
		return models.BackupRestoreJob{}, err
	}
	s.restoreActive = true
	go func(id string) {
		defer func() {
			s.mu.Lock()
			s.restoreActive = false
			s.mu.Unlock()
		}()
		s.runRestore(id)
	}(restore.ID)
	return restore, nil
}

func (s *Service) GetRestore(id string) (models.BackupRestoreJob, error) {
	var restore models.BackupRestoreJob
	if err := s.db.Where("id = ?", id).First(&restore).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.BackupRestoreJob{}, &serviceError{Code: "RESTORE_NOT_FOUND", Message: "Job restore tidak ditemukan."}
		}
		return models.BackupRestoreJob{}, err
	}
	return restore, nil
}

func (s *Service) ListRestores(limit int) ([]models.BackupRestoreJob, error) {
	if limit < 1 || limit > 200 {
		limit = 50
	}
	var restores []models.BackupRestoreJob
	if err := s.db.Order("created_at DESC, id DESC").Limit(limit).Find(&restores).Error; err != nil {
		return nil, err
	}
	return restores, nil
}

func (s *Service) runRestore(id string) {
	setRestore := func(values map[string]any) {
		_ = s.db.Model(&models.BackupRestoreJob{}).Where("id = ?", id).Updates(values)
	}
	setRestore(map[string]any{"status": "preparing", "started_at": time.Now().UTC()})
	var restore models.BackupRestoreJob
	if err := s.db.Where("id = ?", id).First(&restore).Error; err != nil {
		return
	}

	preJob, err := s.startJob(KindSQL, "admin", &restore.RequestedBy, "pre-restore-"+id, true)
	if err != nil {
		s.failRestore(id, "PRE_RESTORE_BACKUP_FAILED", "Pre-restore backup tidak dapat dibuat.")
		return
	}
	preJob, err = s.waitForJob(preJob.ID)
	if err != nil || preJob.Status != StatusSuccess {
		s.failRestore(id, "PRE_RESTORE_BACKUP_FAILED", "Pre-restore backup tidak berhasil. Restore dibatalkan.")
		return
	}
	preID := preJob.ID
	setRestore(map[string]any{"status": "running", "pre_restore_backup_id": preID})
	if err := s.setMaintenance(true, "Restore database sedang berjalan", id); err != nil {
		s.failRestore(id, "MAINTENANCE_MODE_FAILED", "Maintenance mode tidak dapat diaktifkan.")
		return
	}

	job, err := s.GetJob(restore.BackupJobID)
	if err == nil {
		err = s.importJob(job)
	}
	if err == nil {
		err = s.verifyRestoredDatabase(job)
	}
	if err != nil {
		// Keep maintenance mode active for manual investigation and recovery.
		s.failRestore(id, "RESTORE_FAILED", "Restore gagal. Sistem tetap dalam maintenance mode untuk pemeriksaan.")
		return
	}
	if err := s.setMaintenance(false, "", ""); err != nil {
		s.failRestore(id, "MAINTENANCE_MODE_FAILED", "Restore selesai tetapi maintenance mode belum dapat dimatikan.")
		return
	}
	setRestore(map[string]any{"status": "succeeded", "finished_at": time.Now().UTC()})
}

func (s *Service) waitForJob(id string) (models.BackupJob, error) {
	deadline := time.NewTimer(s.cfg.BackupJobTimeout)
	defer deadline.Stop()
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	for {
		job, err := s.GetJob(id)
		if err != nil {
			return models.BackupJob{}, err
		}
		if job.Status == StatusSuccess || job.Status == StatusFailed || job.Status == StatusExpired {
			return job, nil
		}
		select {
		case <-deadline.C:
			return models.BackupJob{}, &serviceError{Code: "BACKUP_TIMEOUT", Message: "Job backup melewati batas waktu."}
		case <-ticker.C:
		}
	}
}

func (s *Service) importJob(job models.BackupJob) error {
	if job.FilePath == nil || job.Status != StatusSuccess {
		return &serviceError{Code: "BACKUP_NOT_READY", Message: "Artifact restore tidak tersedia."}
	}
	path, err := s.safePath(*job.FilePath)
	if err != nil {
		return err
	}
	if _, err := os.Stat(path); err != nil {
		return &serviceError{Code: "BACKUP_FILE_MISSING", Message: "Artifact restore tidak ditemukan."}
	}
	workspace := filepath.Join(s.cfg.BackupDir, ".restore-"+uuid.New().String())
	if err := os.MkdirAll(workspace, 0o700); err != nil {
		return err
	}
	defer os.RemoveAll(workspace)
	sqlGzipPath := path
	if job.Kind == KindFull {
		sqlGzipPath, err = extractSQLFromArchive(path, workspace)
		if err != nil {
			return &serviceError{Code: "RESTORE_ARCHIVE_INVALID", Message: "Paket full backup tidak valid."}
		}
	}
	return s.restoreDatabaseFromGzip(sqlGzipPath, workspace)
}

func (s *Service) restoreDatabaseFromGzip(sqlGzipPath, workspace string) error {
	credentialFile, err := os.CreateTemp(workspace, "mysql-restore-*.cnf")
	if err != nil {
		return &serviceError{Code: "RESTORE_CREDENTIAL_FILE_FAILED", Message: "File kredensial restore gagal dibuat."}
	}
	credentialPath := credentialFile.Name()
	defer os.Remove(credentialPath)
	_ = credentialFile.Chmod(0o600)
	if _, err := credentialFile.WriteString(fmt.Sprintf("[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\ndefault-character-set=utf8mb4\n", s.cfg.DBHost, s.cfg.DBPort, s.cfg.DBUser, s.cfg.DBPass)); err != nil {
		_ = credentialFile.Close()
		return &serviceError{Code: "RESTORE_CREDENTIAL_FILE_FAILED", Message: "File kredensial restore gagal ditulis."}
	}
	if err := credentialFile.Close(); err != nil {
		return &serviceError{Code: "RESTORE_CREDENTIAL_FILE_FAILED", Message: "File kredensial restore gagal ditutup."}
	}
	input, err := os.Open(sqlGzipPath)
	if err != nil {
		return err
	}
	decompressed, err := gzip.NewReader(input)
	if err != nil {
		_ = input.Close()
		return &serviceError{Code: "RESTORE_GZIP_INVALID", Message: "SQL backup tidak valid."}
	}
	defer input.Close()
	defer decompressed.Close()
	ctx, cancel := context.WithTimeout(context.Background(), s.cfg.BackupJobTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, s.cfg.BackupRestoreBinary, "--defaults-extra-file="+credentialPath, "--binary-mode")
	cmd.Stdin = decompressed
	cmd.Stderr = &limitedBuffer{max: 8192}
	if err := cmd.Run(); err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return &serviceError{Code: "RESTORE_TIMEOUT", Message: "Restore database melewati batas waktu."}
		}
		if errors.Is(err, exec.ErrNotFound) {
			return &serviceError{Code: "RESTORE_TOOL_MISSING", Message: "Tool mysql tidak tersedia di runtime server."}
		}
		return &serviceError{Code: "RESTORE_IMPORT_FAILED", Message: "Import database gagal."}
	}
	return nil
}

func (s *Service) verifyRestoredDatabase(job models.BackupJob) error {
	var manifest Manifest
	if job.ManifestJSON != nil {
		if err := json.Unmarshal([]byte(*job.ManifestJSON), &manifest); err != nil {
			return &serviceError{Code: "RESTORE_MANIFEST_INVALID", Message: "Manifest restore tidak valid."}
		}
	}
	for _, table := range []string{"users", "attendance_logs", "schema_migrations"} {
		var count int64
		if err := s.db.Table("`" + table + "`").Count(&count).Error; err != nil {
			return err
		}
		if expected, ok := manifest.Tables[table]; ok && count != expected {
			return &serviceError{Code: "RESTORE_ROW_COUNT_MISMATCH", Message: "Jumlah record hasil restore tidak sesuai manifest."}
		}
	}
	return nil
}

func (s *Service) setMaintenance(enabled bool, reason, restoreID string) error {
	state := models.MaintenanceState{ID: 1, Enabled: enabled, Reason: reason}
	if restoreID != "" {
		state.RestoreJobID = &restoreID
	}
	return s.db.Where("id = ?", 1).Assign(state).FirstOrCreate(&state).Error
}

func (s *Service) failRestore(id, code, message string) {
	_ = s.db.Model(&models.BackupRestoreJob{}).Where("id = ?", id).Updates(map[string]any{"status": "failed", "error_code": code, "error_message": message, "finished_at": time.Now().UTC()})
}

func (s *Service) MaintenanceMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var state models.MaintenanceState
		if err := s.db.First(&state, 1).Error; err != nil || !state.Enabled {
			return c.Next()
		}
		path := c.Path()
		if path == "/health/live" || path == "/health/ready" || path == "/version" || ((strings.HasPrefix(path, "/api/v1/admin/backups") || strings.HasPrefix(path, "/api/v1/admin/restores")) && c.Method() == fiber.MethodGet) {
			return c.Next()
		}
		return httpx.Error(c, fiber.StatusServiceUnavailable, "RESTORE_MAINTENANCE", "Sistem sedang dalam maintenance untuk pemulihan database. Silakan coba lagi setelah proses selesai.")
	}
}

func extractSQLFromArchive(archivePath, workspace string) (string, error) {
	input, err := os.Open(archivePath)
	if err != nil {
		return "", err
	}
	defer input.Close()
	gzipReader, err := gzip.NewReader(input)
	if err != nil {
		return "", err
	}
	defer gzipReader.Close()
	tarReader := tar.NewReader(gzipReader)
	outputPath := filepath.Join(workspace, "database.sql.gz")
	var output *os.File
	for {
		header, err := tarReader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return "", err
		}
		if header.Name != "database.sql.gz" || header.Typeflag != tar.TypeReg {
			continue
		}
		output, err = os.OpenFile(outputPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
		if err != nil {
			return "", err
		}
		if _, err := io.CopyN(output, tarReader, header.Size); err != nil {
			_ = output.Close()
			return "", err
		}
		if err := output.Close(); err != nil {
			return "", err
		}
		break
	}
	if output == nil {
		return "", errors.New("database.sql.gz tidak ditemukan")
	}
	if err := validateGzip(outputPath); err != nil {
		return "", err
	}
	return outputPath, nil
}

func validateFullArchive(archivePath, workspace string) error {
	input, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	decompressed, err := gzip.NewReader(input)
	if err != nil {
		_ = input.Close()
		return err
	}
	tarReader := tar.NewReader(decompressed)
	var manifestBytes, checksumsBytes []byte
	for {
		header, nextErr := tarReader.Next()
		if errors.Is(nextErr, io.EOF) {
			break
		}
		if nextErr != nil {
			_ = decompressed.Close()
			_ = input.Close()
			return nextErr
		}
		if header.Typeflag != tar.TypeReg || header.Size < 0 || header.Size > 4*1024*1024 {
			continue
		}
		switch header.Name {
		case "manifest.json":
			manifestBytes, err = io.ReadAll(io.LimitReader(tarReader, header.Size))
		case "checksums.sha256":
			checksumsBytes, err = io.ReadAll(io.LimitReader(tarReader, header.Size))
		}
		if err != nil {
			_ = decompressed.Close()
			_ = input.Close()
			return err
		}
	}
	if err := decompressed.Close(); err != nil {
		_ = input.Close()
		return err
	}
	if err := input.Close(); err != nil {
		return err
	}
	if len(manifestBytes) == 0 || len(checksumsBytes) == 0 {
		return errors.New("manifest atau checksum full backup tidak ditemukan")
	}
	var manifest Manifest
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil || manifest.Kind != KindFull || manifest.PayloadFile != "database.sql.gz" {
		return errors.New("manifest full backup tidak valid")
	}
	sqlPath, err := extractSQLFromArchive(archivePath, workspace)
	if err != nil {
		return err
	}
	expectedHash := strings.Fields(string(checksumsBytes))
	if len(expectedHash) < 1 || len(expectedHash[0]) != sha256.Size*2 || !isHex(expectedHash[0]) {
		return errors.New("checksum full backup tidak valid")
	}
	actualHash, err := fileSHA256(sqlPath)
	if err != nil || !strings.EqualFold(actualHash, expectedHash[0]) {
		return errors.New("checksum payload full backup tidak sesuai")
	}
	if manifest.PayloadSHA256 != "" && !strings.EqualFold(manifest.PayloadSHA256, actualHash) {
		return errors.New("checksum manifest full backup tidak sesuai")
	}
	return nil
}

func fullArchiveManifest(archivePath string) (string, error) {
	input, err := os.Open(archivePath)
	if err != nil {
		return "", err
	}
	decompressed, err := gzip.NewReader(input)
	if err != nil {
		_ = input.Close()
		return "", err
	}
	tarReader := tar.NewReader(decompressed)
	var manifestBytes []byte
	for {
		header, nextErr := tarReader.Next()
		if errors.Is(nextErr, io.EOF) {
			break
		}
		if nextErr != nil {
			_ = decompressed.Close()
			_ = input.Close()
			return "", nextErr
		}
		if header.Name == "manifest.json" && header.Typeflag == tar.TypeReg && header.Size >= 0 && header.Size <= 4*1024*1024 {
			manifestBytes, err = io.ReadAll(io.LimitReader(tarReader, header.Size))
			if err != nil {
				_ = decompressed.Close()
				_ = input.Close()
				return "", err
			}
			break
		}
	}
	closeErr := decompressed.Close()
	inputErr := input.Close()
	if closeErr != nil || inputErr != nil || len(manifestBytes) == 0 {
		return "", errors.New("manifest full backup tidak ditemukan")
	}
	var manifest Manifest
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil || manifest.Kind != KindFull {
		return "", errors.New("manifest full backup tidak valid")
	}
	return string(manifestBytes), nil
}

func (s *Service) runJob(id string) {
	now := time.Now().UTC()
	if err := s.db.Model(&models.BackupJob{}).Where("id = ?", id).Updates(map[string]any{"status": StatusRunning, "started_at": now}).Error; err != nil {
		return
	}
	var job models.BackupJob
	if err := s.db.Where("id = ?", id).First(&job).Error; err != nil {
		return
	}

	workspace := filepath.Join(s.cfg.BackupDir, ".work-"+id)
	if err := os.MkdirAll(workspace, 0o700); err != nil {
		s.failJob(id, "BACKUP_WORKSPACE_FAILED", "Direktori kerja backup tidak dapat dibuat.")
		return
	}
	defer os.RemoveAll(workspace)

	ctx, cancel := context.WithTimeout(context.Background(), s.cfg.BackupJobTimeout)
	defer cancel()
	dumpPath := filepath.Join(workspace, "database.sql.gz")
	if err := s.dumpDatabase(ctx, dumpPath); err != nil {
		var typed *serviceError
		if errors.As(err, &typed) {
			s.failJob(id, typed.Code, typed.Message)
		} else {
			s.failJob(id, "BACKUP_DUMP_FAILED", "Database gagal dibackup.")
		}
		return
	}
	if err := validateGzip(dumpPath); err != nil {
		s.failJob(id, "BACKUP_GZIP_INVALID", "Hasil SQL backup tidak valid.")
		return
	}

	payloadStat, err := os.Stat(dumpPath)
	if err != nil {
		s.failJob(id, "BACKUP_FILE_FAILED", "File hasil backup tidak dapat dibaca.")
		return
	}
	payloadHash, err := fileSHA256(dumpPath)
	if err != nil {
		s.failJob(id, "BACKUP_CHECKSUM_FAILED", "Checksum backup gagal dibuat.")
		return
	}
	manifest, manifestJSON, err := s.buildManifest(job, payloadStat.Size(), payloadHash)
	if err != nil {
		s.failJob(id, "BACKUP_MANIFEST_FAILED", "Manifest backup gagal dibuat.")
		return
	}
	_ = manifest

	finalName := fmt.Sprintf("geopresensi-%s-%s-%s", job.Kind, now.Format("20060102-150405"), job.ID[:8])
	finalPath := filepath.Join(s.cfg.BackupDir, finalName+".sql.gz")
	if job.Kind == KindFull {
		finalName += ".full.tar.gz"
		finalPath = filepath.Join(s.cfg.BackupDir, finalName)
		archivePath := filepath.Join(workspace, "backup.full.tar.gz")
		if err := createFullArchive(archivePath, dumpPath, manifestJSON); err != nil {
			s.failJob(id, "BACKUP_ARCHIVE_FAILED", "Paket full backup gagal dibuat.")
			return
		}
		if err := validateFullArchive(archivePath, workspace); err != nil {
			s.failJob(id, "BACKUP_ARCHIVE_INVALID", "Paket full backup tidak valid.")
			return
		}
		finalPath = filepath.Join(s.cfg.BackupDir, finalName)
		if err := atomicMove(archivePath, finalPath); err != nil {
			s.failJob(id, "BACKUP_FILE_FAILED", "File full backup gagal disimpan.")
			return
		}
	} else if err := atomicMove(dumpPath, finalPath); err != nil {
		s.failJob(id, "BACKUP_FILE_FAILED", "File SQL backup gagal disimpan.")
		return
	}

	stat, err := os.Stat(finalPath)
	if err != nil || stat.Size() > s.cfg.BackupMaxSizeBytes {
		_ = os.Remove(finalPath)
		s.failJob(id, "BACKUP_SIZE_LIMIT", "Ukuran backup melebihi batas yang diizinkan.")
		return
	}
	finalHash, err := fileSHA256(finalPath)
	if err != nil {
		_ = os.Remove(finalPath)
		s.failJob(id, "BACKUP_CHECKSUM_FAILED", "Checksum file backup gagal dibuat.")
		return
	}
	finished := time.Now().UTC()
	name := finalName
	path := finalPath
	sha := finalHash
	manifestValue := manifestJSON
	if err := s.db.Model(&models.BackupJob{}).Where("id = ?", id).Updates(map[string]any{
		"status": StatusSuccess, "file_name": name, "file_path": path, "file_size": stat.Size(), "sha256": sha,
		"manifest_json": manifestValue, "finished_at": finished,
	}).Error; err != nil {
		_ = os.Remove(finalPath)
		s.failJob(id, "BACKUP_METADATA_FAILED", "Metadata backup gagal disimpan.")
	}
}

func (s *Service) dumpDatabase(ctx context.Context, outputPath string) error {
	if s.cfg.DBDriver != "mysql" {
		return ErrBackupUnsupported
	}
	workspace := filepath.Dir(outputPath)
	credentialFile, err := os.CreateTemp(workspace, "mysql-credentials-*.cnf")
	if err != nil {
		return &serviceError{Code: "BACKUP_CREDENTIAL_FILE_FAILED", Message: "File kredensial sementara gagal dibuat."}
	}
	credentialPath := credentialFile.Name()
	defer os.Remove(credentialPath)
	_ = credentialFile.Chmod(0o600)
	content := fmt.Sprintf("[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\ndefault-character-set=utf8mb4\n", s.cfg.DBHost, s.cfg.DBPort, s.cfg.DBUser, s.cfg.DBPass)
	if _, err := credentialFile.WriteString(content); err != nil {
		_ = credentialFile.Close()
		return &serviceError{Code: "BACKUP_CREDENTIAL_FILE_FAILED", Message: "File kredensial sementara gagal ditulis."}
	}
	if err := credentialFile.Close(); err != nil {
		return &serviceError{Code: "BACKUP_CREDENTIAL_FILE_FAILED", Message: "File kredensial sementara gagal ditutup."}
	}

	args := []string{
		"--defaults-extra-file=" + credentialPath,
		"--single-transaction", "--quick", "--routines", "--events", "--triggers", "--hex-blob",
		"--no-tablespaces", "--set-gtid-purged=OFF", "--default-character-set=utf8mb4", "--databases", s.cfg.DBName,
	}
	cmd := exec.CommandContext(ctx, s.cfg.BackupDumpBinary, args...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return &serviceError{Code: "BACKUP_DUMP_FAILED", Message: "Output database backup gagal dibuka."}
	}
	stderr := &limitedBuffer{max: 8192}
	cmd.Stderr = stderr
	if err := cmd.Start(); err != nil {
		if errors.Is(err, exec.ErrNotFound) {
			return &serviceError{Code: "BACKUP_TOOL_MISSING", Message: "Tool mysqldump tidak tersedia di runtime server."}
		}
		return &serviceError{Code: "BACKUP_DUMP_FAILED", Message: "Proses database backup tidak dapat dimulai."}
	}
	file, err := os.Create(outputPath)
	if err != nil {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		return &serviceError{Code: "BACKUP_FILE_FAILED", Message: "File backup tidak dapat dibuat."}
	}
	limited := &limitedWriter{writer: file, max: s.cfg.BackupMaxSizeBytes}
	gzipWriter := gzip.NewWriter(limited)
	_, copyErr := io.Copy(gzipWriter, stdout)
	if copyErr != nil {
		_ = cmd.Process.Kill()
	}
	closeErr := gzipWriter.Close()
	if closeErr != nil {
		_ = cmd.Process.Kill()
	}
	fileCloseErr := file.Close()
	waitErr := cmd.Wait()
	if copyErr != nil || closeErr != nil || fileCloseErr != nil {
		return &serviceError{Code: "BACKUP_SIZE_LIMIT", Message: "Ukuran database backup melebihi batas yang diizinkan."}
	}
	if ctx.Err() != nil {
		return &serviceError{Code: "BACKUP_TIMEOUT", Message: "Proses database backup melewati batas waktu."}
	}
	if waitErr != nil {
		return &serviceError{Code: "BACKUP_DUMP_FAILED", Message: "Database gagal dibackup. Periksa koneksi database dan log job."}
	}
	return nil
}

func (s *Service) buildManifest(job models.BackupJob, payloadSize int64, payloadHash string) (Manifest, string, error) {
	manifest := Manifest{
		BackupID: job.ID, Kind: job.Kind, CreatedAt: time.Now().In(appLocation(s.cfg)).Format(time.RFC3339),
		AppVersion: s.cfg.AppVersion, DatabaseEngine: "mysql", Timezone: s.cfg.AppTimezone,
		PayloadFile: "database.sql.gz", PayloadSize: payloadSize, PayloadSHA256: payloadHash, FileSize: payloadSize, SHA256: payloadHash,
		Tables: map[string]int64{},
	}
	var version string
	if err := s.db.Raw("SELECT VERSION()").Scan(&version).Error; err != nil {
		return Manifest{}, "", err
	}
	manifest.DatabaseVersion = version
	var migrations []string
	if err := s.db.Table("schema_migrations").Order("version ASC").Pluck("version", &migrations).Error; err != nil {
		return Manifest{}, "", err
	}
	manifest.SchemaMigrations = migrations
	var tables []string
	if err := s.db.Raw("SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY TABLE_NAME").Scan(&tables).Error; err != nil {
		return Manifest{}, "", err
	}
	for _, table := range tables {
		if strings.TrimSpace(table) == "" {
			continue
		}
		var count int64
		quoted := "`" + strings.ReplaceAll(table, "`", "``") + "`"
		if err := s.db.Table(quoted).Count(&count).Error; err != nil {
			return Manifest{}, "", err
		}
		manifest.Tables[table] = count
	}
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return Manifest{}, "", err
	}
	return manifest, string(data), nil
}

func (s *Service) failJob(id, code, message string) {
	now := time.Now().UTC()
	_ = s.db.Model(&models.BackupJob{}).Where("id = ?", id).Updates(map[string]any{"status": StatusFailed, "error_code": code, "error_message": message, "finished_at": now})
}

func (s *Service) cleanupExpired() error {
	var jobs []models.BackupJob
	if err := s.db.Where("status = ? AND expires_at < ?", StatusSuccess, time.Now().UTC()).Find(&jobs).Error; err != nil {
		return err
	}
	for _, job := range jobs {
		_ = s.expireJob(job)
	}
	return nil
}

func (s *Service) expireJob(job models.BackupJob) error {
	if job.FilePath != nil {
		if path, err := s.safePath(*job.FilePath); err == nil {
			_ = os.Remove(path)
		}
	}
	return s.db.Model(&models.BackupJob{}).Where("id = ? AND status = ?", job.ID, StatusSuccess).Updates(map[string]any{"status": StatusExpired, "file_path": nil, "file_name": nil}).Error
}

func (s *Service) safePath(path string) (string, error) {
	base, err := filepath.Abs(s.cfg.BackupDir)
	if err != nil {
		return "", err
	}
	target, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(base, target)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return "", &serviceError{Code: "BACKUP_PATH_INVALID", Message: "Lokasi file backup tidak valid."}
	}
	return target, nil
}

func appLocation(cfg config.Config) *time.Location {
	location, err := time.LoadLocation(cfg.AppTimezone)
	if err != nil {
		return time.FixedZone("WIB", 7*60*60)
	}
	return location
}

func fileSHA256(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func validateGzip(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	reader, err := gzip.NewReader(file)
	if err != nil {
		return err
	}
	defer reader.Close()
	_, err = io.Copy(io.Discard, reader)
	if err != nil {
		return err
	}
	return reader.Close()
}

func createFullArchive(output, dumpPath, manifest string) error {
	file, err := os.Create(output)
	if err != nil {
		return err
	}
	gzipWriter := gzip.NewWriter(file)
	tarWriter := tar.NewWriter(gzipWriter)
	writeFile := func(name string, mode int64, data []byte) error {
		header := &tar.Header{Name: name, Mode: mode, Size: int64(len(data)), ModTime: time.Now().UTC()}
		if err := tarWriter.WriteHeader(header); err != nil {
			return err
		}
		_, err := tarWriter.Write(data)
		return err
	}
	if err := writeFile("manifest.json", 0o600, []byte(manifest)); err != nil {
		_ = file.Close()
		return err
	}
	checksums := ""
	if hash, err := fileSHA256(dumpPath); err == nil {
		checksums = hash + "  database.sql.gz\n"
	} else {
		_ = file.Close()
		return err
	}
	if err := writeFile("checksums.sha256", 0o600, []byte(checksums)); err != nil {
		_ = file.Close()
		return err
	}
	dump, err := os.Open(dumpPath)
	if err != nil {
		_ = file.Close()
		return err
	}
	stat, err := dump.Stat()
	if err != nil {
		_ = dump.Close()
		_ = file.Close()
		return err
	}
	if err := tarWriter.WriteHeader(&tar.Header{Name: "database.sql.gz", Mode: 0o600, Size: stat.Size(), ModTime: time.Now().UTC()}); err != nil {
		_ = dump.Close()
		_ = file.Close()
		return err
	}
	if _, err := io.Copy(tarWriter, dump); err != nil {
		_ = dump.Close()
		_ = file.Close()
		return err
	}
	_ = dump.Close()
	if err := tarWriter.Close(); err != nil {
		_ = file.Close()
		return err
	}
	if err := gzipWriter.Close(); err != nil {
		_ = file.Close()
		return err
	}
	return file.Close()
}

func atomicMove(source, target string) error {
	if err := os.Remove(target); err != nil && !os.IsNotExist(err) {
		return err
	}
	return os.Rename(source, target)
}

type limitedWriter struct {
	writer io.Writer
	n      int64
	max    int64
}

func (w *limitedWriter) Write(p []byte) (int, error) {
	if w.n+int64(len(p)) > w.max {
		return 0, &serviceError{Code: "BACKUP_SIZE_LIMIT", Message: "Ukuran backup melebihi batas yang diizinkan."}
	}
	n, err := w.writer.Write(p)
	w.n += int64(n)
	return n, err
}

type limitedBuffer struct {
	data []byte
	max  int
}

func (b *limitedBuffer) Write(p []byte) (int, error) {
	originalLength := len(p)
	if len(b.data) < b.max {
		remaining := b.max - len(b.data)
		if len(p) > remaining {
			p = p[:remaining]
		}
		b.data = append(b.data, p...)
	}
	return originalLength, nil
}

func errorResponse(c *fiber.Ctx, err error) error {
	var typed *serviceError
	if errors.As(err, &typed) {
		status := fiber.StatusBadRequest
		if typed.Code == ErrBackupBusy.Code {
			status = fiber.StatusConflict
		}
		return fiber.NewError(status, typed.Message)
	}
	return err
}
