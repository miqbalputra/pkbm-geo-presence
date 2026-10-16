package compat

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/httpx"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
)

const monthlyConfirmationStatusConfirmed = "confirmed"
const monthlyConfirmationStatusAdminConfirmed = "confirmed_by_admin"
const monthlyConfirmationStatusCorrectionRequested = "correction_requested"

func monthlyConfirmationIsConfirmed(status string) bool {
	return status == monthlyConfirmationStatusConfirmed || status == monthlyConfirmationStatusAdminConfirmed
}

// monthlyConfirmationNow is replaceable in tests so the October 2026 rollout
// can be exercised without coupling tests to the machine clock.
var monthlyConfirmationNow = time.Now

func monthlyConfirmationPeriod(now time.Time) (time.Time, time.Time, bool) {
	now = dateOnly(now)
	activation := time.Date(2026, time.October, 1, 0, 0, 0, 0, now.Location())
	if now.Before(activation) {
		return time.Time{}, time.Time{}, false
	}
	currentMonthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	return currentMonthStart.AddDate(0, -1, 0), currentMonthStart.AddDate(0, 0, -1), true
}

func monthlyConfirmationTarget(user models.User, now time.Time) (time.Time, time.Time, bool) {
	start, end, active := monthlyConfirmationPeriod(now)
	if !active {
		return time.Time{}, time.Time{}, false
	}
	if !user.CreatedAt.IsZero() && dateOnly(user.CreatedAt.In(now.Location())).After(end) {
		return time.Time{}, time.Time{}, false
	}
	return start, end, true
}

func monthlyConfirmationPeriodLabel(start time.Time) string {
	months := [...]string{"Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"}
	return fmt.Sprintf("%s %d", months[int(start.Month())-1], start.Year())
}

func monthlyConfirmationDeadline(periodStart time.Time) time.Time {
	currentMonthStart := time.Date(periodStart.Year(), periodStart.Month(), 1, 0, 0, 0, 0, periodStart.Location()).AddDate(0, 1, 0)
	return currentMonthStart.AddDate(0, 0, 1).Add(9 * time.Hour)
}

func monthlyConfirmationPeriodScope(db *gorm.DB, start time.Time) *gorm.DB {
	start = dateOnly(start)
	return db.Where("period_start >= ? AND period_start < ?", start, start.AddDate(0, 1, 0))
}

func (h *Handler) findMonthlyConfirmation(userID uint, periodStart time.Time) (*models.MonthlyAttendanceConfirmation, error) {
	var confirmation models.MonthlyAttendanceConfirmation
	err := monthlyConfirmationPeriodScope(h.db.Where("user_id = ?", userID), periodStart).First(&confirmation).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &confirmation, nil
}

// buildMonthlyConfirmationReport retains the canonical attendance calculation
// while showing only scheduled, non-holiday Saturdays in the acknowledgement.
func (h *Handler) buildMonthlyConfirmationReport(teacher models.User, start, end time.Time) (fiber.Map, error) {
	report, err := h.buildTeacherAttendanceReport(teacher, start, end)
	if err != nil {
		return nil, err
	}

	rows, ok := report["rows"].([]fiber.Map)
	if !ok {
		return nil, fmt.Errorf("format rekap presensi tidak valid")
	}
	byDate := make(map[string]fiber.Map, len(rows))
	for _, row := range rows {
		if date := strings.TrimSpace(fmt.Sprint(row["tanggal"])); date != "" {
			byDate[date] = row
		}
	}

	calendar, err := h.loadWorkdayCalendar(start, end)
	if err != nil {
		return nil, err
	}
	endExclusive := end.AddDate(0, 0, 1).Format("2006-01-02")
	var overrides []models.WeekendOverride
	if err := h.db.Where("user_id = ? AND tanggal >= ? AND tanggal < ?", teacher.ID, start.Format("2006-01-02"), endExclusive).Find(&overrides).Error; err != nil {
		return nil, err
	}
	overrideByDate := make(map[string]models.WeekendOverride, len(overrides))
	for _, row := range overrides {
		overrideByDate[row.Tanggal.Format("2006-01-02")] = row
	}

	filtered := make(map[string]fiber.Map, len(rows))
	for _, date := range dateRange(start, end) {
		if date.Weekday() != time.Saturday {
			continue
		}
		if !teacher.CreatedAt.IsZero() && date.Before(dateOnly(teacher.CreatedAt.In(date.Location()))) {
			continue
		}
		dateString := date.Format("2006-01-02")
		// Holidays stay hidden even when an administrator marks one as a
		// working holiday. Optional days and explicit Saturday overrides also
		// do not appear as scheduled Saturday attendance.
		if _, holiday := calendar.holidays[dateString]; holiday {
			continue
		}
		isWorkday, optional, overrideOff := journalReportDayType(calendar, teacher, date, overrideByDate)
		row, hasAttendance := byDate[dateString]
		if overrideOff || (!isWorkday && !optional) || (optional && !hasAttendance) {
			continue
		}
		if !hasAttendance {
			// Scheduled Saturday with no attendance is an Alfa day and can be
			// corrected through a revision request without pre-creating a log.
			row = journalReportVirtualRow(dateString, "alfa", "Belum ada catatan presensi")
		}
		filtered[dateString] = row
	}

	rows = rows[:0]
	for _, row := range filtered {
		rows = append(rows, row)
	}
	sort.Slice(rows, func(i, j int) bool {
		return fmt.Sprint(rows[i]["tanggal"]) < fmt.Sprint(rows[j]["tanggal"])
	})
	report["rows"] = rows
	return report, nil
}

