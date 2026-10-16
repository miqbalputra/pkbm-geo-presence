package compat

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/auth"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/httpx"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
)

func (h *Handler) RegisterCoreRoutes(app fiber.Router) {
	attachDB(app, h.db)
	protected := auth.RequireActiveUser(h.db, h.jwt)
	admin := []string{"admin"}
	directory := auth.RequireRoles("admin", "kepala_sekolah")

	app.All("/api/guru.php", protected, directory, h.guru)
	app.All("/api/presensi.php", protected, h.presensi)
	app.All("/api/activity.php", protected, h.activity)
	app.All("/api/settings.php", protected, h.settings)
	app.All("/api/holidays.php", protected, h.holidays)
	app.All("/api/jadwal_piket.php", protected, h.rotationOverview)
	app.All("/api/guru_profile.php", protected, h.guruProfile)
	app.All("/api/admin_profile.php", protected, auth.RequireRoles("admin", "kepala_sekolah"), h.adminProfile)
	app.All("/api/kepala_sekolah.php", protected, auth.RequireRoles("admin"), h.kepalaSekolahAccount)
	app.All("/api/guru_home.php", protected, auth.RequireRoles("guru"), h.guruHome)
	app.All("/api/status_rekan.php", protected, auth.RequireRoles("guru"), h.statusRekan)
	app.All("/api/optional_workdays.php", protected, auth.RequireRoles(admin...), h.optionalWorkdays)
	app.All("/api/weekend_overrides.php", protected, auth.RequireRoles(admin...), h.weekendOverrides)
	app.All("/api/pengaturan_harian.php", protected, auth.RequireRoles(admin...), h.pengaturanHarian)

	// REST v1 aliases. Legacy .php routes above remain available during the
	// migration window so old clients and n8n workflows do not break.
	v1 := app.Group("/api/v1")
	v1.All("/users", protected, directory, h.guru)
	v1.All("/attendance", protected, h.presensi)
	v1.All("/activities", protected, h.activity)
	v1.All("/settings", protected, h.settings)
	v1.All("/holidays", protected, h.holidays)
	v1.All("/schedules/piket", protected, h.jadwalPiket)
	v1.All("/schedules/rotation", protected, h.rotationOverview)
	v1.All("/profile", protected, h.guruProfile)
	v1.All("/guru/home", protected, auth.RequireRoles("guru"), h.guruHome)
	v1.All("/guru/peers", protected, auth.RequireRoles("guru"), h.statusRekan)
	v1.Get("/guru/ranking", protected, auth.RequireRoles("guru"), h.guruRanking)
	v1.Get("/guru/monthly-confirmation", protected, auth.RequireRoles("guru"), h.guruMonthlyConfirmation)
	v1.Post("/guru/monthly-confirmation/confirm", protected, auth.RequireRoles("guru"), h.confirmMonthlyConfirmation)
	v1.Post("/guru/monthly-confirmation/correction-request", protected, auth.RequireRoles("guru"), h.requestMonthlyCorrection)
	v1.Get("/attendance-revision-requests", protected, h.listAttendanceRevisionRequests)
	v1.Post("/attendance-revision-requests", protected, auth.RequireRoles("guru"), h.createAttendanceRevisionRequest)
	v1.Post("/attendance-revision-requests/:id/approve", protected, auth.RequireRoles("admin", "kepala_sekolah"), h.approveAttendanceRevisionRequest)
	v1.Post("/attendance-revision-requests/:id/reject", protected, auth.RequireRoles("admin", "kepala_sekolah"), h.rejectAttendanceRevisionRequest)
	v1.Get("/admin/monthly-confirmations", protected, auth.RequireRoles("admin", "kepala_sekolah"), h.adminMonthlyConfirmations)
	v1.Post("/admin/monthly-confirmations/:userId/confirm", protected, auth.RequireRoles("admin", "kepala_sekolah"), h.adminConfirmMonthlyConfirmation)
	v1.All("/admin/monthly-confirmation-contact", protected, auth.RequireRoles("admin"), h.monthlyConfirmationContact)
	v1.All("/operations/optional-workdays", protected, auth.RequireRoles(admin...), h.optionalWorkdays)
	v1.All("/operations/weekend-overrides", protected, auth.RequireRoles(admin...), h.weekendOverrides)
	v1.All("/operations/daily-settings", protected, auth.RequireRoles(admin...), h.pengaturanHarian)
	v1.Get("/operations/checkin-recalculation", protected, auth.RequireRoles(admin...), h.todayCheckInRecalculation)
	v1.Post("/operations/checkin-recalculation", protected, auth.RequireRoles(admin...), h.todayCheckInRecalculation)
	// Kept for the initial UI shipped before the date picker was added.
	v1.Get("/operations/today-checkin-recalculation", protected, auth.RequireRoles(admin...), h.todayCheckInRecalculation)
	v1.Post("/operations/today-checkin-recalculation", protected, auth.RequireRoles(admin...), h.todayCheckInRecalculation)
}

