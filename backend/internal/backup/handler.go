package backup

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/auth"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/config"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/httpx"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
	"gorm.io/gorm"
)

type Handler struct {
	service *Service
	db      *gorm.DB
	cfg     config.Config
	jwt     *auth.JWTManager
}

func NewHandler(service *Service, db *gorm.DB, cfg config.Config, jwt *auth.JWTManager) *Handler {
	return &Handler{service: service, db: db, cfg: cfg, jwt: jwt}
}

type createRequest struct {
	Kind           string `json:"kind"`
	IdempotencyKey string `json:"idempotencyKey"`
}

func (h *Handler) RegisterRoutes(app fiber.Router) {
	protected := auth.RequireActiveUser(h.db, h.jwt)
	admin := auth.RequireRoles("admin")

	app.Get("/api/v1/admin/backups", protected, admin, h.list)
	app.Post("/api/v1/admin/backups", protected, admin, h.create)
	app.Get("/api/v1/admin/backups/:id/download", protected, admin, h.download)
	app.Get("/api/v1/admin/backups/:id/verify", protected, admin, h.verify)
	app.Get("/api/v1/admin/backups/:id", protected, admin, h.get)
	app.Post("/api/v1/admin/backups/:id/restore", protected, admin, h.restore)
	app.Get("/api/v1/admin/restores", protected, admin, h.listRestores)
	app.Get("/api/v1/admin/restores/:id", protected, admin, h.restoreStatus)
	app.Post("/api/v1/admin/restore-uploads", protected, admin, h.startRestoreUpload)
	app.Put("/api/v1/admin/restore-uploads/:id", protected, admin, h.appendRestoreUpload)

	app.Post("/api/v1/integrations/backups/jobs", h.n8nAuth, h.createIntegration)
	app.Get("/api/v1/integrations/backups/jobs/:id/download", h.n8nAuth, h.downloadIntegration)
	app.Get("/api/v1/integrations/backups/jobs/:id", h.n8nAuth, h.getIntegration)
}

func (h *Handler) list(c *fiber.Ctx) error {
	jobs, err := h.service.ListJobs(c.QueryInt("limit", 50))
	if err != nil {
		return err
	}
	items := make([]fiber.Map, 0, len(jobs))
	for _, job := range jobs {
		items = append(items, publicJob(job))
	}
	return httpx.Success(c, "Daftar backup berhasil diambil", items)
}

func (h *Handler) create(c *fiber.Ctx) error {
	claims, err := claimsFromContext(c)
	if err != nil {
		return err
	}
	var input createRequest
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return httpx.Error(c, fiber.StatusBadRequest, "VALIDATION_ERROR", "Payload backup tidak valid")
	}
	job, err := h.service.StartJob(strings.ToLower(strings.TrimSpace(input.Kind)), "admin", &claims.UserID, strings.TrimSpace(input.IdempotencyKey))
	if err != nil {
		return serviceHTTPError(c, err)
	}
	h.audit(c, "backup_requested", &claims.UserID, map[string]any{"backup_id": job.ID, "kind": job.Kind, "source": "admin"})
	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"success": true, "message": "Job backup dibuat", "data": publicJob(job)})
}

func (h *Handler) get(c *fiber.Ctx) error {
	job, err := h.service.GetJob(c.Params("id"))
	if err != nil {
		return serviceHTTPError(c, err)
	}
	return httpx.Success(c, "Status backup berhasil diambil", publicJob(job))
}

func (h *Handler) verify(c *fiber.Ctx) error {
	job, err := h.service.VerifyJob(c.Params("id"))
	if err != nil {
		return serviceHTTPError(c, err)
	}
	return httpx.Success(c, "Checksum backup valid", publicJob(job))
}

func (h *Handler) restore(c *fiber.Ctx) error {
	claims, err := claimsFromContext(c)
	if err != nil {
		return err
	}
	var input struct {
		ConfirmationPhrase string `json:"confirmationPhrase"`
	}
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return httpx.Error(c, fiber.StatusBadRequest, "VALIDATION_ERROR", "Payload restore tidak valid")
	}
	job, err := h.service.StartRestore(c.Params("id"), input.ConfirmationPhrase, claims.UserID)
	if err != nil {
		return serviceHTTPError(c, err)
	}
	h.audit(c, "backup_restore_requested", &claims.UserID, map[string]any{"restore_id": job.ID, "backup_id": job.BackupJobID})
	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"success": true, "message": "Job restore dibuat", "data": publicRestore(job)})
}