func (h *Handler) monthlyCorrectionWhatsAppURL(user models.User, periodStart time.Time) (string, error) {
	var config models.WebhookConfig
	err := h.db.First(&config, 1).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	phone := normalizeWhatsAppPhone(config.AdminPhone)
	if phone == "" {
		return "", nil
	}
	message := fmt.Sprintf("Pengajuan Koreksi Presensi Kehadiran\nBulan: %s\nNama: %s", monthlyConfirmationPeriodLabel(periodStart), user.Nama)
	return "https://wa.me/" + phone + "?text=" + url.QueryEscape(message), nil
}

func monthlyFollowUpWhatsAppURL(user models.User, periodStart time.Time) string {
	if user.NoHP == nil {
		return ""
	}
	phone := normalizeWhatsAppPhone(*user.NoHP)
	if phone == "" {
		return ""
	}
	message := fmt.Sprintf("Pengingat Konfirmasi Rekap Presensi\nBulan: %s\n\nAssalamu'alaikum %s, mohon meninjau dan mengonfirmasi rekap presensi bulan sebelumnya melalui aplikasi Presensi PKBM Tunas Ilmu. Terima kasih.", monthlyConfirmationPeriodLabel(periodStart), user.Nama)
	return "https://wa.me/" + phone + "?text=" + url.QueryEscape(message)
}

func confirmationTimes(confirmation *models.MonthlyAttendanceConfirmation) fiber.Map {
	if confirmation == nil {
		return fiber.Map{"status": "pending", "confirmedAt": nil, "confirmedByAdmin": false, "correctionRequestedAt": nil}
	}
	return fiber.Map{
		"status":                confirmation.Status,
		"confirmedAt":           confirmation.ConfirmedAt,
		"confirmedByAdmin":      confirmation.Status == monthlyConfirmationStatusAdminConfirmed,
		"correctionRequestedAt": confirmation.CorrectionRequestedAt,
	}
}

func (h *Handler) monthlyConfirmationPayload(user models.User, now time.Time) (fiber.Map, error) {
	start, end, active := monthlyConfirmationTarget(user, now)
	if !active {
		return fiber.Map{"required": false, "needsConfirmation": false, "isOverdue": false}, nil
	}
	confirmation, err := h.findMonthlyConfirmation(user.ID, start)
	if err != nil {
		return nil, err
	}
	needsConfirmation := confirmation == nil || !monthlyConfirmationIsConfirmed(confirmation.Status)
	deadline := monthlyConfirmationDeadline(start)
	payload := fiber.Map{
		"required":          needsConfirmation,
		"needsConfirmation": needsConfirmation,
		"deadlineAt":        deadline.Format(time.RFC3339),
		"isOverdue":         !now.Before(deadline),
		"period": fiber.Map{
			"label":     monthlyConfirmationPeriodLabel(start),
			"startDate": start.Format("2006-01-02"),
			"endDate":   end.Format("2006-01-02"),
		},
	}
	for key, value := range confirmationTimes(confirmation) {
		payload[key] = value
	}
	if !needsConfirmation {
		return payload, nil
	}

	report, err := h.buildMonthlyConfirmationReport(user, start, end)
	if err != nil {
		return nil, err
	}
	correctionURL, err := h.monthlyCorrectionWhatsAppURL(user, start)
	if err != nil {
		return nil, err
	}
	payload["summary"] = report["summary"]
	payload["rows"] = report["rows"]
	payload["correctionWhatsAppUrl"] = correctionURL
	return payload, nil
}