func (h *Handler) guru(c *fiber.Ctx) error {
	method := c.Method()
	if method == fiber.MethodGet {
		query := h.db.Where("role = ?", "guru")
		if c.Query("archived") == "1" {
			query = query.Where("archived_at IS NOT NULL")
		} else if c.Query("include_archived") != "1" {
			query = query.Where("archived_at IS NULL")
		}
		if id := c.Query("id"); id != "" {
			uid, err := parseUint(id)
			if err != nil {
				return invalid(c, "ID guru tidak valid")
			}
			query = query.Where("id = ?", uid)
			var user models.User
			if err := query.First(&user).Error; err != nil {
				if err == gorm.ErrRecordNotFound {
					return httpx.Error(c, fiber.StatusNotFound, "NOT_FOUND", "Guru tidak ditemukan")
				}
				return err
			}
			return httpx.Success(c, "Data guru ditemukan", mapUser(user))
		}
		var users []models.User
		if err := query.Order("archived_at IS NOT NULL, id ASC").Find(&users).Error; err != nil {
			return err
		}
		data := make([]map[string]any, 0, len(users))
		for _, user := range users {
			data = append(data, mapUser(user))
		}
		return httpx.Success(c, "Data guru berhasil diambil", data)
	}

	claims, err := userClaims(c)
	if err != nil {
		return err
	}
	if claims.Role != "admin" {
		return fiber.ErrForbidden
	}
	if method == fiber.MethodPost && (c.Query("action") == "archive" || c.Query("action") == "unarchive") {
		body, err := readJSON(c)
		if err != nil {
			return invalid(c, err.Error())
		}
		id, err := uintValue(body, "id")
		if err != nil {
			return invalid(c, "ID guru harus diisi")
		}
		var user models.User
		if err := h.db.Where("id = ? AND role = ?", id, "guru").First(&user).Error; err != nil {
			return httpx.Error(c, fiber.StatusNotFound, "NOT_FOUND", "Guru tidak ditemukan")
		}
		if c.Query("action") == "archive" {
			reason := stringValue(body, "reason")
			if err := h.db.Model(&user).Updates(map[string]any{"archived_at": time.Now().UTC(), "archive_reason": pointerString(reason)}).Error; err != nil {
				return err
			}
			return httpx.Success(c, "Guru berhasil diarsipkan. Data presensi tetap tersimpan.", nil)
		}
		if err := h.db.Model(&user).Updates(map[string]any{"archived_at": nil, "archive_reason": nil}).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Guru berhasil dipulihkan dari arsip", nil)
	}
	if method == fiber.MethodDelete {
		id, err := queryUint(c, "id")
		if err != nil {
			return invalid(c, "ID guru harus diisi")
		}
		if err := h.db.Where("id = ? AND role = ?", id, "guru").Delete(&models.User{}).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Guru berhasil dihapus", nil)
	}
	body, err := readJSON(c)
	if err != nil {
		return invalid(c, err.Error())
	}
	if method == fiber.MethodPost {
		return h.createGuru(c, body)
	}
	if method == fiber.MethodPut {
		return h.updateGuru(c, body)
	}
	return fiber.ErrMethodNotAllowed
}

