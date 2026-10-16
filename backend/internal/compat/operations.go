package compat

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/auth"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/httpx"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
)

var allowedSettings = map[string]bool{
	"jam_masuk_normal": true, "toleransi_terlambat": true, "radius_gps": true,
	"sekolah_latitude": true, "sekolah_longitude": true, "sekolah_nama": true,
	"mode_testing": true, "lokasi_laki_latitude": true, "lokasi_laki_longitude": true,
	"lokasi_perempuan_latitude": true, "lokasi_perempuan_longitude": true,
	"lokasi_apel_latitude": true, "lokasi_apel_longitude": true, "apel_senin_enabled": true,
	"location_tracking_enabled": true, "location_tracking_interval_minutes": true,
	"location_tracking_accuracy_limit": true, "qr_secret": true, "qr_enabled": true,
	"piket_terlambat_adalah_terlambat": true, "jam_piket_default": true, "button_enabled": true,
	"jam_min_pulang": true, "weekend_workday_enabled": true, "saturday_male_workday_enabled": true,
	"saturday_female_workday_enabled": true, "sunday_male_workday_enabled": true,
	"sunday_female_workday_enabled": true,
	"workday_days":                  true, "piket_rotation_enabled": true,
	"piket_group_a_weeks": true, "piket_group_b_weeks": true,
	"piket_week5_mode": true, "piket_jam_masuk": true, "piket_jam_pulang": true,
	"max_gps_accuracy_meters": true,
}

func (h *Handler) settings(c *fiber.Ctx) error {
	claims, err := userClaims(c)
	if err != nil {
		return err
	}
	if c.Method() == fiber.MethodGet {
		data, err := settingsMap(h.db)
		if err != nil {
			return err
		}
		data = visibleSettings(data, claims.Role)
		return httpx.Success(c, "Settings berhasil diambil", data)
	}
	if c.Method() != fiber.MethodPut {
		return fiber.ErrMethodNotAllowed
	}
	if claims.Role != "admin" {
		return fiber.ErrForbidden
	}
	body, err := readJSON(c)
	if err != nil {
		return invalid(c, err.Error())
	}
	key := stringValue(body, "setting_key", "settingKey")
	value := stringValue(body, "setting_value", "settingValue")
	if key == "" || !allowedSettings[key] {
		return invalid(c, "Setting key tidak valid")
	}
	if key == "radius_gps" {
		if n, err := parseUint(value); err != nil || n < 1 || n > 1000 {
			return invalid(c, "Radius GPS harus antara 1 sampai 1000 meter")
		}
	}
	if key == "jam_masuk_normal" && !validTime(value) {
		return invalid(c, "Format jam masuk normal tidak valid")
	}
	if key == "toleransi_terlambat" {
		if n, err := strconv.Atoi(value); err != nil || n < 0 || n > 240 {
			return invalid(c, "Toleransi keterlambatan harus antara 0 sampai 240 menit")
		}
	}
	if key == "jam_min_pulang" && !validTime(value) {
		return invalid(c, "Format jam minimal pulang tidak valid")
	}
	if key == "workday_days" {
		if _, ok := parseWorkdayDays(value); !ok {
			return invalid(c, "Hari kerja harus berupa daftar angka 0 sampai 6; kosong berarti Sabtu saja")
		}
		value = normalizeCSVNumbers(value, 0, 6)
	}
	if key == "piket_rotation_enabled" && value != "0" && value != "1" {
		return invalid(c, "Nilai rotasi piket harus 0 atau 1")
	}
	if key == "piket_group_a_weeks" || key == "piket_group_b_weeks" {
		value = normalizeCSVNumbers(value, 1, 4)
	}
	if key == "piket_week5_mode" && !contains([]string{"all", "none", "A", "B"}, value) {
		return invalid(c, "Mode pekan kelima harus all, none, A, atau B")
	}
	if (key == "piket_jam_masuk" || key == "piket_jam_pulang") && !validTime(value) {
		return invalid(c, "Format waktu rotasi piket tidak valid")
	}
	if strings.HasSuffix(key, "_enabled") || key == "mode_testing" || key == "qr_enabled" || key == "button_enabled" || key == "weekend_workday_enabled" {
		if value != "0" && value != "1" {
			return invalid(c, "Nilai setting harus 0 atau 1")
		}
	}
	var setting models.Setting
	query := h.db.Where("setting_key = ?", key).First(&setting)
	if query.Error != nil && query.Error != gorm.ErrRecordNotFound {
		return query.Error
	}
	updates := map[string]any{"setting_value": value, "updated_by": claims.UserID, "updated_at": time.Now().UTC()}
	if query.Error == gorm.ErrRecordNotFound {
		setting = models.Setting{Key: key, Value: value}
		if err := h.db.Create(&setting).Error; err != nil {
			return err
		}
	} else if err := h.db.Model(&setting).Updates(updates).Error; err != nil {
		return err
	}
	return httpx.Success(c, "Setting berhasil disimpan", nil)
}

