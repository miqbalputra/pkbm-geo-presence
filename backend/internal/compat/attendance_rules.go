package compat

import (
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
)

// checkInTarget keeps the attendance timing rules aligned with the previous
// PHP implementation. The school default applies unless a special workday or
// an active duty roster (piket) supplies an earlier target.
func (h *Handler) checkInTarget(userID uint, date time.Time, settings map[string]string) (string, string, error) {
	target := settingTime(settings["jam_masuk_normal"], "07:20")
	label := ""

	var holiday models.Holiday
	holidayQuery := h.db.
		Where("tanggal >= ? AND tanggal < ?", date, date.AddDate(0, 0, 1)).
		First(&holiday)
	if holidayQuery.Error != nil && holidayQuery.Error != gorm.ErrRecordNotFound {
		return "", "", holidayQuery.Error
	}
	if holidayQuery.Error == nil && holiday.IsWorkday && holiday.JamMasukKhusus != nil && strings.TrimSpace(*holiday.JamMasukKhusus) != "" {
		return settingTime(*holiday.JamMasukKhusus, target), " (Event: " + holiday.Nama + ")", nil
	}

	rotationSettings(settings)
	rotationControlsDate, isRotationPiket, rotationErr := h.rotationPiket(userID, date, settings)
	if rotationErr != nil {
		return "", "", rotationErr
	}
	if rotationControlsDate {
		if isRotationPiket {
			return settingTime(settings["piket_jam_masuk"], "07:00"), " (Piket Sabtu)", nil
		}
		return target, "", nil
	}

	var piket models.JadwalPiket
	piketQuery := h.db.Where("user_id = ? AND hari = ? AND is_active = ?", userID, dayName(date.Weekday()), true).First(&piket)
	if piketQuery.Error != nil && piketQuery.Error != gorm.ErrRecordNotFound {
		return "", "", piketQuery.Error
	}
	hasPiket := piketQuery.Error == nil

	if date.Weekday() == time.Monday {
		if settings["apel_senin_enabled"] == "1" {
			if hasPiket && piket.JamPiket != nil && strings.TrimSpace(*piket.JamPiket) != "" {
				return settingTime(*piket.JamPiket, "07:00"), " (Piket Apel)", nil
			}
			return "07:00:00", " (Apel Senin)", nil
		}
		if hasPiket {
			return "07:00:00", " (Piket)", nil
		}
	} else if hasPiket && piket.JamPiket != nil && strings.TrimSpace(*piket.JamPiket) != "" {
		return settingTime(*piket.JamPiket, target), " (Piket)", nil
	}

	return target, label, nil
}

func classifyCheckIn(_ models.User, checkedInAt time.Time, target, targetLabel, toleranceValue, note string) (string, string) {
	targetMinutes, validTarget := timeToMinutes(target)
	if !validTarget {
		targetMinutes, _ = timeToMinutes("07:20")
	}
	lateMinutes := checkedInAt.Hour()*60 + checkedInAt.Minute() - targetMinutes
	if lateMinutes <= 0 {
		return "hadir", note
	}

	tolerance := 15
	if parsed, err := strconv.Atoi(strings.TrimSpace(toleranceValue)); err == nil && parsed >= 0 {
		tolerance = parsed
	}
	severity := ""
	if lateMinutes > tolerance {
		severity = " (Parah)"
	}
	return "hadir_terlambat", "Terlambat " + strconv.Itoa(lateMinutes) + " menit" + severity + targetLabel
}

func isAllowedPokjarStatus(status string) bool {
	return status == "hadir" || status == "izin" || status == "sakit"
}

// lateMinutesForAttendance calculates the delay relative to the same effective
// target used when classifying check-ins. It deliberately returns nil when a
// check-in time is absent or not later than its target, so the peer-status API
// never invents a delay for manually corrected records.
func (h *Handler) lateMinutesForAttendance(user models.User, attendance models.AttendanceLog, date time.Time, settings map[string]string) (*int, error) {
	checkInTime := attendance.JamMasuk
	if checkInTime == nil || strings.TrimSpace(*checkInTime) == "" {
		checkInTime = attendance.JamHadir
	}
	if checkInTime == nil || strings.TrimSpace(*checkInTime) == "" {
		return nil, nil
	}

	actualMinutes, validActual := timeToMinutes(*checkInTime)
	if !validActual {
		return nil, nil
	}
	target, _, err := h.checkInTarget(user.ID, date, settings)
	if err != nil {
		return nil, err
	}
	targetMinutes, validTarget := timeToMinutes(target)
	if !validTarget {
		return nil, nil
	}
	lateMinutes := actualMinutes - targetMinutes
	if lateMinutes <= 0 {
		return nil, nil
	}
	return &lateMinutes, nil
}