func (h *Handler) createGuru(c *fiber.Ctx, body map[string]any) error {
	idGuru := stringValue(body, "idGuru", "id_guru")
	username := stringValue(body, "username")
	password := stringValue(body, "password")
	name := stringValue(body, "nama")
	if idGuru == "" || username == "" || password == "" || name == "" {
		return invalid(c, "ID Guru, username, nama, dan password harus diisi")
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return invalid(c, err.Error())
	}
	jabatan, _ := json.Marshal(body["jabatan"])
	user := models.User{IDGuru: pointerString(idGuru), Username: username, Password: hash, Role: "guru", Nama: name, JenisKelamin: pointerString(stringValue(body, "jenisKelamin", "jenis_kelamin")), Alamat: pointerString(stringValue(body, "alamat")), NoHP: pointerString(stringValue(body, "noHP", "no_hp")), Jabatan: pointerString(string(jabatan)), TipeGuru: stringValue(body, "tipeGuru", "tipe_guru")}
	group := stringValue(body, "piketGroup", "piket_group")
	pokjar := stringValue(body, "pokjar")
	if group != "" && group != "A" && group != "B" {
		return invalid(c, "Grup piket harus A atau B")
	}
	if pokjar != "" && !contains([]string{"Lentera Qalbu", "Umar bin Khattab", "Nashirus Sunnah"}, pokjar) {
		return invalid(c, "Pokjar tidak dikenal")
	}
	user.PiketGroup = pointerString(group)
	user.Pokjar = pointerString(pokjar)
	user.TandaTangan = pointerString(stringValue(body, "tandaTangan", "tanda_tangan"))
	if user.TipeGuru == "" {
		user.TipeGuru = "full_time"
	}
	if date := stringValue(body, "tanggalBertugas", "tanggal_bertugas"); date != "" {
		parsed, err := parseDate(date, appLocation(h))
		if err != nil {
			return invalid(c, "Format tanggal bertugas tidak valid")
		}
		user.TanggalBertugas = &parsed
	}
	if date := stringValue(body, "tanggalLahir", "tanggal_lahir"); date != "" {
		parsed, err := parseDate(date, appLocation(h))
		if err != nil {
			return invalid(c, "Format tanggal lahir tidak valid")
		}
		user.TanggalLahir = &parsed
	}
	if err := h.db.Create(&user).Error; err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate") {
			return httpx.Error(c, fiber.StatusConflict, "DUPLICATE", "ID Guru atau username sudah digunakan")
		}
		return err
	}
	return httpx.Success(c, "Guru berhasil ditambahkan", fiber.Map{"id": user.ID})
}

func (h *Handler) updateGuru(c *fiber.Ctx, body map[string]any) error {
	id, err := uintValue(body, "id")
	if err != nil {
		return invalid(c, "ID guru harus diisi")
	}
	updates := map[string]any{}
	for key, column := range map[string]string{"idGuru": "id_guru", "username": "username", "nama": "nama", "jenisKelamin": "jenis_kelamin", "alamat": "alamat", "noHP": "no_hp", "tanggalBertugas": "tanggal_bertugas", "tanggalLahir": "tanggal_lahir", "tipeGuru": "tipe_guru", "piketGroup": "piket_group", "piket_group": "piket_group", "pokjar": "pokjar", "tandaTangan": "tanda_tangan", "tanda_tangan": "tanda_tangan"} {
		if value, ok := body[key]; ok {
			if key == "piketGroup" || key == "piket_group" {
				group := stringValue(body, key)
				if group != "" && group != "A" && group != "B" {
					return invalid(c, "Grup piket harus A atau B")
				}
				updates[column] = pointerString(group)
			} else if key == "pokjar" {
				pokjar := stringValue(body, key)
				if pokjar != "" && !contains([]string{"Lentera Qalbu", "Umar bin Khattab", "Nashirus Sunnah"}, pokjar) {
					return invalid(c, "Pokjar tidak dikenal")
				}
				updates[column] = pointerString(pokjar)
			} else {
				updates[column] = value
			}
		}
	}
	if value, ok := body["jabatan"]; ok {
		encoded, _ := json.Marshal(value)
		updates["jabatan"] = string(encoded)
	}
	if password := stringValue(body, "password"); password != "" {
		hash, err := auth.HashPassword(password)
		if err != nil {
			return invalid(c, err.Error())
		}
		updates["password"] = hash
	}
	for _, field := range []string{"tanggal_bertugas", "tanggal_lahir"} {
		if value, ok := updates[field].(string); ok && value != "" {
			parsed, err := parseDate(value, appLocation(h))
			if err != nil {
				return invalid(c, "Format tanggal tidak valid")
			}
			updates[field] = parsed.Format("2006-01-02")
		}
	}
	if len(updates) == 0 {
		return invalid(c, "Tidak ada data yang diubah")
	}
	if err := h.db.Model(&models.User{}).Where("id = ? AND role = ?", id, "guru").Updates(updates).Error; err != nil {
		return err
	}
	return httpx.Success(c, "Guru berhasil diupdate", nil)
}

