package backup

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
	"gorm.io/gorm"
)

const UploadChunkSize int64 = 8 * 1024 * 1024

type UploadResult struct {
	Upload models.BackupUpload
	Job    *models.BackupJob
}

func (s *Service) StartUpload(fileName string, expectedSize int64, expectedSHA256 string, requestedBy uint) (models.BackupUpload, error) {
	if !s.cfg.BackupRestoreEnabled {
		return models.BackupUpload{}, &serviceError{Code: "BACKUP_RESTORE_DISABLED", Message: "Restore production belum diaktifkan."}
	}
	fileName = strings.TrimSpace(fileName)
	if fileName == "." || fileName == "" || filepath.Base(fileName) != fileName || strings.ContainsAny(fileName, "\\/") || (!strings.HasSuffix(fileName, ".sql.gz") && !strings.HasSuffix(fileName, ".full.tar.gz")) {
		return models.BackupUpload{}, &serviceError{Code: "RESTORE_FILE_INVALID", Message: "File restore harus berformat .sql.gz atau .full.tar.gz."}
	}
	if expectedSize <= 0 || expectedSize > s.cfg.BackupMaxSizeBytes {
		return models.BackupUpload{}, &serviceError{Code: "RESTORE_SIZE_INVALID", Message: "Ukuran file restore tidak valid atau melebihi batas."}
	}
	if expectedSHA256 != "" && (len(expectedSHA256) != 64 || !isHex(expectedSHA256)) {
		return models.BackupUpload{}, &serviceError{Code: "RESTORE_CHECKSUM_INVALID", Message: "Checksum restore tidak valid."}
	}
	id := uuid.New().String()
	workspace := filepath.Join(s.cfg.BackupDir, ".upload-"+id)
	if err := os.MkdirAll(workspace, 0o700); err != nil {
		return models.BackupUpload{}, &serviceError{Code: "RESTORE_UPLOAD_FAILED", Message: "Direktori upload restore tidak dapat dibuat."}
	}
	path := filepath.Join(workspace, "artifact.partial")
	if err := os.WriteFile(path, nil, 0o600); err != nil {
		_ = os.RemoveAll(workspace)
		return models.BackupUpload{}, &serviceError{Code: "RESTORE_UPLOAD_FAILED", Message: "File upload restore tidak dapat dibuat."}
	}
	upload := models.BackupUpload{ID: id, FileName: fileName, FilePath: path, ExpectedSize: expectedSize, ExpectedSHA256: nil, Status: "uploading", RequestedBy: requestedBy, ExpiresAt: time.Now().UTC().Add(s.cfg.BackupArtifactTTL), CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()}
	if expectedSHA256 != "" {
		upload.ExpectedSHA256 = &expectedSHA256
	}
	if err := s.db.Create(&upload).Error; err != nil {
		_ = os.RemoveAll(workspace)
		return models.BackupUpload{}, err
	}
	return upload, nil
}

func (s *Service) AppendUpload(id string, offset int64, data []byte) (UploadResult, error) {
	s.uploadMu.Lock()
	defer s.uploadMu.Unlock()

	var upload models.BackupUpload
	if err := s.db.Where("id = ?", id).First(&upload).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return UploadResult{}, &serviceError{Code: "RESTORE_UPLOAD_NOT_FOUND", Message: "Upload restore tidak ditemukan."}
		}
		return UploadResult{}, err
	}
	if upload.Status != "uploading" {
		return UploadResult{}, &serviceError{Code: "RESTORE_UPLOAD_CLOSED", Message: "Upload restore sudah ditutup."}
	}
	if time.Now().UTC().After(upload.ExpiresAt) {
		_ = s.expireUpload(upload)
		return UploadResult{}, &serviceError{Code: "RESTORE_UPLOAD_EXPIRED", Message: "Upload restore sudah kedaluwarsa."}
	}
	if offset != upload.ReceivedSize {
		return UploadResult{}, &serviceError{Code: "RESTORE_UPLOAD_OFFSET", Message: fmt.Sprintf("Offset chunk harus %d.", upload.ReceivedSize)}
	}
	if len(data) == 0 || int64(len(data)) > UploadChunkSize || upload.ReceivedSize+int64(len(data)) > upload.ExpectedSize {
		return UploadResult{}, &serviceError{Code: "RESTORE_UPLOAD_CHUNK_INVALID", Message: "Ukuran chunk upload tidak valid."}
	}
	file, err := os.OpenFile(upload.FilePath, os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return UploadResult{}, &serviceError{Code: "RESTORE_UPLOAD_FAILED", Message: "File chunk restore tidak dapat dibuka."}
	}
	written, writeErr := file.Write(data)
	closeErr := file.Close()
	if writeErr != nil || closeErr != nil || written != len(data) {
		return UploadResult{}, &serviceError{Code: "RESTORE_UPLOAD_FAILED", Message: "File chunk restore gagal ditulis."}
	}
	upload.ReceivedSize += int64(written)
	if upload.ReceivedSize < upload.ExpectedSize {
		if err := s.db.Model(&models.BackupUpload{}).Where("id = ?", id).Update("received_size", upload.ReceivedSize).Error; err != nil {
			return UploadResult{}, err
		}
		return UploadResult{Upload: upload}, nil
	}
	return s.completeUpload(upload)
}

