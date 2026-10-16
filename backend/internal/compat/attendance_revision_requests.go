package compat

import (
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/httpx"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
)

var (
	errRevisionAttendanceNotFound = errors.New("catatan presensi tidak ditemukan")
	errRevisionPendingExists      = errors.New("masih ada pengajuan revisi yang menunggu untuk tanggal ini")
	errRevisionNoChange           = errors.New("usulan revisi sama dengan catatan presensi saat ini")
	errRevisionAlreadyReviewed    = errors.New("pengajuan revisi sudah diproses")
	errRevisionStale              = errors.New("catatan presensi sudah berubah setelah pengajuan dibuat")
	errRevisionPokjarStatus       = errors.New("Pokjar hanya menggunakan status Hadir, Izin, atau Sakit tanpa jam pulang")
)

var revisableAttendanceStatuses = []string{"hadir", "hadir_terlambat", "hadir_izin_terlambat", "izin", "sakit"}

func (h *Handler) listAttendanceRevisionRequests(c *fiber.Ctx) error {
	claims, err := userClaims(c)
	if err != nil {
		return err
	}
	query := h.db.Model(&models.AttendanceRevisionRequest{}).Order("created_at DESC, id DESC")
	switch claims.Role {
	case "guru":
		query = query.Where("user_id = ?", claims.UserID)
	case "admin", "kepala_sekolah":
		if value := c.Query("user_id"); value != "" {
			userID, err := parseUint(value)
			if err != nil {
				return invalid(c, "user_id tidak valid")
			}
			query = query.Where("user_id = ?", userID)
		}
	default:
		return fiber.ErrForbidden
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" && status != "all" {
		if !contains([]string{"pending", "approved", "rejected"}, status) {
			return invalid(c, "Filter status pengajuan tidak valid")
		}
		query = query.Where("status = ?", status)
	}

	var requests []models.AttendanceRevisionRequest
	if err := query.Limit(200).Find(&requests).Error; err != nil {
		return err
	}
	if len(requests) == 0 {
		return httpx.Success(c, "Pengajuan revisi presensi", []fiber.Map{})
	}
	userIDs := make([]uint, 0, len(requests))
	for _, request := range requests {
		userIDs = append(userIDs, request.UserID)
	}
	var teachers []models.User
	if err := h.db.Select("id", "nama", "pokjar").Where("id IN ?", userIDs).Find(&teachers).Error; err != nil {
		return err
	}
	names := make(map[uint]string, len(teachers))
	pokjarByUser := make(map[uint]bool, len(teachers))
	for _, teacher := range teachers {
		names[teacher.ID] = teacher.Nama
		pokjarByUser[teacher.ID] = teacher.Pokjar != nil && strings.TrimSpace(*teacher.Pokjar) != ""
	}
	data := make([]fiber.Map, 0, len(requests))
	for _, request := range requests {
		request.IsPokjar = pokjarByUser[request.UserID]
		data = append(data, mapAttendanceRevisionRequest(request, names[request.UserID]))
	}
	return httpx.Success(c, "Pengajuan revisi presensi", data)
}