// derivedAttendanceStatus restores the effective status for a same-day record
// that was saved as hadir before timing rules were applied by the API. It is
// intentionally read-only: administrators' historical/manual corrections stay
// untouched, while teacher-facing views still show the rule that applies now.
func (h *Handler) derivedAttendanceStatus(user models.User, attendance models.AttendanceLog, date time.Time, settings map[string]string) (string, error) {
	if attendance.Status != "hadir" {
		return attendance.Status, nil
	}

	checkInTime := attendance.JamMasuk
	if checkInTime == nil || strings.TrimSpace(*checkInTime) == "" {
		checkInTime = attendance.JamHadir
	}
	if checkInTime == nil || strings.TrimSpace(*checkInTime) == "" {
		return attendance.Status, nil
	}

	minutes, valid := timeToMinutes(*checkInTime)
	if !valid {
		return attendance.Status, nil
	}
	target, targetLabel, err := h.checkInTarget(user.ID, date, settings)
	if err != nil {
		return attendance.Status, err
	}
	checkedInAt := time.Date(date.Year(), date.Month(), date.Day(), minutes/60, minutes%60, 0, 0, date.Location())
	status, _ := classifyCheckIn(user, checkedInAt, target, targetLabel, settings["toleransi_terlambat"], "")
	return status, nil
}

// checkoutTarget returns the effective minimum checkout time. An active piket
// schedule takes precedence over the school-wide setting, unless the date is a
// special workday. Both targets can be overridden from Pengaturan Harian.
func (h *Handler) checkoutTarget(userID uint, date time.Time, settings map[string]string) (string, bool, error) {
	target := settingTime(settings["jam_min_pulang"], "12:30")

	var daily models.PengaturanHarian
	dailyQuery := h.db.Where("DATE(tanggal) = ?", date.Format("2006-01-02")).First(&daily)
	if dailyQuery.Error != nil && dailyQuery.Error != gorm.ErrRecordNotFound {
		return "", false, dailyQuery.Error
	}
	if dailyQuery.Error == nil && daily.JamPulangKhususAktif && daily.JamPulangKhusus != nil && strings.TrimSpace(*daily.JamPulangKhusus) != "" {
		target = settingTime(*daily.JamPulangKhusus, target)
	}

	var holiday models.Holiday
	holidayQuery := h.db.
		Where("tanggal >= ? AND tanggal < ?", date, date.AddDate(0, 0, 1)).
		First(&holiday)
	if holidayQuery.Error != nil && holidayQuery.Error != gorm.ErrRecordNotFound {
		return "", false, holidayQuery.Error
	}
	if holidayQuery.Error == nil && holiday.IsWorkday {
		return target, false, nil
	}

	rotationSettings(settings)
	rotationControlsDate, isRotationPiket, rotationErr := h.rotationPiket(userID, date, settings)
	if rotationErr != nil {
		return "", false, rotationErr
	}
	if rotationControlsDate {
		if !isRotationPiket {
			return target, false, nil
		}
		target = settingTime(settings["piket_jam_pulang"], target)
		if dailyQuery.Error == nil && daily.JamPulangPiketAktif && daily.JamPulangPiketKhusus != nil && strings.TrimSpace(*daily.JamPulangPiketKhusus) != "" {
			target = settingTime(*daily.JamPulangPiketKhusus, target)
		}
		return target, true, nil
	}

	var piket models.JadwalPiket
	piketQuery := h.db.Where("user_id = ? AND hari = ? AND is_active = ?", userID, dayName(date.Weekday()), true).First(&piket)
	if piketQuery.Error != nil && piketQuery.Error != gorm.ErrRecordNotFound {
		return "", false, piketQuery.Error
	}
	if piketQuery.Error != nil || piket.JamPulangPiket == nil || strings.TrimSpace(*piket.JamPulangPiket) == "" {
		return target, false, nil
	}

	target = settingTime(*piket.JamPulangPiket, target)
	if dailyQuery.Error == nil && daily.JamPulangPiketAktif && daily.JamPulangPiketKhusus != nil && strings.TrimSpace(*daily.JamPulangPiketKhusus) != "" {
		target = settingTime(*daily.JamPulangPiketKhusus, target)
	}
	return target, true, nil
}

func addPiketEarlyCheckoutNote(note string) string {
	const marker = "Izin Pulang Awal Piket"
	if strings.Contains(note, marker) {
		return note
	}
	if strings.TrimSpace(note) == "" {
		return "(" + marker + ")"
	}
	return strings.TrimSpace(note) + " (" + marker + ")"
}

func mergeAttendanceNotes(existing, additional string) string {
	existing = strings.TrimSpace(existing)
	additional = strings.TrimSpace(additional)
	if additional == "" {
		return existing
	}
	if existing == "" || existing == additional {
		return additional
	}
	return existing + " | " + additional
}

func settingTime(value, fallback string) string {
	if _, ok := timeToMinutes(value); ok {
		return normalizeTime(strings.TrimSpace(value))
	}
	return normalizeTime(fallback)
}

func timeToMinutes(value string) (int, bool) {
	normalized := normalizeTime(value)
	parsed, err := time.Parse("15:04:05", normalized)
	if err != nil {
		return 0, false
	}
	return parsed.Hour()*60 + parsed.Minute(), true
}