func (s *Service) completeUpload(upload models.BackupUpload) (UploadResult, error) {
	hash, err := fileSHA256(upload.FilePath)
	if err != nil {
		return UploadResult{}, &serviceError{Code: "RESTORE_CHECKSUM_FAILED", Message: "Checksum upload restore gagal dibuat."}
	}
	if upload.ExpectedSHA256 != nil && !strings.EqualFold(hash, *upload.ExpectedSHA256) {
		_ = s.failUpload(upload, "RESTORE_CHECKSUM_MISMATCH", "Checksum upload restore tidak sesuai.")
		return UploadResult{}, &serviceError{Code: "RESTORE_CHECKSUM_MISMATCH", Message: "Checksum upload restore tidak sesuai."}
	}
	kind := KindSQL
	var manifestJSON *string
	if strings.HasSuffix(upload.FileName, ".full.tar.gz") {
		kind = KindFull
		workspace := filepath.Dir(upload.FilePath)
		if err := validateFullArchive(upload.FilePath, workspace); err != nil {
			_ = s.failUpload(upload, "RESTORE_ARCHIVE_INVALID", "Paket full backup tidak valid.")
			return UploadResult{}, &serviceError{Code: "RESTORE_ARCHIVE_INVALID", Message: "Paket full backup tidak valid."}
		}
		manifest, err := fullArchiveManifest(upload.FilePath)
		if err != nil {
			_ = s.failUpload(upload, "RESTORE_MANIFEST_INVALID", "Manifest full backup tidak valid.")
			return UploadResult{}, &serviceError{Code: "RESTORE_MANIFEST_INVALID", Message: "Manifest full backup tidak valid."}
		}
		manifestJSON = &manifest
	} else if err := validateGzip(upload.FilePath); err != nil {
		_ = s.failUpload(upload, "RESTORE_GZIP_INVALID", "SQL backup tidak valid.")
		return UploadResult{}, &serviceError{Code: "RESTORE_GZIP_INVALID", Message: "SQL backup tidak valid."}
	}

	finalName := fmt.Sprintf("geopresensi-upload-%s-%s-%s", kind, time.Now().UTC().Format("20060102-150405"), upload.ID[:8])
	ext := ".sql.gz"
	if kind == KindFull {
		ext = ".full.tar.gz"
	}
	finalPath := filepath.Join(s.cfg.BackupDir, finalName+ext)
	if err := atomicMove(upload.FilePath, finalPath); err != nil {
		return UploadResult{}, &serviceError{Code: "RESTORE_UPLOAD_FAILED", Message: "Artifact restore gagal dipindahkan."}
	}
	name := filepath.Base(finalPath)
	filePath := finalPath
	sha := hash
	now := time.Now().UTC()
	job := models.BackupJob{ID: uuid.New().String(), Kind: kind, Status: StatusSuccess, Source: "admin", RequestedBy: &upload.RequestedBy, FileName: &name, FilePath: &filePath, FileSize: upload.ExpectedSize, SHA256: &sha, ManifestJSON: manifestJSON, RequestedAt: now, FinishedAt: &now, ExpiresAt: now.Add(s.cfg.BackupArtifactTTL), CreatedAt: now, UpdatedAt: now}
	if err := s.db.Create(&job).Error; err != nil {
		_ = os.Remove(finalPath)
		return UploadResult{}, err
	}
	_ = s.db.Model(&models.BackupUpload{}).Where("id = ?", upload.ID).Updates(map[string]any{"status": "completed", "received_size": upload.ExpectedSize, "file_path": ""}).Error
	_ = os.RemoveAll(filepath.Dir(upload.FilePath))
	upload.Status = "completed"
	upload.ReceivedSize = upload.ExpectedSize
	upload.FilePath = ""
	return UploadResult{Upload: upload, Job: &job}, nil
}

func (s *Service) cleanupUploads() error {
	var uploads []models.BackupUpload
	if err := s.db.Where("status = ? AND expires_at < ?", "uploading", time.Now().UTC()).Find(&uploads).Error; err != nil {
		return err
	}
	for _, upload := range uploads {
		_ = s.expireUpload(upload)
	}
	return nil
}

func (s *Service) expireUpload(upload models.BackupUpload) error {
	if upload.FilePath != "" {
		_ = os.RemoveAll(filepath.Dir(upload.FilePath))
	}
	return s.db.Model(&models.BackupUpload{}).Where("id = ?", upload.ID).Update("status", "expired").Error
}

func (s *Service) failUpload(upload models.BackupUpload, code, message string) error {
	_ = os.RemoveAll(filepath.Dir(upload.FilePath))
	return s.db.Model(&models.BackupUpload{}).Where("id = ?", upload.ID).Updates(map[string]any{"status": "failed"}).Error
}

func isHex(value string) bool {
	for _, char := range value {
		if !(char >= '0' && char <= '9') && !(char >= 'a' && char <= 'f') && !(char >= 'A' && char <= 'F') {
			return false
		}
	}
	return true
}