func (h *Handler) createAttendanceRevisionRequest(c *fiber.Ctx) error {
	claims, err := userClaims(c)
	if err != nil {
		return err
	}
	if claims.Role != "guru" {
		return fiber.ErrForbidden
	}
	var teacher models.User
	if err := h.db.Select("id", "pokjar").Where("id = ? AND role = ?", claims.UserID, "guru").First(&teacher).Error; err != nil {
		return err
	}
	isPokjar := teacher.Pokjar != nil && strings.TrimSpace(*teacher.Pokjar) != ""
	body, err := readJSON(c)
	if err != nil {
		return invalid(c, err.Error())
	}
	attendanceID, err := uintValue(body, "attendance_id", "attendanceId")
	if err != nil {
		return invalid(c, "Catatan presensi harus dipilih")
	}
	reason := stringValue(body, "alasan", "reason")
	if len([]rune(reason)) < 5 || len([]rune(reason)) > 1000 {
		return invalid(c, "Alasan revisi harus 5–1000 karakter")
	}
	status := stringValue(body, "proposed_status", "proposedStatus")
	if !contains(revisableAttendanceStatuses, status) {
		return invalid(c, "Status usulan tidak valid")
	}
	if isPokjar && !isAllowedPokjarStatus(status) {
		return invalid(c, "Pokjar hanya dapat mengajukan revisi dengan status Hadir, Izin, atau Sakit")
	}
	jamMasuk, err := proposedRevisionTime(stringValue(body, "proposed_jam_masuk", "proposedJamMasuk"), "Jam masuk")
	if err != nil {
		return invalid(c, err.Error())
	}
	jamPulang, err := proposedRevisionTime(stringValue(body, "proposed_jam_pulang", "proposedJamPulang"), "Jam pulang")
	if err != nil {
		return invalid(c, err.Error())
	}
	if isPokjar && jamPulang != nil {
		return invalid(c, "Presensi Pokjar tidak menggunakan jam pulang")
	}
	if isPresentRevisionStatus(status) && jamMasuk == nil {
		return invalid(c, "Jam masuk wajib diisi untuk status hadir")
	}
	if !isPresentRevisionStatus(status) {
		jamMasuk, jamPulang = nil, nil
	}
	proposedNote := stringValue(body, "proposed_keterangan", "proposedKeterangan")
	if len([]rune(proposedNote)) > 2000 {
		return invalid(c, "Keterangan maksimal 2000 karakter")
	}

	var created models.AttendanceRevisionRequest
	err = h.db.Transaction(func(tx *gorm.DB) error {
		var attendance models.AttendanceLog
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND user_id = ?", attendanceID, claims.UserID).First(&attendance).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errRevisionAttendanceNotFound
			}
			return err
		}
		var pendingCount int64
		if err := tx.Model(&models.AttendanceRevisionRequest{}).
			Where("attendance_id = ? AND user_id = ? AND status = ?", attendance.ID, claims.UserID, "pending").
			Count(&pendingCount).Error; err != nil {
			return err
		}
		if pendingCount > 0 {
			return errRevisionPendingExists
		}
		if attendance.Status == status && equalRevisionTime(attendance.JamMasuk, jamMasuk) &&
			equalRevisionTime(attendance.JamPulang, jamPulang) && equalRevisionText(attendance.Keterangan, proposedNote) {
			return errRevisionNoChange
		}
		created = models.AttendanceRevisionRequest{
			UserID:             attendance.UserID,
			AttendanceID:       attendance.ID,
			Tanggal:            dateOnly(attendance.Tanggal),
			OriginalStatus:     attendance.Status,
			OriginalJamMasuk:   attendance.JamMasuk,
			OriginalJamHadir:   attendance.JamHadir,
			OriginalJamPulang:  attendance.JamPulang,
			OriginalKeterangan: attendance.Keterangan,
			ProposedStatus:     status,
			ProposedJamMasuk:   jamMasuk,
			ProposedJamPulang:  jamPulang,
			ProposedKeterangan: pointerString(proposedNote),
			Alasan:             reason,
			Status:             "pending",
			IsPokjar:           isPokjar,
		}
		return tx.Create(&created).Error
	})
	switch {
	case errors.Is(err, errRevisionAttendanceNotFound):
		return httpx.Error(c, fiber.StatusNotFound, "ATTENDANCE_NOT_FOUND", "Catatan presensi tidak ditemukan")
	case errors.Is(err, errRevisionPendingExists):
		return httpx.Error(c, fiber.StatusConflict, "REVISION_ALREADY_PENDING", "Masih ada pengajuan revisi yang menunggu untuk tanggal ini")
	case errors.Is(err, errRevisionNoChange):
		return invalid(c, "Usulan revisi sama dengan catatan presensi saat ini")
	case err != nil:
		return err
	}
	return httpx.Success(c, "Pengajuan revisi berhasil dikirim kepada admin", mapAttendanceRevisionRequest(created, ""))
}

func (h *Handler) approveAttendanceRevisionRequest(c *fiber.Ctx) error {
	return h.reviewAttendanceRevisionRequest(c, true)
}

func (h *Handler) rejectAttendanceRevisionRequest(c *fiber.Ctx) error {
	return h.reviewAttendanceRevisionRequest(c, false)
}