func (h *Handler) presensi(c *fiber.Ctx) error {
	claims, err := userClaims(c)
	if err != nil {
		return err
	}
	switch c.Method() {
	case fiber.MethodGet:
		return h.listAttendance(c, claims)
	case fiber.MethodPost:
		if claims.Role != "admin" && claims.Role != "guru" {
			return fiber.ErrForbidden
		}
		body, err := readJSON(c)
		if err != nil {
			return invalid(c, err.Error())
		}
		return h.createAttendance(c, claims, body)
	case fiber.MethodPut:
		if claims.Role != "admin" && claims.Role != "guru" {
			return fiber.ErrForbidden
		}
		body, err := readJSON(c)
		if err != nil {
			return invalid(c, err.Error())
		}
		return h.updateAttendance(c, claims, body)
	case fiber.MethodDelete:
		if claims.Role != "admin" {
			return fiber.ErrForbidden
		}
		id, err := queryUint(c, "id")
		if err != nil {
			return invalid(c, "ID presensi harus diisi")
		}
		if err := h.db.Delete(&models.AttendanceLog{}, id).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Presensi berhasil dihapus", nil)
	default:
		return fiber.ErrMethodNotAllowed
	}
}

func (h *Handler) listAttendance(c *fiber.Ctx, claims *auth.Claims) error {
	query := h.db.Model(&models.AttendanceLog{}).Order("tanggal DESC, id DESC")
	if claims.Role == "guru" && c.Query("status_rekan") != "1" {
		query = query.Where("user_id = ?", claims.UserID)
	} else if claims.Role == "guru" && c.Query("status_rekan") == "1" {
		query = query.Where("tanggal = ?", today(h))
	}
	if value := c.Query("user_id"); value != "" && claims.Role != "guru" {
		id, err := parseUint(value)
		if err != nil {
			return invalid(c, "user_id tidak valid")
		}
		query = query.Where("user_id = ?", id)
	}
	if value := c.Query("id"); value != "" {
		id, err := parseUint(value)
		if err != nil {
			return invalid(c, "id tidak valid")
		}
		query = query.Where("id = ?", id)
	}
	if value := c.Query("tanggal"); value != "" {
		if _, err := parseDate(value, appLocation(h)); err != nil {
			return invalid(c, "Format tanggal tidak valid")
		}
		query = query.Where("tanggal = ?", value)
	}
	if start, end := c.Query("start_date"), c.Query("end_date"); start != "" && end != "" {
		if _, err := parseDate(start, appLocation(h)); err != nil {
			return invalid(c, "Format start_date tidak valid")
		}
		if _, err := parseDate(end, appLocation(h)); err != nil {
			return invalid(c, "Format end_date tidak valid")
		}
		query = query.Where("tanggal BETWEEN ? AND ?", start, end)
	}
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	var rows []models.AttendanceLog
	if err := query.Find(&rows).Error; err != nil {
		return err
	}
	data := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		data = append(data, mapAttendance(row))
	}
	return httpx.Success(c, "Data presensi berhasil diambil", data)
}