func (h *Handler) guruMonthlyConfirmation(c *fiber.Ctx) error {
	user, err := requireUser(c)
	if err != nil {
		return err
	}
	payload, err := h.monthlyConfirmationPayload(user, monthlyConfirmationNow().In(appLocation(h)))
	if err != nil {
		return err
	}
	return httpx.Success(c, "Status konfirmasi rekap presensi berhasil diambil", payload)
}

func (h *Handler) confirmMonthlyConfirmation(c *fiber.Ctx) error {
	user, err := requireUser(c)
	if err != nil {
		return err
	}
	now := monthlyConfirmationNow().In(appLocation(h))
	start, end, active := monthlyConfirmationTarget(user, now)
	if !active {
		return httpx.Error(c, fiber.StatusConflict, "MONTHLY_CONFIRMATION_NOT_REQUIRED", "Konfirmasi rekap presensi belum diperlukan")
	}
	confirmation, err := h.findMonthlyConfirmation(user.ID, start)
	if err != nil {
		return err
	}
	if confirmation != nil && monthlyConfirmationIsConfirmed(confirmation.Status) {
		payload, err := h.monthlyConfirmationPayload(user, now)
		if err != nil {
			return err
		}
		return httpx.Success(c, "Rekap presensi sudah disetujui", payload)
	}

	report, err := h.buildMonthlyConfirmationReport(user, start, end)
	if err != nil {
		return err
	}
	snapshot, err := json.Marshal(report)
	if err != nil {
		return err
	}
	confirmedAt := now
	if confirmation == nil {
		confirmation = &models.MonthlyAttendanceConfirmation{
			UserID:      user.ID,
			PeriodStart: start,
			PeriodEnd:   end,
			Status:      monthlyConfirmationStatusConfirmed,
			ConfirmedAt: &confirmedAt,
			Snapshot:    pointerString(string(snapshot)),
		}
		if err := h.db.Create(confirmation).Error; err != nil {
			return err
		}
	} else if err := h.db.Model(confirmation).Updates(map[string]any{
		"status":       monthlyConfirmationStatusConfirmed,
		"confirmed_at": confirmedAt,
		"snapshot":     string(snapshot),
	}).Error; err != nil {
		return err
	}

	payload, err := h.monthlyConfirmationPayload(user, now)
	if err != nil {
		return err
	}
	return httpx.Success(c, "Rekap presensi berhasil disetujui", payload)
}

func (h *Handler) requestMonthlyCorrection(c *fiber.Ctx) error {
	user, err := requireUser(c)
	if err != nil {
		return err
	}
	now := monthlyConfirmationNow().In(appLocation(h))
	start, end, active := monthlyConfirmationTarget(user, now)
	if !active {
		return httpx.Error(c, fiber.StatusConflict, "MONTHLY_CONFIRMATION_NOT_REQUIRED", "Konfirmasi rekap presensi belum diperlukan")
	}
	confirmation, err := h.findMonthlyConfirmation(user.ID, start)
	if err != nil {
		return err
	}
	if confirmation != nil && monthlyConfirmationIsConfirmed(confirmation.Status) {
		return httpx.Error(c, fiber.StatusConflict, "MONTHLY_CONFIRMATION_ALREADY_CONFIRMED", "Rekap presensi bulan ini sudah disetujui")
	}
	whatsAppURL, err := h.monthlyCorrectionWhatsAppURL(user, start)
	if err != nil {
		return err
	}
	if whatsAppURL == "" {
		return httpx.Error(c, fiber.StatusConflict, "MONTHLY_CONFIRMATION_ADMIN_WHATSAPP_MISSING", "Nomor WhatsApp admin untuk pengajuan koreksi belum diatur")
	}
	if confirmation == nil {
		requestedAt := now
		confirmation = &models.MonthlyAttendanceConfirmation{
			UserID:                user.ID,
			PeriodStart:           start,
			PeriodEnd:             end,
			Status:                monthlyConfirmationStatusCorrectionRequested,
			CorrectionRequestedAt: &requestedAt,
		}
		if err := h.db.Create(confirmation).Error; err != nil {
			return err
		}
	}
	return httpx.Success(c, "Pengajuan koreksi berhasil dicatat", fiber.Map{
		"required":              true,
		"needsConfirmation":     true,
		"status":                monthlyConfirmationStatusCorrectionRequested,
		"deadlineAt":            monthlyConfirmationDeadline(start).Format(time.RFC3339),
		"isOverdue":             !now.Before(monthlyConfirmationDeadline(start)),
		"correctionWhatsAppUrl": whatsAppURL,
	})
}