func (h *Handler) reviewAttendanceRevisionRequest(c *fiber.Ctx, approve bool) error {
	claims, err := userClaims(c)
	if err != nil {
		return err
	}
	if claims.Role != "admin" && claims.Role != "kepala_sekolah" {
		return fiber.ErrForbidden
	}
	requestID, err := parseUint(c.Params("id"))
	if err != nil {
		return invalid(c, "ID pengajuan tidak valid")
	}
	var body map[string]any
	if len(c.Body()) > 0 {
		body, err = readJSON(c)
		if err != nil {
			return invalid(c, err.Error())
		}
	} else {
		body = map[string]any{}
	}
	adminNote := stringValue(body, "admin_note", "adminNote")
	if len([]rune(adminNote)) > 1000 {
		return invalid(c, "Catatan admin maksimal 1000 karakter")
	}
	if !approve && len([]rune(adminNote)) < 5 {
		return invalid(c, "Alasan penolakan minimal 5 karakter")
	}

	now := time.Now().In(appLocation(h))
	var reviewed models.AttendanceRevisionRequest
	err = h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&reviewed, requestID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return gorm.ErrRecordNotFound
			}
			return err
		}
		if reviewed.Status != "pending" {
			return errRevisionAlreadyReviewed
		}
		var teacher models.User
		if err := tx.Select("id", "role", "pokjar").First(&teacher, reviewed.UserID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errRevisionStale
			}
			return err
		}
		if teacher.Role != "guru" {
			return errRevisionStale
		}
		isPokjar := teacher.Pokjar != nil && strings.TrimSpace(*teacher.Pokjar) != ""
		reviewed.IsPokjar = isPokjar
		if approve {
			if isPokjar && (!isAllowedPokjarStatus(reviewed.ProposedStatus) || reviewed.ProposedJamPulang != nil) {
				return errRevisionPokjarStatus
			}
			var attendance models.AttendanceLog
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&attendance, reviewed.AttendanceID).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return errRevisionStale
				}
				return err
			}
			if attendance.UserID != reviewed.UserID || !dateOnly(attendance.Tanggal).Equal(dateOnly(reviewed.Tanggal)) ||
				attendance.Status != reviewed.OriginalStatus ||
				!equalRevisionTime(attendance.JamMasuk, reviewed.OriginalJamMasuk) ||
				!equalRevisionTime(attendance.JamHadir, reviewed.OriginalJamHadir) ||
				!equalRevisionTime(attendance.JamPulang, reviewed.OriginalJamPulang) ||
				!equalRevisionText(attendance.Keterangan, stringValueFromPointer(reviewed.OriginalKeterangan)) {
				return errRevisionStale
			}
			updates := map[string]any{
				"status":     reviewed.ProposedStatus,
				"keterangan": reviewed.ProposedKeterangan,
			}
			if isPresentRevisionStatus(reviewed.ProposedStatus) {
				updates["jam_masuk"] = reviewed.ProposedJamMasuk
				updates["jam_hadir"] = reviewed.ProposedJamMasuk
				if isPokjar {
					updates["jam_pulang"] = nil
				} else {
					updates["jam_pulang"] = reviewed.ProposedJamPulang
				}
			} else {
				updates["jam_masuk"] = nil
				updates["jam_hadir"] = nil
				updates["jam_pulang"] = nil
			}
			if err := tx.Model(&attendance).Updates(updates).Error; err != nil {
				return err
			}
			eventReason := truncateRevisionText(fmt.Sprintf("Revisi presensi #%d disetujui admin. Alasan guru: %s", reviewed.ID, reviewed.Alasan), 500)
			attendanceID := attendance.ID
			event := models.AttendanceEvent{
				AttendanceID:    &attendanceID,
				UserID:          attendance.UserID,
				EventType:       "admin_revision",
				Method:          "manual",
				LocationVerdict: "not_required",
				Reason:          &eventReason,
				ActorUserID:     uintPointer(claims.UserID),
				OccurredAt:      now,
			}
			if err := tx.Create(&event).Error; err != nil {
				return fmt.Errorf("write attendance revision event: %w", err)
			}
		}

		status := "rejected"
		if approve {
			status = "approved"
		}
		if err := tx.Model(&reviewed).Updates(map[string]any{
			"status":      status,
			"admin_note":  pointerString(adminNote),
			"reviewed_by": claims.UserID,
			"reviewed_at": now,
		}).Error; err != nil {
			return err
		}
		reviewed.Status = status
		reviewed.AdminNote = pointerString(adminNote)
		reviewed.ReviewedBy = uintPointer(claims.UserID)
		reviewed.ReviewedAt = &now
		var admin models.User
		if err := tx.Select("id", "nama").First(&admin, claims.UserID).Error; err == nil {
			activity := "Menolak pengajuan revisi presensi"
			if approve {
				activity = "Menyetujui pengajuan revisi presensi"
			}
			logEntry := models.ActivityLog{Waktu: now, User: admin.Nama, Aktivitas: activity, Status: fmt.Sprintf("Guru %d · %s", reviewed.UserID, dateOnly(reviewed.Tanggal).Format("2006-01-02"))}
			if err := tx.Create(&logEntry).Error; err != nil {
				log.Printf("attendance revision activity log failed for request %d: %v", reviewed.ID, err)
			}
		}
		return nil
	})
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		return httpx.Error(c, fiber.StatusNotFound, "REVISION_NOT_FOUND", "Pengajuan revisi tidak ditemukan")
	case errors.Is(err, errRevisionAlreadyReviewed):
		return httpx.Error(c, fiber.StatusConflict, "REVISION_ALREADY_REVIEWED", "Pengajuan revisi sudah diproses")
	case errors.Is(err, errRevisionStale):
		return httpx.Error(c, fiber.StatusConflict, "ATTENDANCE_CHANGED", "Catatan presensi sudah berubah. Muat ulang daftar sebelum menyetujui pengajuan ini.")
	case errors.Is(err, errRevisionPokjarStatus):
		return httpx.Error(c, fiber.StatusConflict, "POKJAR_STATUS_NOT_ALLOWED", "Pokjar hanya menggunakan status Hadir, Izin, atau Sakit tanpa jam pulang")
	case err != nil:
		return err
	}
	message := "Pengajuan revisi berhasil ditolak"
	if approve {
		message = "Revisi presensi disetujui dan diterapkan"
	}
	return httpx.Success(c, message, mapAttendanceRevisionRequest(reviewed, ""))
}

