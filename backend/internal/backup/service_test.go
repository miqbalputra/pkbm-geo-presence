package backup

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/gofiber/fiber/v2"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/config"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
	"gorm.io/gorm"
)

func TestCreateFullArchiveContainsManifestChecksumsAndSQL(t *testing.T) {
	workspace := t.TempDir()
	dumpPath := filepath.Join(workspace, "database.sql.gz")
	file, err := os.Create(dumpPath)
	if err != nil {
		t.Fatal(err)
	}
	gzipWriter := gzip.NewWriter(file)
	if _, err := gzipWriter.Write([]byte("CREATE TABLE users (id INT);\n")); err != nil {
		t.Fatal(err)
	}
	if err := gzipWriter.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}

	archivePath := filepath.Join(workspace, "backup.full.tar.gz")
	if err := createFullArchive(archivePath, dumpPath, `{"backupId":"test","kind":"full","payloadFile":"database.sql.gz"}`); err != nil {
		t.Fatal(err)
	}
	if err := validateFullArchive(archivePath, workspace); err != nil {
		t.Fatalf("full archive validation failed: %v", err)
	}
	archive, err := os.Open(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	decompressed, err := gzip.NewReader(archive)
	if err != nil {
		t.Fatal(err)
	}
	entries := map[string]string{}
	reader := tar.NewReader(decompressed)
	for {
		header, nextErr := reader.Next()
		if nextErr == io.EOF {
			break
		}
		if nextErr != nil {
			t.Fatal(nextErr)
		}
		body, readErr := io.ReadAll(reader)
		if readErr != nil {
			t.Fatal(readErr)
		}
		entries[header.Name] = string(body)
	}
	_ = decompressed.Close()
	_ = archive.Close()
	for _, name := range []string{"manifest.json", "checksums.sha256", "database.sql.gz"} {
		if _, ok := entries[name]; !ok {
			t.Fatalf("archive missing %s", name)
		}
	}
	if !strings.Contains(entries["checksums.sha256"], "database.sql.gz") {
		t.Fatalf("checksum manifest does not reference SQL payload: %s", entries["checksums.sha256"])
	}
}

func TestSafePathRejectsOutsideBackupDirectory(t *testing.T) {
	service := NewService(nil, config.Config{BackupDir: t.TempDir()})
	if _, err := service.safePath(filepath.Join(service.cfg.BackupDir, "valid.sql.gz")); err != nil {
		t.Fatalf("valid path rejected: %v", err)
	}
	if _, err := service.safePath(filepath.Join(service.cfg.BackupDir, "..", "secrets.txt")); err == nil {
		t.Fatal("outside path was accepted")
	}
}

func TestN8NAuthRequiresDedicatedConstantTimeKey(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:backup-auth-test?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.BackupJob{}, &models.BackupRestoreJob{}, &models.MaintenanceState{}); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{BackupN8NAPIKey: "backup-key-test", BackupDir: t.TempDir()}
	service := NewService(db, cfg)
	handler := NewHandler(service, db, cfg, nil)
	app := fiber.New()
	app.Get("/protected", handler.n8nAuth, func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusNoContent) })

	request := httptest.NewRequest(http.MethodGet, "/protected", nil)
	response, err := app.Test(request)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("status without key = %d, want 401", response.StatusCode)
	}
}

func TestMaintenanceMiddlewareBlocksWritesButAllowsHealth(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:backup-maintenance-test?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.MaintenanceState{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&models.MaintenanceState{ID: 1, Enabled: true, Reason: "restore"}).Error; err != nil {
		t.Fatal(err)
	}
	service := NewService(db, config.Config{BackupDir: t.TempDir()})
	app := fiber.New()
	app.Use(service.MaintenanceMiddleware())
	app.Get("/health/ready", func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusOK) })
	app.Post("/api/v1/attendance", func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusNoContent) })

	health := httptest.NewRequest(http.MethodGet, "/health/ready", nil)
	healthResponse, err := app.Test(health)
	if err != nil || healthResponse.StatusCode != fiber.StatusOK {
		t.Fatalf("health status = %v, want 200", healthResponse.StatusCode)
	}

	write := httptest.NewRequest(http.MethodPost, "/api/v1/attendance", nil)
	writeResponse, err := app.Test(write)
	if err != nil {
		t.Fatal(err)
	}
	if writeResponse.StatusCode != fiber.StatusServiceUnavailable {
		t.Fatalf("write status = %d, want 503", writeResponse.StatusCode)
	}
}