func (h *Handler) restoreStatus(c *fiber.Ctx) error {
	job, err := h.service.GetRestore(c.Params("id"))
	if err != nil {
		return serviceHTTPError(c, err)
	}
	return httpx.Success(c, "Status restore berhasil diambil", publicRestore(job))
}

func (h *Handler) listRestores(c *fiber.Ctx) error {
	restores, err := h.service.ListRestores(c.QueryInt("limit", 50))
	if err != nil {
		return err
	}
	items := make([]fiber.Map, 0, len(restores))
	for _, restore := range restores {
		items = append(items, publicRestore(restore))
	}
	return httpx.Success(c, "Riwayat restore berhasil diambil", items)
}

func (h *Handler) startRestoreUpload(c *fiber.Ctx) error {
	claims, err := claimsFromContext(c)
	if err != nil {
		return err
	}
	var input struct {
		FileName       string `json:"fileName"`
		ExpectedSize   int64  `json:"expectedSize"`
		ExpectedSHA256 string `json:"expectedSha256"`
	}
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return httpx.Error(c, fiber.StatusBadRequest, "VALIDATION_ERROR", "Payload upload restore tidak valid")
	}
	upload, err := h.service.StartUpload(input.FileName, input.ExpectedSize, strings.TrimSpace(input.ExpectedSHA256), claims.UserID)
	if err != nil {
		return serviceHTTPError(c, err)
	}
	h.audit(c, "backup_restore_upload_started", &claims.UserID, map[string]any{"upload_id": upload.ID, "file_name": upload.FileName, "expected_size": upload.ExpectedSize})
	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"success": true, "message": "Upload restore dibuat", "data": publicUpload(upload)})
}

func (h *Handler) appendRestoreUpload(c *fiber.Ctx) error {
	offset, err := strconv.ParseInt(strings.TrimSpace(c.Get("X-Chunk-Offset")), 10, 64)
	if err != nil || offset < 0 {
		return httpx.Error(c, fiber.StatusBadRequest, "RESTORE_UPLOAD_OFFSET", "Header X-Chunk-Offset tidak valid")
	}
	result, err := h.service.AppendUpload(c.Params("id"), offset, c.Body())
	if err != nil {
		return serviceHTTPError(c, err)
	}
	data := fiber.Map{"upload": publicUpload(result.Upload)}
	if result.Job != nil {
		data["backup"] = publicJob(*result.Job)
	}
	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"success": true, "message": "Chunk upload restore diterima", "data": data})
}

func (h *Handler) download(c *fiber.Ctx) error {
	file, job, err := h.service.OpenArtifact(c.Params("id"))
	if err != nil {
		return serviceHTTPError(c, err)
	}
	defer file.Close()
	c.Set(fiber.HeaderContentType, contentType(job))
	c.Set(fiber.HeaderContentDisposition, fmt.Sprintf("attachment; filename=%q", safeFilename(valueString(job.FileName))))
	c.Set("X-Backup-ID", job.ID)
	if job.SHA256 != nil {
		c.Set("X-Backup-SHA256", *job.SHA256)
	}
	return c.SendStream(file, int(job.FileSize))
}

func (h *Handler) createIntegration(c *fiber.Ctx) error {
	var input createRequest
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return httpx.Error(c, fiber.StatusBadRequest, "VALIDATION_ERROR", "Payload backup tidak valid")
	}
	job, err := h.service.StartJob(strings.ToLower(strings.TrimSpace(input.Kind)), "n8n", nil, strings.TrimSpace(input.IdempotencyKey))
	if err != nil {
		return serviceHTTPError(c, err)
	}
	h.audit(c, "backup_requested", nil, map[string]any{"backup_id": job.ID, "kind": job.Kind, "source": "n8n"})
	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"success": true, "message": "Job backup dibuat", "data": publicJob(job)})
}

func (h *Handler) getIntegration(c *fiber.Ctx) error {
	job, err := h.service.GetJob(c.Params("id"))
	if err != nil {
		return serviceHTTPError(c, err)
	}
	return httpx.Success(c, "Status backup berhasil diambil", publicJob(job))
}

func (h *Handler) downloadIntegration(c *fiber.Ctx) error {
	return h.download(c)
}