func (h *Handler) createAttendance(c *fiber.Ctx, claims *auth.Claims, body map[string]any) error {
	userID, err := uintValue(body, "userId", "user_id")
	if claims.Role == "guru" {
		userID = claims.UserID
	}
	if err != nil && claims.Role != "guru" {
		return invalid(c, "User presensi harus diisi")
	}
	var user models.User
	if err := h.db.Select("id, nama, tipe_guru, email, pokjar, jenis_kelamin, created_at").Where("id = ? AND role = ? AND archived_at IS NULL", userID, "guru").First(&user).Error; err != nil {
		return httpx.Error(c, fiber.StatusNotFound, "USER_NOT_FOUND", "Data guru tidak ditemukan")
	}
	isPokjar := user.Pokjar != nil && strings.TrimSpace(*user.Pokjar) != ""
	status := stringValue(body, "status")
	if status == "" {
		status = "hadir"
	}
	if !contains([]string{"hadir", "hadir_terlambat", "hadir_izin_terlambat", "izin", "sakit"}, status) {
		return invalid(c, "Status presensi tidak valid")
	}
	if isPokjar && !isAllowedPokjarStatus(status) {
		return invalid(c, "Guru Pokjar hanya dapat mencatat status Hadir, Izin, atau Sakit")
	}
	date := stringValue(body, "tanggal")
	if claims.Role == "guru" || date == "" {
		date = today(h)
	}
	parsedDate, err := parseDate(date, appLocation(h))
	if err != nil {
		return invalid(c, "Format tanggal tidak valid")
	}
	if claims.Role == "guru" {
		workday, optional, workdayErr := h.isWorkday(user, parsedDate)
		if workdayErr != nil {
			return workdayErr
		}
		if !workday && !optional {
			return httpx.Error(c, fiber.StatusConflict, "HOLIDAY_NOT_WORKDAY", "Presensi tidak tersedia pada hari libur atau hari non-kerja")
		}
	}
	lat, hasLat := floatValue(body, "latitude")
	lon, hasLon := floatValue(body, "longitude")
	present := contains([]string{"hadir", "hadir_terlambat", "hadir_izin_terlambat"}, status)
	var attendanceSettings map[string]string
	if present && claims.Role == "guru" && !isPokjar {
		if !hasLat || !hasLon || !validCoordinates(lat, lon) {
			return invalid(c, "Koordinat GPS wajib dan harus valid untuk presensi hadir")
		}
		var settingsErr error
		attendanceSettings, settingsErr = settingsMap(h.db)
		if settingsErr != nil {
			return settingsErr
		}
		if code, message := gpsAccuracyError(attendanceSettings, body); code != "" {
			return httpx.Error(c, fiber.StatusBadRequest, code, message)
		}
		if err := h.enforceLocationWithSettings(attendanceSettings, lat, lon); err != nil {
			return err
		}
	}
	if present && (!hasLat || !hasLon) {
		lat, lon = 0, 0
		hasLat, hasLon = false, false
	}
	jamMasuk := stringValue(body, "jamMasuk", "jam_masuk")
	jamIzin := stringValue(body, "jamIzin", "jam_izin")
	jamSakit := stringValue(body, "jamSakit", "jam_sakit")
	if claims.Role == "guru" {
		serverNow := time.Now().In(appLocation(h))
		serverTime := serverNow.Format("15:04:05")
		if present && !isPokjar {
			jamMasuk = serverTime
			target, targetLabel, targetErr := h.checkInTarget(userID, parsedDate, attendanceSettings)
			if targetErr != nil {
				return targetErr
			}
			var bodyNote string
			status, bodyNote = classifyCheckIn(user, serverNow, target, targetLabel, attendanceSettings["toleransi_terlambat"], stringValue(body, "keterangan"))
			body["keterangan"] = bodyNote
		} else if present {
			// Pokjar is a simple attendance mode: no GPS or lateness calculation.
			status = "hadir"
			jamMasuk = serverTime
		} else if status == "izin" {
			jamIzin = serverTime
		} else if status == "sakit" {
			jamSakit = serverTime
		}
	}
	if present && jamMasuk == "" {
		jamMasuk = time.Now().In(appLocation(h)).Format("15:04:05")
	}
	if jamMasuk != "" && !validTime(jamMasuk) {
		return invalid(c, "Format jam masuk tidak valid")
	}
	accuracy, hasAccuracy := floatValue(body, "accuracy", "accuracy_meters")
	record := models.AttendanceLog{UserID: userID, Nama: user.Nama, Tanggal: parsedDate, Status: status, JamMasuk: pointerString(normalizeTime(jamMasuk)), JamHadir: pointerString(normalizeTime(jamMasuk)), JamIzin: pointerString(normalizeTime(jamIzin)), JamSakit: pointerString(normalizeTime(jamSakit)), Keterangan: pointerString(stringValue(body, "keterangan")), Latitude: pointerFloat(lat, hasLat), Longitude: pointerFloat(lon, hasLon), CheckinAccuracyMeters: pointerFloat(accuracy, hasAccuracy), Metode: stringValue(body, "metode")}
	if qrNonce := stringValue(body, "qr_nonce", "qrNonce"); qrNonce != "" {
		record.QRNonce = pointerString(qrNonce)
	}
	if record.Metode == "" {
		record.Metode = "manual"
	}
	if !present {
		record.JamMasuk, record.JamHadir = nil, nil
	}
	if err := h.db.Create(&record).Error; err != nil {
		if isDuplicateError(err) {
			return httpx.Error(c, fiber.StatusConflict, "DUPLICATE_ATTENDANCE", "Guru sudah memiliki presensi pada tanggal tersebut")
		}
		return err
	}
	verdict := "not_required"
	if present && !isPokjar && hasLat && hasLon {
		verdict = "inside"
		if attendanceSettings["mode_testing"] == "1" {
			verdict = "testing"
		}
	}
	writeAttendanceEvent(h, record, claims, body, attendanceEventType(status), time.Now().In(appLocation(h)), verdict)
	// Audit logging is best-effort. A legacy/misconfigured activity_logs table
	// must never make the attendance itself fail after it has been saved.
	if err := h.db.Create(&models.ActivityLog{
		Waktu:     time.Now().In(appLocation(h)),
		User:      user.Nama,
		Aktivitas: "Input Presensi",
		Status:    status,
	}).Error; err != nil {
		log.Printf("attendance audit log failed for attendance %d: %v", record.ID, err)
	}
	return httpx.Success(c, "Presensi berhasil disimpan", fiber.Map{"id": record.ID, "attendance": mapAttendance(record)})
}