func TestBackupJobExpiration(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:backup-expiration-test?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.BackupJob{}); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "expired.sql.gz")
	if err := os.WriteFile(path, []byte("expired"), 0o600); err != nil {
		t.Fatal(err)
	}
	job := models.BackupJob{ID: "expired-job", Kind: KindSQL, Status: StatusSuccess, Source: "admin", FilePath: &path, FileName: stringPtr("expired.sql.gz"), ExpiresAt: time.Now().UTC().Add(-time.Minute), RequestedAt: time.Now().UTC()}
	if err := db.Create(&job).Error; err != nil {
		t.Fatal(err)
	}
	service := NewService(db, config.Config{BackupDir: dir})
	if _, err := service.GetJob(job.ID); err != nil {
		t.Fatal(err)
	}
	var stored models.BackupJob
	if err := db.First(&stored, "id = ?", job.ID).Error; err != nil {
		t.Fatal(err)
	}
	if stored.Status != StatusExpired {
		t.Fatalf("status = %s, want expired", stored.Status)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("expired artifact still exists")
	}
}

func TestRestoreUploadValidatesChunksAndChecksum(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:backup-upload-test?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.BackupJob{}, &models.BackupUpload{}); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	cfg := config.Config{BackupDir: dir, BackupRestoreEnabled: true, BackupMaxSizeBytes: 1024 * 1024, BackupArtifactTTL: time.Hour}
	service := NewService(db, cfg)

	var payload strings.Builder
	payload.WriteString("-- GeoPresensi restore fixture\n")
	payload.WriteString("CREATE TABLE users (id INT);\n")
	plain := []byte(payload.String())
	var compressed strings.Builder
	writer := gzip.NewWriter(&compressed)
	if _, err := writer.Write(plain); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	artifact := []byte(compressed.String())
	hash := sha256.Sum256(artifact)
	upload, err := service.StartUpload("restore.sql.gz", int64(len(artifact)), hex.EncodeToString(hash[:]), 1)
	if err != nil {
		t.Fatal(err)
	}
	first := len(artifact) / 2
	if _, err := service.AppendUpload(upload.ID, 1, artifact[:first]); err == nil {
		t.Fatal("invalid offset was accepted")
	}
	partial, err := service.AppendUpload(upload.ID, 0, artifact[:first])
	if err != nil {
		t.Fatal(err)
	}
	if partial.Upload.ReceivedSize != int64(first) || partial.Job != nil {
		t.Fatalf("partial upload = %+v", partial.Upload)
	}
	completed, err := service.AppendUpload(upload.ID, int64(first), artifact[first:])
	if err != nil {
		t.Fatal(err)
	}
	if completed.Job == nil || completed.Job.Status != StatusSuccess || completed.Upload.Status != "completed" {
		t.Fatalf("completed upload = %+v, job = %+v", completed.Upload, completed.Job)
	}
	if _, err := os.Stat(*completed.Job.FilePath); err != nil {
		t.Fatalf("final artifact missing: %v", err)
	}
}

func TestRestoreUploadRejectsPathTraversal(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:backup-upload-path-test?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.BackupUpload{}); err != nil {
		t.Fatal(err)
	}
	service := NewService(db, config.Config{BackupDir: t.TempDir(), BackupRestoreEnabled: true, BackupMaxSizeBytes: 1024, BackupArtifactTTL: time.Hour})
	if _, err := service.StartUpload("../restore.sql.gz", 10, "", 1); err == nil {
		t.Fatal("path traversal upload name was accepted")
	}
}

func stringPtr(value string) *string { return &value }