func (h *Handler) n8nAuth(c *fiber.Ctx) error {
	provided := strings.TrimSpace(c.Get("X-API-Key"))
	expected := strings.TrimSpace(h.cfg.BackupN8NAPIKey)
	if expected == "" || provided == "" || len(expected) != len(provided) || subtle.ConstantTimeCompare([]byte(expected), []byte(provided)) != 1 {
		return httpx.Error(c, fiber.StatusUnauthorized, "BACKUP_INTEGRATION_UNAUTHORIZED", "API key backup tidak valid")
	}
	return c.Next()
}

func claimsFromContext(c *fiber.Ctx) (*auth.Claims, error) {
	claims, ok := c.Locals("authClaims").(*auth.Claims)
	if !ok || claims == nil {
		return nil, fiber.ErrUnauthorized
	}
	return claims, nil
}

func publicJob(job models.BackupJob) fiber.Map {
	result := fiber.Map{
		"id": job.ID, "kind": job.Kind, "status": job.Status, "source": job.Source,
		"fileName": job.FileName, "fileSize": job.FileSize, "sha256": job.SHA256,
		"requestedAt": job.RequestedAt, "startedAt": job.StartedAt, "finishedAt": job.FinishedAt,
		"expiresAt": job.ExpiresAt, "errorCode": job.ErrorCode, "errorMessage": job.ErrorMessage,
	}
	if job.ManifestJSON != nil {
		var manifest any
		if json.Unmarshal([]byte(*job.ManifestJSON), &manifest) == nil {
			result["manifest"] = manifest
		}
	}
	return result
}

func publicRestore(job models.BackupRestoreJob) fiber.Map {
	return fiber.Map{
		"id": job.ID, "backupId": job.BackupJobID, "status": job.Status,
		"preRestoreBackupId": job.PreRestoreBackup, "errorCode": job.ErrorCode,
		"errorMessage": job.ErrorMessage, "startedAt": job.StartedAt, "finishedAt": job.FinishedAt, "createdAt": job.CreatedAt,
	}
}

func publicUpload(upload models.BackupUpload) fiber.Map {
	return fiber.Map{
		"id": upload.ID, "fileName": upload.FileName, "expectedSize": upload.ExpectedSize,
		"receivedSize": upload.ReceivedSize, "expectedSha256": upload.ExpectedSHA256,
		"status": upload.Status, "expiresAt": upload.ExpiresAt,
	}
}

func contentType(job models.BackupJob) string {
	if job.Kind == KindFull {
		return "application/gzip"
	}
	return "application/gzip"
}

func safeFilename(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "backup.bin"
	}
	value = strings.ReplaceAll(value, "\\", "_")
	value = strings.ReplaceAll(value, "/", "_")
	return value
}

func valueString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func serviceHTTPError(c *fiber.Ctx, err error) error {
	var typed *serviceError
	if errors.As(err, &typed) {
		status := fiber.StatusBadRequest
		switch typed.Code {
		case "BACKUP_BUSY":
			status = fiber.StatusConflict
		case "BACKUP_NOT_FOUND", "BACKUP_FILE_MISSING", "RESTORE_UPLOAD_NOT_FOUND":
			status = fiber.StatusNotFound
		case "BACKUP_NOT_READY", "RESTORE_UPLOAD_CLOSED", "RESTORE_UPLOAD_OFFSET", "RESTORE_UPLOAD_EXPIRED":
			status = fiber.StatusConflict
		case "BACKUP_MYSQL_REQUIRED", "BACKUP_TOOL_MISSING", "RESTORE_TOOL_MISSING":
			status = fiber.StatusServiceUnavailable
		case "RESTORE_UPLOAD_FAILED", "RESTORE_CHECKSUM_FAILED", "RESTORE_ARCHIVE_INVALID", "RESTORE_GZIP_INVALID":
			status = fiber.StatusUnprocessableEntity
		}
		return httpx.Error(c, status, typed.Code, typed.Message)
	}
	return err
}

func (h *Handler) audit(c *fiber.Ctx, event string, userID *uint, details map[string]any) {
	data, _ := json.Marshal(details)
	requestID := c.Get("X-Request-ID")
	_ = h.db.Create(&models.SecurityEvent{Event: event, UserID: userID, IPAddress: c.IP(), UserAgent: c.Get(fiber.HeaderUserAgent), RequestID: requestID, Details: string(data)}).Error
}