func (h *Handler) updateAttendance(c *fiber.Ctx, claims *auth.Claims, body map[string]any) error {
	id, err := uintValue(body, "id")
	if err != nil {
		return invalid(c, "ID presensi harus diisi")
	}
	var record models.AttendanceLog
	if err := h.db.First(&record, id).Error; err != nil {
		return httpx.Error(c, fiber.StatusNotFound, "NOT_FOUND", "Data presensi tidak ditemukan")
	}
	if claims.Role == "guru" && record.UserID != claims.UserID {
		return fiber.ErrForbidden
	}
	if claims.Role == "guru" {
		var teacher models.User
		if err := h.db.Select("id, pokjar").First(&teacher, claims.UserID).Error; err != nil {
			return err
		}
		if teacher.Pokjar != nil && strings.TrimSpace(*teacher.Pokjar) != "" {
			return httpx.Error(c, fiber.StatusForbidden, "POKJAR_SIMPLE_MODE", "Guru Pokjar menggunakan presensi sederhana tanpa presensi pulang.")
		}
		if record.JamPulang != nil && strings.TrimSpace(*record.JamPulang) != "" {
			return httpx.Error(c, fiber.StatusConflict, "ATTENDANCE_COMPLETED", "Presensi pulang hari ini sudah tercatat")
		}
		if !contains([]string{"hadir", "hadir_terlambat", "hadir_izin_terlambat"}, record.Status) {
			return invalid(c, "Presensi pulang hanya tersedia untuk status hadir")
		}
		lat, hasLat := floatValue(body, "latitude")
		lon, hasLon := floatValue(body, "longitude")
		if !hasLat || !hasLon || !validCoordinates(lat, lon) {
			return invalid(c, "Koordinat GPS wajib dan harus valid untuk presensi pulang")
		}
		settings, settingsErr := settingsMap(h.db)
		if settingsErr != nil {
			return settingsErr
		}
		if code, message := gpsAccuracyError(settings, body); code != "" {
			return httpx.Error(c, fiber.StatusBadRequest, code, message)
		}
		inside, distance := h.isInsideLocationWithSettings(settings, lat, lon)
		location := "luar"
		if inside || settings["mode_testing"] == "1" {
			location = "sekolah"
		}
		now := time.Now().In(appLocation(h))
		izinPulangAwal := boolValue(body, "izin_pulang_awal", "izinPulangAwal")
		threshold, isPiket, targetErr := h.checkoutTarget(record.UserID, record.Tanggal, settings)
		if targetErr != nil {
			return targetErr
		}
		if !izinPulangAwal && beforeCheckoutTime(now, threshold) {
			label := normalizeTime(threshold)
			if len(label) > 5 {
				label = label[:5]
			}
			if isPiket {
				return httpx.Error(c, fiber.StatusConflict, "PIKET_RESTRICTION", "PIKET_RESTRICTION|"+label)
			}
			return httpx.Error(c, fiber.StatusConflict, "CHECKOUT_TOO_EARLY", fmt.Sprintf("Presensi pulang belum dapat dilakukan sebelum pukul %s WIB", label))
		}
		serverTime := now.Format("15:04:05")
		note := stringValue(body, "keterangan")
		if isPiket && izinPulangAwal {
			note = addPiketEarlyCheckoutNote(note)
		}
		accuracy, hasAccuracy := floatValue(body, "accuracy", "accuracy_meters")
		verdict := "outside"
		if inside {
			verdict = "inside"
		}
		if settings["mode_testing"] == "1" {
			verdict = "testing"
		}
		checkoutDistance := int(distance + 0.5)
		updates := map[string]any{
			"jam_pulang":                serverTime,
			"latitude":                  lat,
			"longitude":                 lon,
			"lokasi_pulang":             location,
			"keterangan":                note,
			"checkout_latitude":         lat,
			"checkout_longitude":        lon,
			"checkout_accuracy_meters":  pointerFloat(accuracy, hasAccuracy),
			"checkout_distance_meters":  checkoutDistance,
			"checkout_location_verdict": verdict,
		}
		result := h.db.Model(&models.AttendanceLog{}).
			Where("id = ? AND (jam_pulang IS NULL OR jam_pulang = '')", record.ID).
			Updates(updates)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return httpx.Error(c, fiber.StatusConflict, "ATTENDANCE_COMPLETED", "Presensi pulang hari ini sudah tercatat")
		}
		record.JamPulang = pointerString(serverTime)
		record.Latitude = pointerFloat(lat, true)
		record.Longitude = pointerFloat(lon, true)
		record.CheckoutLatitude = pointerFloat(lat, true)
		record.CheckoutLongitude = pointerFloat(lon, true)
		record.CheckoutAccuracyMeters = pointerFloat(accuracy, hasAccuracy)
		record.CheckoutDistanceMeters = &checkoutDistance
		record.CheckoutLocationVerdict = pointerString(verdict)
		record.LokasiPulang = pointerString(location)
		record.Keterangan = pointerString(note)
		writeAttendanceEvent(h, record, claims, body, "check_out", now, verdict)
		return httpx.Success(c, "Presensi berhasil diupdate", fiber.Map{"attendance": mapAttendance(record)})
	}
	status := stringValue(body, "status")
	if status == "" {
		status = record.Status
	}
	if !contains([]string{"hadir", "hadir_terlambat", "hadir_izin_terlambat", "izin", "sakit"}, status) {
		return invalid(c, "Status presensi tidak valid")
	}
	var attendanceOwner models.User
	if err := h.db.Select("id", "pokjar").First(&attendanceOwner, record.UserID).Error; err != nil {
		return err
	}
	isPokjar := attendanceOwner.Pokjar != nil && strings.TrimSpace(*attendanceOwner.Pokjar) != ""
	if isPokjar && !isAllowedPokjarStatus(status) {
		return invalid(c, "Presensi guru Pokjar hanya menggunakan status Hadir, Izin, atau Sakit")
	}
	if isPokjar && strings.TrimSpace(stringValue(body, "jamPulang", "jam_pulang")) != "" {
		return invalid(c, "Presensi guru Pokjar tidak menggunakan jam pulang")
	}
	updates := map[string]any{"status": status}
	if value := stringValue(body, "jamMasuk", "jam_masuk"); value != "" {
		if !validTime(value) {
			return invalid(c, "Format jam masuk tidak valid")
		}
		updates["jam_masuk"] = normalizeTime(value)
		updates["jam_hadir"] = normalizeTime(value)
	}
	if value := stringValue(body, "jamPulang", "jam_pulang"); value != "" {
		if !validTime(value) {
			return invalid(c, "Format jam pulang tidak valid")
		}
		updates["jam_pulang"] = normalizeTime(value)
	}
	if _, ok := body["keterangan"]; ok {
		updates["keterangan"] = stringValue(body, "keterangan")
	}
	if lat, ok := floatValue(body, "latitude"); ok {
		if lon, okLon := floatValue(body, "longitude"); okLon && validCoordinates(lat, lon) {
			updates["latitude"], updates["longitude"] = lat, lon
		}
	}
	if !contains([]string{"hadir", "hadir_terlambat", "hadir_izin_terlambat"}, status) {
		updates["jam_masuk"], updates["jam_hadir"], updates["jam_pulang"] = nil, nil, nil
	}
	if err := h.db.Model(&record).Updates(updates).Error; err != nil {
		return err
	}
	writeAttendanceEvent(h, record, claims, body, "admin_adjustment", time.Now().In(appLocation(h)), "not_required")
	return httpx.Success(c, "Presensi berhasil diupdate", fiber.Map{"attendance": mapAttendance(record)})
}