func (h *Handler) adminMonthlyConfirmations(c *fiber.Ctx) error {
	now := monthlyConfirmationNow().In(appLocation(h))
	start, end, active := monthlyConfirmationPeriod(now)
	if !active {
		return httpx.Success(c, "Konfirmasi rekap bulanan belum aktif", fiber.Map{"active": false})
	}
	var users []models.User
	if err := h.db.Where("role = ? AND archived_at IS NULL", "guru").Order("nama ASC").Find(&users).Error; err != nil {
		return err
	}
	var confirmations []models.MonthlyAttendanceConfirmation
	if err := monthlyConfirmationPeriodScope(h.db, start).Find(&confirmations).Error; err != nil {
		return err
	}
	byUserID := make(map[uint]models.MonthlyAttendanceConfirmation, len(confirmations))
	for _, confirmation := range confirmations {
		byUserID[confirmation.UserID] = confirmation
	}

	deadline := monthlyConfirmationDeadline(start)
	confirmed, adminConfirmed, corrections := 0, 0, 0
	items := make([]fiber.Map, 0, len(users))
	followUpItems := make([]fiber.Map, 0, len(users))
	for _, user := range users {
		if _, _, eligible := monthlyConfirmationTarget(user, now); !eligible {
			continue
		}
		confirmation, found := byUserID[user.ID]
		status := "pending"
		var confirmedAt, correctionRequestedAt any
		if found {
			status = confirmation.Status
			confirmedAt = confirmation.ConfirmedAt
			correctionRequestedAt = confirmation.CorrectionRequestedAt
		}
		switch status {
		case monthlyConfirmationStatusConfirmed:
			confirmed++
		case monthlyConfirmationStatusAdminConfirmed:
			adminConfirmed++
		case monthlyConfirmationStatusCorrectionRequested:
			corrections++
		}
		items = append(items, fiber.Map{
			"id":                    user.ID,
			"nama":                  user.Nama,
			"jabatan":               user.Jabatan,
			"status":                status,
			"confirmedAt":           confirmedAt,
			"confirmedByAdmin":      status == monthlyConfirmationStatusAdminConfirmed,
			"correctionRequestedAt": correctionRequestedAt,
		})
		if !monthlyConfirmationIsConfirmed(status) {
			phone := ""
			if user.NoHP != nil {
				phone = normalizeWhatsAppPhone(*user.NoHP)
			}
			followUpItems = append(followUpItems, fiber.Map{
				"id":                    user.ID,
				"nama":                  user.Nama,
				"jabatan":               user.Jabatan,
				"status":                status,
				"phone":                 phone,
				"followUpWhatsAppUrl":   monthlyFollowUpWhatsAppURL(user, start),
				"correctionRequestedAt": correctionRequestedAt,
			})
		}
	}
	isOverdue := !now.Before(deadline)

	return httpx.Success(c, "Ringkasan konfirmasi rekap berhasil diambil", fiber.Map{
		"active":         true,
		"deadlineAt":     deadline.Format(time.RFC3339),
		"isOverdue":      isOverdue,
		"followUpActive": isOverdue && len(followUpItems) > 0,
		"period": fiber.Map{
			"label":     monthlyConfirmationPeriodLabel(start),
			"startDate": start.Format("2006-01-02"),
			"endDate":   end.Format("2006-01-02"),
		},
		"summary": fiber.Map{
			"total":                len(items),
			"confirmed":            confirmed,
			"adminConfirmed":       adminConfirmed,
			"correctionRequested":  corrections,
			"pending":              len(items) - confirmed - adminConfirmed - corrections,
			"awaitingConfirmation": len(followUpItems),
		},
		"items":         items,
		"followUpItems": followUpItems,
	})
}