func mapAttendanceRevisionRequest(request models.AttendanceRevisionRequest, teacherName string) fiber.Map {
	return fiber.Map{
		"id":                  request.ID,
		"user_id":             request.UserID,
		"attendance_id":       request.AttendanceID,
		"tanggal":             dateOnly(request.Tanggal).Format("2006-01-02"),
		"nama_guru":           teacherName,
		"is_pokjar":           request.IsPokjar,
		"original_status":     request.OriginalStatus,
		"original_jam_masuk":  request.OriginalJamMasuk,
		"original_jam_hadir":  request.OriginalJamHadir,
		"original_jam_pulang": request.OriginalJamPulang,
		"original_keterangan": request.OriginalKeterangan,
		"proposed_status":     request.ProposedStatus,
		"proposed_jam_masuk":  request.ProposedJamMasuk,
		"proposed_jam_pulang": request.ProposedJamPulang,
		"proposed_keterangan": request.ProposedKeterangan,
		"alasan":              request.Alasan,
		"status":              request.Status,
		"admin_note":          request.AdminNote,
		"reviewed_by":         request.ReviewedBy,
		"reviewed_at":         request.ReviewedAt,
		"created_at":          request.CreatedAt,
		"updated_at":          request.UpdatedAt,
	}
}

func proposedRevisionTime(value, label string) (*string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	if !validTime(value) {
		return nil, fmt.Errorf("Format %s tidak valid", strings.ToLower(label))
	}
	return pointerString(normalizeTime(value)), nil
}

func isPresentRevisionStatus(status string) bool {
	return contains([]string{"hadir", "hadir_terlambat", "hadir_izin_terlambat"}, status)
}

func equalRevisionTime(left, right *string) bool {
	return normalizeRevisionTime(left) == normalizeRevisionTime(right)
}

func normalizeRevisionTime(value *string) string {
	if value == nil {
		return ""
	}
	return normalizeTime(strings.TrimSpace(*value))
}

func equalRevisionText(left *string, right string) bool {
	return stringValueFromPointer(left) == strings.TrimSpace(right)
}

func stringValueFromPointer(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func uintPointer(value uint) *uint { return &value }

func truncateRevisionText(value string, maxRunes int) string {
	runes := []rune(value)
	if len(runes) > maxRunes {
		return string(runes[:maxRunes])
	}
	return value
}