func (h *Handler) enforceLocation(user models.User, lat, lon float64, date string) error {
	settings, err := settingsMap(h.db)
	if err != nil {
		return err
	}
	return h.enforceLocationWithSettings(settings, lat, lon)
}

func (h *Handler) enforceLocationWithSettings(settings map[string]string, lat, lon float64) error {
	if settings["mode_testing"] == "1" {
		return nil
	}
	inside, distance := h.isInsideLocationWithSettings(settings, lat, lon)
	if !inside {
		return fiber.NewError(fiber.StatusForbidden, fmt.Sprintf("Anda berada di luar area presensi. Jarak terdekat %.0fm", distance))
	}
	return nil
}

func gpsAccuracyError(settings map[string]string, body map[string]any) (string, string) {
	accuracy, supplied := floatValue(body, "accuracy", "accuracy_meters")
	if !supplied {
		return "", ""
	}
	if math.IsNaN(accuracy) || math.IsInf(accuracy, 0) || accuracy < 0 {
		return "VALIDATION_ERROR", "Akurasi GPS tidak valid"
	}
	limit := 120.0
	if raw := strings.TrimSpace(settings["location_tracking_accuracy_limit"]); raw != "" {
		if parsed, err := strconv.ParseFloat(raw, 64); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if accuracy > limit {
		return "GPS_ACCURACY_LOW", fmt.Sprintf("Akurasi GPS terlalu rendah (%.0fm). Maksimal %.0fm", accuracy, limit)
	}
	return "", ""
}

func beforeCheckoutTime(now time.Time, configured string) bool {
	configured = strings.TrimSpace(configured)
	if configured == "" {
		configured = "12:30"
	}
	target, err := time.Parse("15:04:05", normalizeTime(configured))
	if err != nil {
		return false
	}
	return now.Hour()*60+now.Minute() < target.Hour()*60+target.Minute()
}

func (h *Handler) isInsideLocation(lat, lon float64) (bool, float64) {
	settings, err := settingsMap(h.db)
	if err != nil {
		return false, 0
	}
	return h.isInsideLocationWithSettings(settings, lat, lon)
}

func (h *Handler) isInsideLocationWithSettings(settings map[string]string, lat, lon float64) (bool, float64) {
	radius := 100.0
	if value := settings["radius_gps"]; value != "" {
		if parsed, err := time.ParseDuration(value + "s"); err == nil {
			radius = parsed.Seconds()
		}
	}
	targets := make([][2]float64, 0, 4)
	for _, pair := range [][2]string{{"sekolah_latitude", "sekolah_longitude"}, {"lokasi_laki_latitude", "lokasi_laki_longitude"}, {"lokasi_perempuan_latitude", "lokasi_perempuan_longitude"}, {"lokasi_apel_latitude", "lokasi_apel_longitude"}} {
		latTarget, errLat := strconvParse(settings[pair[0]])
		lonTarget, errLon := strconvParse(settings[pair[1]])
		if errLat == nil && errLon == nil && validCoordinates(latTarget, lonTarget) {
			targets = append(targets, [2]float64{latTarget, lonTarget})
		}
	}
	minDistance := mathInf()
	for _, target := range targets {
		distance := distanceMeters(lat, lon, target[0], target[1])
		if distance < minDistance {
			minDistance = distance
		}
		if distance <= radius {
			return true, distance
		}
	}
	if minDistance == mathInf() {
		return false, 0
	}
	return false, minDistance
}

func strconvParse(value string) (float64, error) {
	return strconv.ParseFloat(strings.TrimSpace(value), 64)
}

func mathInf() float64 { return 1e30 }

func (h *Handler) activity(c *fiber.Ctx) error {
	claims, err := userClaims(c)
	if err != nil {
		return err
	}
	if c.Method() == fiber.MethodGet {
		if claims.Role != "admin" && claims.Role != "kepala_sekolah" {
			return fiber.ErrForbidden
		}
		var logs []models.ActivityLog
		if err := h.db.Order("waktu DESC, id DESC").Limit(1000).Find(&logs).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Log aktivitas berhasil diambil", logs)
	}
	if c.Method() != fiber.MethodPost {
		return fiber.ErrMethodNotAllowed
	}
	body, err := readJSON(c)
	if err != nil {
		return invalid(c, err.Error())
	}
	var actor models.User
	if err := h.db.Select("id", "nama", "archived_at").First(&actor, claims.UserID).Error; err != nil || actor.ArchivedAt != nil {
		return fiber.ErrUnauthorized
	}
	activityName := stringValue(body, "aktivitas", "activity")
	if activityName == "" {
		return invalid(c, "Aktivitas wajib diisi")
	}
	// The actor is always taken from the authenticated session. The legacy
	// client still sends `user`, but accepting it would allow audit-log spoofing.
	log := models.ActivityLog{Waktu: time.Now().In(appLocation(h)), User: actor.Nama, Aktivitas: activityName, Status: stringValue(body, "status")}
	if err := h.db.Create(&log).Error; err != nil {
		return err
	}
	return httpx.Success(c, "Aktivitas berhasil dicatat", log)
}