func (h *Handler) adminConfirmMonthlyConfirmation(c *fiber.Ctx) error {
	admin, err := requireUser(c)
	if err != nil {
		return err
	}
	userID, err := strconv.ParseUint(strings.TrimSpace(c.Params("userId")), 10, 64)
	if err != nil || userID == 0 {
		return httpx.Error(c, fiber.StatusBadRequest, "INVALID_TEACHER_ID", "ID guru tidak valid")
	}

	now := monthlyConfirmationNow().In(appLocation(h))
	var teacher models.User
	if err := h.db.Where("id = ? AND role = ? AND archived_at IS NULL", userID, "guru").First(&teacher).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		return httpx.Error(c, fiber.StatusNotFound, "TEACHER_NOT_FOUND", "Guru aktif tidak ditemukan")
	} else if err != nil {
		return err
	}
	start, end, eligible := monthlyConfirmationTarget(teacher, now)
	if !eligible {
		return httpx.Error(c, fiber.StatusConflict, "MONTHLY_CONFIRMATION_NOT_REQUIRED", "Guru ini tidak memerlukan konfirmasi rekap bulan sebelumnya")
	}
	confirmation, err := h.findMonthlyConfirmation(teacher.ID, start)
	if err != nil {
		return err
	}
	if confirmation != nil && monthlyConfirmationIsConfirmed(confirmation.Status) {
		return httpx.Success(c, "Rekap sudah dikonfirmasi", fiber.Map{
			"userId": teacher.ID, "status": confirmation.Status,
			"confirmedAt":      confirmation.ConfirmedAt,
			"confirmedByAdmin": confirmation.Status == monthlyConfirmationStatusAdminConfirmed,
		})
	}

	report, err := h.buildMonthlyConfirmationReport(teacher, start, end)
	if err != nil {
		return err
	}
	snapshot, err := json.Marshal(report)
	if err != nil {
		return err
	}
	confirmedAt := now
	adminID := admin.ID
	if confirmation == nil {
		confirmation = &models.MonthlyAttendanceConfirmation{
			UserID: teacher.ID, PeriodStart: start, PeriodEnd: end,
			Status: monthlyConfirmationStatusAdminConfirmed, ConfirmedAt: &confirmedAt,
			ConfirmedByAdminID: &adminID, Snapshot: pointerString(string(snapshot)),
		}
		if err := h.db.Create(confirmation).Error; err != nil {
			return err
		}
	} else if err := h.db.Model(confirmation).Updates(map[string]any{
		"status":                monthlyConfirmationStatusAdminConfirmed,
		"confirmed_at":          confirmedAt,
		"confirmed_by_admin_id": adminID,
		"snapshot":              string(snapshot),
	}).Error; err != nil {
		return err
	}

	return httpx.Success(c, "Rekap presensi berhasil dikonfirmasi oleh admin", fiber.Map{
		"userId": teacher.ID, "status": monthlyConfirmationStatusAdminConfirmed,
		"confirmedAt": confirmedAt, "confirmedByAdmin": true,
	})
}

func (h *Handler) monthlyConfirmationContact(c *fiber.Ctx) error {
	if c.Method() == fiber.MethodGet {
		var config models.WebhookConfig
		err := h.db.First(&config, 1).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return httpx.Success(c, "Kontak WhatsApp admin berhasil diambil", fiber.Map{"adminPhone": ""})
		}
		if err != nil {
			return err
		}
		return httpx.Success(c, "Kontak WhatsApp admin berhasil diambil", fiber.Map{"adminPhone": normalizeWhatsAppPhone(config.AdminPhone)})
	}
	if c.Method() != fiber.MethodPut {
		return fiber.ErrMethodNotAllowed
	}
	body, err := readJSON(c)
	if err != nil {
		return invalid(c, err.Error())
	}
	value := stringValue(body, "adminPhone", "admin_phone")
	phone := ""
	if value != "" {
		phone = normalizeWhatsAppPhone(value)
		if phone == "" {
			return invalid(c, "Nomor WhatsApp admin tidak valid")
		}
	}
	var config models.WebhookConfig
	err = h.db.First(&config, 1).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		config.ID = 1
	} else if err != nil {
		return err
	}
	config.AdminPhone = phone
	if err := h.db.Save(&config).Error; err != nil {
		return err
	}
	return httpx.Success(c, "Nomor WhatsApp admin berhasil disimpan", fiber.Map{"adminPhone": phone})
}
