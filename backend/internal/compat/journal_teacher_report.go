package compat

import (
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/httpx"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
	"gorm.io/gorm"
)

// journalTeacherReport is the canonical, read-only report used by the
// academic journal application. It deliberately exposes report-ready fields
// only: no numeric GeoPresensi user id, GPS coordinates, or audit metadata.
func (h *Handler) journalTeacherReport(c *fiber.Ctx) error {
	if c.Method() != fiber.MethodGet {
		return fiber.ErrMethodNotAllowed
	}

	idGuru := strings.TrimSpace(c.Query("id_guru"))
	parsedIDs := parseJournalTeacherIDs(idGuru)
	if idGuru == "" || len(parsedIDs) != 1 || parsedIDs[0] != idGuru {
		return invalid(c, "id_guru wajib diisi dan harus valid")
	}

	location := appLocation(h)
	start, err := parseDate(c.Query("start_date"), location)
	if err != nil {
		return invalid(c, "Format start_date tidak valid")
	}
	end, err := parseDate(c.Query("end_date"), location)
	if err != nil {
		return invalid(c, "Format end_date tidak valid")
	}
	if !validReportRange(start, end) {
		return invalid(c, "Rentang tanggal maksimal 366 hari")
	}

	// A report never includes or counts future dates. Returning the effective
	// range also lets the caller label the report correctly near month-end.
	today := dateOnly(time.Now().In(location))
	if end.After(today) {
		end = today
	}
	if start.After(end) {
		return invalid(c, "Rentang tanggal belum dimulai")
	}

	var teacher models.User
	if err := h.db.Where("id_guru = ? AND role = ? AND archived_at IS NULL", idGuru, "guru").First(&teacher).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return httpx.Error(c, fiber.StatusNotFound, "JOURNAL_TEACHER_NOT_FOUND", "Guru tidak ditemukan di Presensi PKBM")
		}
		return err
	}

	report, err := h.buildTeacherAttendanceReport(teacher, start, end)
	if err != nil {
		return err
	}

	return httpx.Success(c, "Laporan presensi guru berhasil diambil", report)
}

// buildTeacherAttendanceReport is intentionally shared by integration and
// authenticated GeoPresensi routes. It is the single source of truth for the
// individual attendance report and its export data.
func (h *Handler) buildTeacherAttendanceReport(teacher models.User, start, end time.Time) (fiber.Map, error) {
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

	var logs []models.AttendanceLog
	if err := h.db.Where("user_id = ? AND tanggal >= ? AND tanggal < ?", teacher.ID, start.Format("2006-01-02"), endExclusive).Order("tanggal ASC, id ASC").Find(&logs).Error; err != nil {
		return nil, err
	}
	logByDate := make(map[string]models.AttendanceLog, len(logs))
	for _, log := range logs {
		logByDate[log.Tanggal.Format("2006-01-02")] = log
	}

	rows := make([]fiber.Map, 0)
	totalWorkdays, present, izin, sakit, alfa := 0, 0, 0, 0, 0
	for _, date := range dateRange(start, end) {
		dateString := date.Format("2006-01-02")
		log, hasLog := logByDate[dateString]
		isWorkday, isOptional, isOverrideOff := journalReportDayType(calendar, teacher, date, overrideByDate)

		if isOptional {
			if hasLog {
				rows = append(rows, journalReportLogRow(log))
				if isPresentStatus(log.Status) {
					totalWorkdays++
					present++
				}
			}
			continue
		}

		if isWorkday {
			totalWorkdays++
			if hasLog {
				rows = append(rows, journalReportLogRow(log))
				switch log.Status {
				case "izin":
					izin++
				case "sakit":
					sakit++
				default:
					if isPresentStatus(log.Status) {
						present++
					}
				}
			} else {
				alfa++
				rows = append(rows, journalReportVirtualRow(dateString, "alfa", "Tidak presensi"))
			}
			continue
		}

		if hasLog {
			// Manual corrections are retained in the report even when the date
			// later becomes non-workday; they do not affect workday statistics.
			rows = append(rows, journalReportLogRow(log))
			continue
		}
		if isOverrideOff {
			rows = append(rows, journalReportVirtualRow(dateString, "libur_override", "Libur khusus (override admin)"))
			continue
		}
		if holiday, ok := calendar.holidays[dateString]; ok && !holiday.IsWorkday {
			label := strings.TrimSpace(holiday.Nama)
			if label == "" {
				label = "Libur"
			}
			rows = append(rows, journalReportVirtualRow(dateString, "libur", fmt.Sprintf("%s — tidak presensi", label)))
		}
	}

	percentage := 0.0
	if totalWorkdays > 0 {
		percentage = float64(present) / float64(totalWorkdays) * 100
	}
	percentage = math.Round(percentage*10) / 10

	return fiber.Map{
		"teacher": fiber.Map{
			"id_guru": idGuruValue(teacher),
			"nama":    teacher.Nama,
		},
		"period": fiber.Map{
			"start_date": start.Format("2006-01-02"),
			"end_date":   end.Format("2006-01-02"),
		},
		"synced_at": time.Now().In(appLocation(h)).Format(time.RFC3339),
		"summary": fiber.Map{
			"total_hari": totalWorkdays,
			"hadir":      present,
			"izin":       izin,
			"sakit":      sakit,
			"alfa":       alfa,
			"persentase": percentage,
		},
		"rows": rows,
	}, nil
}