func visibleSettings(settings map[string]string, role string) map[string]string {
	if role == "admin" {
		return settings
	}
	visible := make(map[string]string, len(settings))
	for key, value := range settings {
		visible[key] = value
	}
	for _, key := range []string{"qr_secret", "qr_active_nonce", "qr_expires_at"} {
		delete(visible, key)
	}
	return visible
}

func (h *Handler) holidays(c *fiber.Ctx) error {
	if c.Method() == fiber.MethodGet {
		if check := c.Query("check"); check != "" {
			return h.checkDate(c, check)
		}
		query := h.db.Order("tanggal ASC")
		if value := c.Query("tanggal"); value != "" {
			query = query.Where("tanggal = ?", value)
		}
		if start, end := c.Query("start_date"), c.Query("end_date"); start != "" && end != "" {
			query = query.Where("tanggal BETWEEN ? AND ?", start, end)
		}
		if year := c.Query("year"); year != "" {
			if h.db.Dialector.Name() == "sqlite" {
				if parsedYear, err := strconv.Atoi(year); err != nil || parsedYear < 1900 || parsedYear > 2200 {
					return invalid(c, "Parameter year tidak valid")
				}
				query = query.Where("strftime('%Y', tanggal) = ?", year)
			} else {
				query = query.Where("YEAR(tanggal) = ?", year)
			}
		}
		var rows []models.Holiday
		if err := query.Find(&rows).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Data hari libur berhasil diambil", rows)
	}
	claims, err := userClaims(c)
	if err != nil {
		return err
	}
	if claims.Role != "admin" {
		return fiber.ErrForbidden
	}
	body, err := readJSON(c)
	if err != nil {
		return invalid(c, err.Error())
	}
	switch c.Method() {
	case fiber.MethodPost:
		return h.createHoliday(c, body)
	case fiber.MethodPut:
		id, err := uintValue(body, "id")
		if err != nil {
			return invalid(c, "ID hari libur harus diisi")
		}
		date, err := parseDate(stringValue(body, "tanggal"), appLocation(h))
		if err != nil {
			return invalid(c, "Format tanggal tidak valid")
		}
		updates := map[string]any{"tanggal": date.Format("2006-01-02"), "nama": stringValue(body, "nama"), "jenis": stringValue(body, "jenis"), "keterangan": stringValue(body, "keterangan"), "is_workday": boolValue(body, "isWorkday", "is_workday"), "jam_masuk_khusus": stringValue(body, "jamMasukKhusus", "jam_masuk_khusus")}
		if updates["nama"] == "" || updates["jenis"] == "" {
			return invalid(c, "Nama dan jenis hari libur harus diisi")
		}
		if err := h.db.Model(&models.Holiday{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Hari libur berhasil diupdate", nil)
	case fiber.MethodDelete:
		id, err := queryUint(c, "id")
		if err != nil {
			return invalid(c, "ID hari libur harus diisi")
		}
		if err := h.db.Delete(&models.Holiday{}, id).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Hari libur berhasil dihapus", nil)
	default:
		return fiber.ErrMethodNotAllowed
	}
}

func (h *Handler) createHoliday(c *fiber.Ctx, body map[string]any) error {
	name := stringValue(body, "nama")
	kind := stringValue(body, "jenis")
	if name == "" {
		return invalid(c, "Tanggal dan nama harus diisi")
	}
	if kind == "" {
		kind = "nasional"
	}
	if !contains([]string{"nasional", "cuti_bersama", "sekolah"}, kind) {
		return invalid(c, "Jenis libur tidak valid")
	}
	start := stringValue(body, "start_date")
	end := stringValue(body, "end_date")
	if start == "" {
		start = stringValue(body, "tanggal")
		end = start
	}
	startDate, err := parseDate(start, appLocation(h))
	if err != nil {
		return invalid(c, "Format tanggal tidak valid")
	}
	endDate, err := parseDate(end, appLocation(h))
	if err != nil || endDate.Before(startDate) {
		return invalid(c, "Rentang tanggal tidak valid")
	}
	for date := startDate; !date.After(endDate); date = date.AddDate(0, 0, 1) {
		var holiday models.Holiday
		query := h.db.Where("tanggal = ?", date.Format("2006-01-02")).First(&holiday)
		updates := map[string]any{"nama": name, "jenis": kind, "keterangan": stringValue(body, "keterangan"), "is_workday": boolValue(body, "isWorkday", "is_workday"), "jam_masuk_khusus": stringValue(body, "jamMasukKhusus", "jam_masuk_khusus")}
		if query.Error == gorm.ErrRecordNotFound {
			holiday = models.Holiday{Tanggal: date, Nama: name, Jenis: kind, Keterangan: pointerString(stringValue(body, "keterangan")), IsWorkday: boolValue(body, "isWorkday", "is_workday"), JamMasukKhusus: pointerString(stringValue(body, "jamMasukKhusus", "jam_masuk_khusus"))}
			if err := h.db.Create(&holiday).Error; err != nil {
				return err
			}
		} else if query.Error == nil {
			if err := h.db.Model(&holiday).Updates(updates).Error; err != nil {
				return err
			}
		} else {
			return query.Error
		}
	}
	return httpx.Success(c, "Hari libur berhasil disimpan", nil)
}

func (h *Handler) checkDate(c *fiber.Ctx, value string) error {
	date, err := parseDate(value, appLocation(h))
	if err != nil {
		return invalid(c, "Format tanggal tidak valid")
	}
	var holiday models.Holiday
	query := h.db.Where("tanggal = ?", date.Format("2006-01-02")).First(&holiday)
	hasHoliday := query.Error == nil
	if query.Error != nil && query.Error != gorm.ErrRecordNotFound {
		return query.Error
	}
	weekend := date.Weekday() == time.Saturday || date.Weekday() == time.Sunday
	gender := c.Query("jenis_kelamin")
	if gender == "" {
		gender = c.Query("jenisKelamin")
	}
	user := models.User{}
	if gender != "" {
		user.JenisKelamin = &gender
	}
	workday, optional, err := h.isWorkday(user, date)
	if err != nil {
		return err
	}
	effectiveWorkday := workday || optional
	return httpx.Success(c, "Pengecekan hari berhasil", fiber.Map{"tanggal": date.Format("2006-01-02"), "isHoliday": hasHoliday && !holiday.IsWorkday, "isWeekend": weekend, "isWeekendWorkday": weekend && effectiveWorkday && !hasHoliday, "isWorkday": effectiveWorkday, "jamMasukKhusus": holiday.JamMasukKhusus, "holidayName": holiday.Nama, "holidayType": holiday.Jenis, "dayName": dayName(date.Weekday())})
}

func dayName(day time.Weekday) string {
	switch day {
	case time.Monday:
		return "Senin"
	case time.Tuesday:
		return "Selasa"
	case time.Wednesday:
		return "Rabu"
	case time.Thursday:
		return "Kamis"
	case time.Friday:
		return "Jumat"
	case time.Saturday:
		return "Sabtu"
	default:
		return "Minggu"
	}
}

func (h *Handler) jadwalPiket(c *fiber.Ctx) error {
	claims, err := userClaims(c)
	if err != nil {
		return err
	}
	if c.Method() == fiber.MethodGet {
		query := h.db.Order("hari ASC, jam_piket ASC, id ASC")
		if claims.Role == "guru" {
			query = query.Where("user_id = ?", claims.UserID)
		}
		if c.Query("today") == "1" {
			query = query.Where("hari = ?", dayName(time.Now().In(appLocation(h)).Weekday()))
		}
		var rows []models.JadwalPiket
		if err := query.Find(&rows).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Data jadwal piket berhasil diambil", rows)
	}
	if claims.Role != "admin" {
		return fiber.ErrForbidden
	}
	body, err := readJSON(c)
	if err != nil {
		return invalid(c, err.Error())
	}
	switch c.Method() {
	case fiber.MethodPost:
		userID, err := uintValue(body, "user_id", "userId")
		if err != nil {
			return invalid(c, "Guru piket harus diisi")
		}
		var user models.User
		if err := h.db.Where("id = ? AND role = ?", userID, "guru").First(&user).Error; err != nil {
			return httpx.Error(c, fiber.StatusNotFound, "USER_NOT_FOUND", "Guru tidak ditemukan")
		}
		row := models.JadwalPiket{UserID: userID, NamaGuru: user.Nama, Hari: stringValue(body, "hari"), JamPiket: pointerString(normalizeTime(stringValue(body, "jam_piket", "jamPiket"))), JamPulangPiket: pointerString(normalizeTime(stringValue(body, "jam_pulang_piket", "jamPulangPiket"))), Keterangan: pointerString(stringValue(body, "keterangan")), IsActive: true}
		if row.Hari == "" {
			return invalid(c, "Hari harus diisi")
		}
		if err := h.db.Create(&row).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Jadwal piket berhasil ditambahkan", row)
	case fiber.MethodPut, fiber.MethodPatch:
		id, err := uintValue(body, "id")
		if err != nil {
			return invalid(c, "ID jadwal harus diisi")
		}
		updates := map[string]any{}
		for key, column := range map[string]string{"hari": "hari", "jam_piket": "jam_piket", "jamPiket": "jam_piket", "jam_pulang_piket": "jam_pulang_piket", "jamPulangPiket": "jam_pulang_piket", "keterangan": "keterangan", "is_active": "is_active"} {
			if value, ok := body[key]; ok {
				updates[column] = value
			}
		}
		if c.Method() == fiber.MethodPatch && len(updates) == 0 {
			updates["is_active"] = !boolValue(body, "is_active")
		}
		if err := h.db.Model(&models.JadwalPiket{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Jadwal piket berhasil diupdate", nil)
	case fiber.MethodDelete:
		id, err := queryUint(c, "id")
		if err != nil {
			return invalid(c, "ID jadwal harus diisi")
		}
		if err := h.db.Delete(&models.JadwalPiket{}, id).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Jadwal piket berhasil dihapus", nil)
	default:
		return fiber.ErrMethodNotAllowed
	}
}

func (h *Handler) guruProfile(c *fiber.Ctx) error {
	claims, err := userClaims(c)
	if err != nil {
		return err
	}
	var user models.User
	if err := h.db.First(&user, claims.UserID).Error; err != nil {
		return fiber.ErrUnauthorized
	}
	if c.Method() == fiber.MethodGet {
		return httpx.Success(c, "Profil berhasil diambil", mapUser(user))
	}
	body, err := readJSON(c)
	if err != nil {
		return invalid(c, err.Error())
	}
	if c.Method() == fiber.MethodPut {
		updates := map[string]any{}
		if rawEmail, ok := body["email"]; ok {
			email := strings.TrimSpace(stringValue(body, "email"))
			if user.Role == "guru" && email != "" {
				currentEmail := ""
				if user.Email != nil {
					currentEmail = strings.TrimSpace(*user.Email)
				}
				if email != currentEmail && !isGmailAddress(email) {
					return invalid(c, "Gunakan alamat Gmail yang valid dan berakhiran @gmail.com")
				}
			}
			if rawEmail == nil || email == "" {
				updates["email"] = nil
			} else {
				updates["email"] = email
			}
		}
		for _, field := range []struct{ api, legacy, column string }{
			{api: "noHP", legacy: "no_hp", column: "no_hp"},
			{api: "alamat", legacy: "alamat", column: "alamat"},
		} {
			if _, ok := body[field.api]; ok {
				updates[field.column] = pointerString(stringValue(body, field.api))
			} else if field.legacy != field.api {
				if _, ok := body[field.legacy]; ok {
					updates[field.column] = pointerString(stringValue(body, field.legacy))
				}
			}
		}
		if _, ok := body["tandaTangan"]; ok {
			if user.Role != "guru" {
				return fiber.ErrForbidden
			}
			value := strings.TrimSpace(stringValue(body, "tandaTangan"))
			if err := validateSignature(value); err != nil {
				return invalid(c, err.Error())
			}
			updates["tanda_tangan"] = pointerString(value)
		} else if _, ok := body["tanda_tangan"]; ok {
			if user.Role != "guru" {
				return fiber.ErrForbidden
			}
			value := strings.TrimSpace(stringValue(body, "tanda_tangan"))
			if err := validateSignature(value); err != nil {
				return invalid(c, err.Error())
			}
			updates["tanda_tangan"] = pointerString(value)
		}
		if len(updates) == 0 {
			return invalid(c, "Tidak ada data profil yang diubah")
		}
		if err := h.db.Model(&user).Updates(updates).Error; err != nil {
			return err
		}
		if err := h.db.First(&user, claims.UserID).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Profil berhasil diupdate", mapUser(user))
	}
	if c.Method() == fiber.MethodPost {
		oldPassword := stringValue(body, "passwordLama", "oldPassword")
		newPassword := stringValue(body, "passwordBaru", "newPassword")
		if err := auth.ComparePassword(user.Password, oldPassword); err != nil {
			return httpx.Error(c, fiber.StatusUnauthorized, "PASSWORD_INVALID", "Password lama salah")
		}
		hash, err := auth.HashPassword(newPassword)
		if err != nil {
			return invalid(c, err.Error())
		}
		if err := h.db.Model(&user).Update("password", hash).Error; err != nil {
			return err
		}
		_ = h.db.Model(&models.RefreshToken{}).Where("user_id = ? AND revoked_at IS NULL", user.ID).Update("revoked_at", time.Now().UTC()).Error
		return httpx.Success(c, "Password berhasil diubah", nil)
	}
	return fiber.ErrMethodNotAllowed
}

func validateSignature(value string) error {
	if value == "" {
		return nil
	}
	const prefix = "data:image/png;base64,"
	if !strings.HasPrefix(value, prefix) || len(value) > 2*1024*1024 {
		return fmt.Errorf("Tanda tangan harus berupa PNG base64 dengan ukuran maksimal 2 MB")
	}
	binary, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(value, prefix))
	if err != nil || len(binary) < 100 || !bytes.HasPrefix(binary, []byte("\x89PNG\r\n\x1a\n")) {
		return fmt.Errorf("Data tanda tangan PNG rusak atau terlalu kecil")
	}
	return nil
}

func isGmailAddress(email string) bool {
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Address != email {
		return false
	}
	at := strings.LastIndexByte(parsed.Address, '@')
	return at > 0 && strings.EqualFold(parsed.Address[at+1:], "gmail.com")
}

func (h *Handler) requireTeacherGmail(c *fiber.Ctx, userID uint) error {
	var user models.User
	if err := h.db.Select("id, email").Where("id = ? AND role = ? AND archived_at IS NULL", userID, "guru").First(&user).Error; err != nil {
		return err
	}
	if user.Email == nil || !isGmailAddress(strings.TrimSpace(*user.Email)) {
		return httpx.Error(c, fiber.StatusForbidden, "GMAIL_REQUIRED", "Sebelum melakukan presensi, mohon lengkapi Gmail aktif berakhiran @gmail.com melalui menu Akun.")
	}
	return nil
}

func (h *Handler) guruHome(c *fiber.Ctx) error {
	user, err := requireUser(c)
	if err != nil {
		return err
	}
	date := today(h)
	var attendance models.AttendanceLog
	attendanceQuery := h.db.Where("user_id = ? AND tanggal = ?", user.ID, date).First(&attendance)
	var schedule models.JadwalPiket
	scheduleQuery := h.db.Where("user_id = ? AND hari = ? AND is_active = 1", user.ID, dayName(time.Now().In(appLocation(h)).Weekday())).First(&schedule)
	settings, err := settingsMap(h.db)
	if err != nil {
		return err
	}
	attendanceDate, err := parseDate(date, appLocation(h))
	if err != nil {
		return err
	}
	workday, optional, err := h.isWorkday(user, attendanceDate)
	if err != nil {
		return err
	}
	var holiday models.Holiday
	holidayQuery := h.db.Where("tanggal = ?", date).First(&holiday)
	if holidayQuery.Error != nil && holidayQuery.Error != gorm.ErrRecordNotFound {
		return holidayQuery.Error
	}
	hasHoliday := holidayQuery.Error == nil
	isWeekend := attendanceDate.Weekday() == time.Saturday || attendanceDate.Weekday() == time.Sunday
	effectiveWorkday := workday || optional
	pulangTarget, hasPiketPulangTarget, err := h.checkoutTarget(user.ID, attendanceDate, settings)
	if err != nil {
		return err
	}
	settings = visibleSettings(settings, user.Role)
	return httpx.Success(c, "Data dashboard guru berhasil diambil", fiber.Map{"today": date, "settings": settings, "holiday": fiber.Map{"tanggal": date, "isHoliday": hasHoliday && !holiday.IsWorkday, "isWeekend": isWeekend, "isWorkday": effectiveWorkday, "dayName": dayName(attendanceDate.Weekday()), "holidayName": holiday.Nama, "holidayType": holiday.Jenis, "jamMasukKhusus": holiday.JamMasukKhusus}, "attendance": func() any {
		if attendanceQuery.Error == nil {
			return mapAttendance(attendance)
		}
		return nil
	}(), "pulangThreshold": pulangTarget, "piketPulangTarget": func() any {
		if hasPiketPulangTarget {
			return pulangTarget
		}
		return nil
	}(), "piket": fiber.Map{"hari": dayName(time.Now().In(appLocation(h)).Weekday()), "mine": func() any {
		if scheduleQuery.Error == nil {
			return schedule
		}
		return nil
	}(), "isPiketToday": scheduleQuery.Error == nil}})
}

func (h *Handler) statusRekan(c *fiber.Ctx) error {
	user, err := requireUser(c)
	if err != nil {
		return err
	}
	var users []models.User
	if err := h.db.Where("role = ? AND archived_at IS NULL AND id <> ?", "guru", user.ID).Order("nama ASC").Find(&users).Error; err != nil {
		return err
	}
	date := today(h)
	attendanceDate, err := parseDate(date, appLocation(h))
	if err != nil {
		return err
	}
	settings, err := settingsMap(h.db)
	if err != nil {
		return err
	}
	items := make([]map[string]any, 0, len(users))
	for _, teacher := range users {
		var attendance models.AttendanceLog
		query := h.db.Where("user_id = ? AND tanggal = ?", teacher.ID, date).Limit(1).Find(&attendance)
		if query.Error != nil {
			return query.Error
		}
		status := "belum"
		storedStatus := status
		jamMasuk := "-"
		var jamPulang any
		var lateMinutes *int
		if query.RowsAffected > 0 {
			status = attendance.Status
			storedStatus = status
			status, err = h.derivedAttendanceStatus(teacher, attendance, attendanceDate, settings)
			if err != nil {
				return err
			}
			if contains([]string{"hadir_terlambat", "hadir_izin_terlambat"}, status) {
				lateMinutes, err = h.lateMinutesForAttendance(teacher, attendance, attendanceDate, settings)
				if err != nil {
					return err
				}
			}
			if attendance.JamMasuk != nil {
				jamMasuk = *attendance.JamMasuk
			} else if attendance.JamHadir != nil {
				jamMasuk = *attendance.JamHadir
			}
			jamPulang = attendance.JamPulang
			if contains([]string{"hadir", "hadir_terlambat", "hadir_izin_terlambat"}, status) && attendance.JamPulang != nil {
				status = "sudah_pulang"
			}
		}
		var roles []string
		if teacher.Jabatan != nil {
			_ = json.Unmarshal([]byte(*teacher.Jabatan), &roles)
		}
		items = append(items, map[string]any{"id": teacher.ID, "nama": teacher.Nama, "jabatan": roles, "statusFinal": status, "statusAsli": storedStatus, "jamMasuk": jamMasuk, "jamPulang": jamPulang, "lateMinutes": lateMinutes})
	}
	return httpx.Success(c, "Status rekan guru berhasil diambil", fiber.Map{"tanggal": date, "items": items})
}