// myTeacherAttendanceReport serves the same canonical payload to the
// authenticated GeoPresensi teacher UI. The browser never receives the
// integration API key used by Edu.
func (h *Handler) myTeacherAttendanceReport(c *fiber.Ctx) error {
	claims, err := userClaims(c)
	if err != nil {
		return err
	}

	location := appLocation(h)
	start, err := parseDate(c.Query("start_date"), location)
	if err != nil {
		return invalid(c, "Format start_date tidak valid")
	}
	end, err := parseDate(c.Query("end_date"), location)
	if err != nil {
		return invalid(c, "Format end_date tidak valid")
	}
	if !validReportRange(start, end) {
		return invalid(c, "Rentang tanggal maksimal 366 hari")
	}
	if today := dateOnly(time.Now().In(location)); end.After(today) {
		end = today
	}
	if start.After(end) {
		return invalid(c, "Rentang tanggal belum dimulai")
	}

	var teacher models.User
	if err := h.db.Where("id = ? AND role = ? AND archived_at IS NULL", claims.UserID, "guru").First(&teacher).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return httpx.Error(c, fiber.StatusNotFound, "JOURNAL_TEACHER_NOT_FOUND", "Guru tidak ditemukan di Presensi PKBM")
		}
		return err
	}

	report, err := h.buildTeacherAttendanceReport(teacher, start, end)
	if err != nil {
		return err
	}
	return httpx.Success(c, "Laporan presensi guru berhasil diambil", report)
}

func journalReportDayType(calendar workdayCalendar, teacher models.User, date time.Time, overrides map[string]models.WeekendOverride) (isWorkday bool, isOptional bool, isOverrideOff bool) {
	dateString := date.Format("2006-01-02")
	if _, optional := calendar.optional[dateString]; optional {
		return false, true, false
	}
	if holiday, holidayFound := calendar.holidays[dateString]; holidayFound {
		return holiday.IsWorkday, false, false
	}
	if date.Weekday() == time.Saturday || date.Weekday() == time.Sunday {
		if override, found := overrides[dateString]; found {
			return override.IsWorkday, false, !override.IsWorkday
		}
	}
	workday, optional := calendar.isWorkday(teacher, date)
	return workday, optional, false
}

func journalReportLogRow(log models.AttendanceLog) fiber.Map {
	return fiber.Map{
		"tanggal":    log.Tanggal.Format("2006-01-02"),
		"jam_masuk":  stringPointerValue(log.JamMasuk),
		"jam_pulang": stringPointerValue(log.JamPulang),
		"status":     log.Status,
		"keterangan": stringPointerValue(log.Keterangan),
	}
}

func journalReportVirtualRow(date, status, note string) fiber.Map {
	return fiber.Map{
		"tanggal":    date,
		"jam_masuk":  "",
		"jam_pulang": "",
		"status":     status,
		"keterangan": note,
	}
}

func isPresentStatus(status string) bool {
	return status == "hadir" || status == "hadir_terlambat" || status == "hadir_izin_terlambat"
}

func stringPointerValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func idGuruValue(user models.User) string {
	if user.IDGuru == nil {
		return ""
	}
	return *user.IDGuru
}
