package compat

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/auth"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/httpx"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
)

func (h *Handler) RegisterAttendanceRoutes(app fiber.Router) {
	protected := auth.RequireActiveUser(h.db, h.jwt)
	app.All("/api/qr_scan.php", protected, auth.RequireRoles("guru"), h.qrScan)
	app.All("/api/qr_generate.php", protected, auth.RequireRoles("admin"), h.qrGenerate)
	app.All("/api/location_tracking.php", protected, h.locationTracking)
	app.All("/api/manual_entry.php", protected, auth.RequireRoles("admin"), h.manualEntry)
	app.All("/api/admin_summary.php", protected, auth.RequireRoles("admin", "kepala_sekolah"), h.adminSummary)
	app.All("/api/admin_charts.php", protected, auth.RequireRoles("admin", "kepala_sekolah"), h.adminCharts)
	app.All("/api/teacher_workdays.php", protected, h.teacherWorkdays)
	app.All("/api/teachers_workdays.php", protected, auth.RequireRoles("admin", "kepala_sekolah"), h.teachersWorkdays)

	v1 := app.Group("/api/v1")
	v1.All("/qr/scan", protected, auth.RequireRoles("guru"), h.qrScan)
	v1.All("/qr", protected, auth.RequireRoles("admin"), h.qrGenerate)
	v1.All("/location-tracking", protected, h.locationTracking)
	v1.All("/attendance/manual", protected, auth.RequireRoles("admin"), h.manualEntry)
	v1.All("/reports/admin-summary", protected, auth.RequireRoles("admin", "kepala_sekolah"), h.adminSummary)
	v1.All("/reports/charts", protected, auth.RequireRoles("admin", "kepala_sekolah"), h.adminCharts)
	v1.Get("/reports/analytics", protected, auth.RequireRoles("admin", "kepala_sekolah"), h.analyticsReport)
	v1.Get("/reports/my-attendance", protected, auth.RequireRoles("guru"), h.myTeacherAttendanceReport)
	v1.All("/reports/teacher-workdays", protected, h.teacherWorkdays)
	v1.All("/reports/teachers-workdays", protected, auth.RequireRoles("admin", "kepala_sekolah"), h.teachersWorkdays)
}

func (h *Handler) qrGenerate(c *fiber.Ctx) error {
	settings, err := settingsMap(h.db)
	if err != nil {
		return err
	}
	if c.Method() == fiber.MethodGet {
		secret := settings["qr_secret"]
		if secret == "" {
			secret = "GEOPRESENSI_DEFAULT_KEY"
		}
		now := time.Now().In(appLocation(h))
		nonce := uuid.NewString()
		expiresAt := now.Add(5 * time.Minute)
		if err := h.setSetting("qr_active_nonce", nonce); err != nil {
			return err
		}
		if err := h.setSetting("qr_expires_at", expiresAt.UTC().Format(time.RFC3339)); err != nil {
			return err
		}
		school := settings["sekolah_nama"]
		if school == "" {
			school = "Sekolah"
		}
		payload, _ := json.Marshal(map[string]any{
			"type":       "attendance",
			"school":     school,
			"secret":     secret,
			"nonce":      nonce,
			"generated":  now.Format("2006-01-02 15:04:05"),
			"expires_at": expiresAt.UTC().Format(time.RFC3339),
		})
		return httpx.Success(c, "QR Code data generated", fiber.Map{"qr_data": string(payload), "school_name": school, "expires_at": expiresAt.UTC().Format(time.RFC3339)})
	}
	if c.Method() != fiber.MethodPut {
		return fiber.ErrMethodNotAllowed
	}
	body, err := readJSON(c)
	if err != nil {
		return invalid(c, err.Error())
	}
	secret := stringValue(body, "new_secret", "newSecret")
	if secret == "" {
		secret = "GEOPRESENSI_" + strings.ToUpper(strings.ReplaceAll(uuid.NewString(), "-", ""))
	}
	var setting models.Setting
	query := h.db.Where("setting_key = ?", "qr_secret").First(&setting)
	if query.Error == gorm.ErrRecordNotFound {
		if err := h.db.Create(&models.Setting{Key: "qr_secret", Value: secret}).Error; err != nil {
			return err
		}
	} else if query.Error != nil {
		return query.Error
	} else if err := h.db.Model(&setting).Update("setting_value", secret).Error; err != nil {
		return err
	}
	if err := h.setSetting("qr_active_nonce", ""); err != nil {
		return err
	}
	if err := h.setSetting("qr_expires_at", ""); err != nil {
		return err
	}
	return httpx.Success(c, "QR Secret berhasil diperbarui. QR Code lama tidak akan berfungsi lagi.", fiber.Map{"new_secret": secret})
}

func (h *Handler) qrScan(c *fiber.Ctx) error {
	if c.Method() == fiber.MethodGet {
		claims, err := userClaims(c)
		if err != nil {
			return err
		}
		var attendance models.AttendanceLog
		query := h.db.Where("user_id = ? AND tanggal = ?", claims.UserID, today(h)).First(&attendance)
		if query.Error == gorm.ErrRecordNotFound {
			return httpx.Success(c, "Status presensi", fiber.Map{"has_checked_in": false, "has_checked_out": false, "attendance": nil})
		}
		if query.Error != nil {
			return query.Error
		}
		return httpx.Success(c, "Status presensi", fiber.Map{"has_checked_in": true, "has_checked_out": attendance.JamPulang != nil, "attendance": mapAttendance(attendance)})
	}
	if c.Method() != fiber.MethodPost {
		return fiber.ErrMethodNotAllowed
	}
	body, err := readJSON(c)
	if err != nil {
		return invalid(c, err.Error())
	}
	qrRaw := stringValue(body, "qr_data", "qrData")
	lat, hasLat := floatValue(body, "latitude")
	lon, hasLon := floatValue(body, "longitude")
	if qrRaw == "" || !hasLat || !hasLon || !validCoordinates(lat, lon) {
		return invalid(c, "Data QR dan koordinat GPS wajib diisi")
	}
	var qr map[string]any
	if err := json.Unmarshal([]byte(qrRaw), &qr); err != nil {
		return invalid(c, "Format QR Code tidak valid")
	}
	settings, err := settingsMap(h.db)
	if err != nil {
		return err
	}
	if settings["qr_enabled"] != "1" {
		return httpx.Error(c, fiber.StatusForbidden, "QR_DISABLED", "Fitur QR Code Scan sedang tidak aktif")
	}
	nonce, err := validateQRPayload(qr, settings, time.Now().UTC())
	if err != nil {
		return httpx.Error(c, fiber.StatusForbidden, "QR_INVALID", "QR Code tidak valid atau sudah kadaluarsa")
	}
	claims, err := userClaims(c)
	if err != nil {
		return err
	}
	var qrTeacher models.User
	if err := h.db.Select("id, pokjar").First(&qrTeacher, claims.UserID).Error; err != nil {
		return err
	}
	if qrTeacher.Pokjar != nil && strings.TrimSpace(*qrTeacher.Pokjar) != "" {
		return httpx.Error(c, fiber.StatusForbidden, "POKJAR_SIMPLE_MODE", "Guru Pokjar menggunakan presensi sederhana tanpa QR.")
	}
	var attendance models.AttendanceLog
	query := h.db.Where("user_id = ? AND tanggal = ?", claims.UserID, today(h)).First(&attendance)
	if query.Error == nil {
		if attendance.JamPulang != nil && *attendance.JamPulang != "" {
			return httpx.Error(c, fiber.StatusConflict, "ATTENDANCE_COMPLETED", "Presensi hari ini sudah selesai")
		}
		minPulang := settings["jam_min_pulang"]
		if minPulang == "" {
			minPulang = "12:30"
		}
		if code, message := gpsAccuracyError(settings, body); code != "" {
			return httpx.Error(c, fiber.StatusBadRequest, code, message)
		}
		now := time.Now().In(appLocation(h))
		izinPulangAwal := boolValue(body, "izin_pulang_awal", "izinPulangAwal")
		minPulang, isPiket, targetErr := h.checkoutTarget(claims.UserID, attendance.Tanggal, settings)
		if targetErr != nil {
			return targetErr
		}
		if !izinPulangAwal && beforeCheckoutTime(now, minPulang) {
			if isPiket {
				return httpx.Error(c, fiber.StatusConflict, "PIKET_RESTRICTION", "PIKET_RESTRICTION|"+minPulang[:5])
			}
			return httpx.Error(c, fiber.StatusConflict, "CHECKOUT_TOO_EARLY", "Presensi pulang belum dapat dilakukan")
		}
		inside, _ := h.isInsideLocationWithSettings(settings, lat, lon)
		if !inside && settings["mode_testing"] != "1" {
			return httpx.Error(c, fiber.StatusForbidden, "OUTSIDE_GEOFENCE", "Anda berada di luar area presensi")
		}
		serverTime := now.Format("15:04:05")
		accuracy, hasAccuracy := floatValue(body, "accuracy", "accuracy_meters")
		verdict := "outside"
		if inside {
			verdict = "inside"
		}
		if settings["mode_testing"] == "1" {
			verdict = "testing"
		}
		updates := map[string]any{"jam_pulang": serverTime, "lokasi_pulang": "luar", "qr_nonce": nonce,
			"checkout_latitude": lat, "checkout_longitude": lon, "checkout_accuracy_meters": pointerFloat(accuracy, hasAccuracy), "checkout_location_verdict": verdict}
		if inside || settings["mode_testing"] == "1" {
			updates["lokasi_pulang"] = "sekolah"
		}
		checkoutNote := strings.TrimSpace(stringValue(body, "keterangan"))
		if isPiket && izinPulangAwal {
			checkoutNote = addPiketEarlyCheckoutNote(checkoutNote)
		}
		existingNote := ""
		if attendance.Keterangan != nil {
			existingNote = *attendance.Keterangan
		}
		note := mergeAttendanceNotes(existingNote, checkoutNote)
		if body != nil {
			body["keterangan"] = checkoutNote
		}
		if note != "" {
			updates["keterangan"] = note
		}
		result := h.db.Model(&models.AttendanceLog{}).
			Where("id = ? AND (jam_pulang IS NULL OR jam_pulang = '')", attendance.ID).
			Updates(updates)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return httpx.Error(c, fiber.StatusConflict, "ATTENDANCE_COMPLETED", "Presensi hari ini sudah selesai")
		}
		attendance.JamPulang = pointerString(serverTime)
		attendance.CheckoutLatitude = pointerFloat(lat, true)
		attendance.CheckoutLongitude = pointerFloat(lon, true)
		attendance.CheckoutAccuracyMeters = pointerFloat(accuracy, hasAccuracy)
		attendance.CheckoutLocationVerdict = pointerString(verdict)
		attendance.LokasiPulang = pointerString(updates["lokasi_pulang"].(string))
		attendance.QRNonce = pointerString(nonce)
		if note != "" {
			attendance.Keterangan = pointerString(note)
		}
		writeAttendanceEvent(h, attendance, claims, body, "check_out", now, verdict)
		return httpx.Success(c, "Presensi pulang berhasil (Smart Scan)!", fiber.Map{"jam_pulang": updates["jam_pulang"], "attendance": mapAttendance(attendance), "message": "Hati-hati di jalan!"})
	}
	if query.Error != gorm.ErrRecordNotFound {
		return query.Error
	}
	input := map[string]any{"userId": claims.UserID, "status": "hadir", "tanggal": today(h), "latitude": lat, "longitude": lon, "metode": "qr_scan", "qr_nonce": nonce}
	for _, key := range []string{"keterangan", "jamMasuk"} {
		if value := stringValue(body, key); value != "" {
			input[key] = value
		}
	}
	inside, _ := h.isInsideLocationWithSettings(settings, lat, lon)
	if !inside && settings["mode_testing"] != "1" {
		return httpx.Error(c, fiber.StatusForbidden, "OUTSIDE_GEOFENCE", "Anda berada di luar area presensi")
	}
	if code, message := gpsAccuracyError(settings, body); code != "" {
		return httpx.Error(c, fiber.StatusBadRequest, code, message)
	}
	return h.createAttendance(c, claims, input)
}

func (h *Handler) setSetting(key, value string) error {
	var setting models.Setting
	query := h.db.Where("setting_key = ?", key).First(&setting)
	if query.Error == gorm.ErrRecordNotFound {
		return h.db.Create(&models.Setting{Key: key, Value: value}).Error
	}
	if query.Error != nil {
		return query.Error
	}
	return h.db.Model(&setting).Update("setting_value", value).Error
}

func validateQRPayload(qr map[string]any, settings map[string]string, now time.Time) (string, error) {
	if stringValue(qr, "type") != "attendance" {
		return "", fmt.Errorf("invalid QR type")
	}
	secret := settings["qr_secret"]
	if secret == "" {
		secret = "GEOPRESENSI_DEFAULT_KEY"
	}
	providedSecret := stringValue(qr, "secret")
	if providedSecret == "" || len(providedSecret) != len(secret) || subtle.ConstantTimeCompare([]byte(providedSecret), []byte(secret)) != 1 {
		return "", fmt.Errorf("invalid QR secret")
	}
	nonce := stringValue(qr, "nonce")
	activeNonce := settings["qr_active_nonce"]
	if nonce == "" || activeNonce == "" || len(nonce) != len(activeNonce) || subtle.ConstantTimeCompare([]byte(nonce), []byte(activeNonce)) != 1 {
		return "", fmt.Errorf("invalid QR nonce")
	}
	expiresAt, err := time.Parse(time.RFC3339, stringValue(qr, "expires_at", "expiresAt"))
	if err != nil || !now.Before(expiresAt) {
		return "", fmt.Errorf("expired QR")
	}
	return nonce, nil
}

func (h *Handler) enforceLocationForQR(lat, lon float64) error {
	inside, _ := h.isInsideLocation(lat, lon)
	settings, _ := settingsMap(h.db)
	if !inside && settings["mode_testing"] != "1" {
		return fiber.NewError(fiber.StatusForbidden, "Anda berada di luar area presensi")
	}
	return nil
}

func (h *Handler) locationTracking(c *fiber.Ctx) error {
	claims, err := userClaims(c)
	if err != nil {
		return err
	}
	if c.Method() == fiber.MethodPost {
		if claims.Role != "guru" {
			return fiber.ErrForbidden
		}
		body, err := readJSON(c)
		if err != nil {
			return invalid(c, err.Error())
		}
		settings, err := settingsMap(h.db)
		if err != nil {
			return err
		}
		if settings["location_tracking_enabled"] != "1" {
			return httpx.Error(c, fiber.StatusForbidden, "TRACKING_DISABLED", "Tracking lokasi sedang tidak aktif")
		}
		lat, okLat := floatValue(body, "latitude")
		lon, okLon := floatValue(body, "longitude")
		if !okLat || !okLon || !validCoordinates(lat, lon) {
			return invalid(c, "Koordinat GPS tidak valid")
		}
		accuracy, hasAccuracy := floatValue(body, "accuracy")
		if hasAccuracy && accuracy < 0 {
			return invalid(c, "Akurasi GPS tidak valid")
		}
		if limitRaw := settings["location_tracking_accuracy_limit"]; limitRaw != "" {
			if limit, parseErr := strconv.ParseFloat(limitRaw, 64); parseErr == nil && hasAccuracy && accuracy > limit {
				return httpx.Error(c, fiber.StatusBadRequest, "GPS_ACCURACY_LOW", "Akurasi GPS melebihi batas")
			}
		}
		var attendance models.AttendanceLog
		if err := h.db.Where("user_id = ? AND tanggal = ?", claims.UserID, today(h)).First(&attendance).Error; err != nil || !contains([]string{"hadir", "hadir_terlambat", "hadir_izin_terlambat"}, attendance.Status) || attendance.JamPulang != nil {
			return httpx.Error(c, fiber.StatusConflict, "TRACKING_NOT_ACTIVE", "Tracking hanya aktif setelah presensi hadir dan sebelum presensi pulang")
		}
		row := models.LocationTrack{UserID: claims.UserID, AttendanceID: &attendance.ID, Tanggal: time.Now().In(appLocation(h)), Latitude: lat, Longitude: lon, AccuracyMeters: pointerFloat(accuracy, hasAccuracy), Source: "web", UserAgent: c.Get(fiber.HeaderUserAgent)}
		if err := h.db.Create(&row).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Lokasi tracking tersimpan", fiber.Map{"id": row.ID, "recorded_at": row.RecordedAt})
	}
	if c.Method() != fiber.MethodGet {
		return fiber.ErrMethodNotAllowed
	}
	date := c.Query("date")
	if date == "" {
		date = today(h)
	}
	if c.Query("action") == "history" {
		userID, err := queryUint(c, "user_id")
		if err != nil {
			return invalid(c, "user_id tidak valid")
		}
		if claims.Role == "guru" && userID != claims.UserID {
			return fiber.ErrForbidden
		}
		var rows []models.LocationTrack
		query := h.db.Where("user_id = ? AND tanggal = ?", userID, date).Order("recorded_at DESC, id DESC").Limit(1000)
		if err := query.Find(&rows).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Riwayat tracking lokasi", rows)
	}
	if claims.Role != "admin" && claims.Role != "kepala_sekolah" {
		return fiber.ErrForbidden
	}
	type item struct {
		UserID     uint       `json:"user_id"`
		Nama       string     `json:"nama"`
		Tanggal    string     `json:"tanggal"`
		Latitude   *float64   `json:"latitude"`
		Longitude  *float64   `json:"longitude"`
		Accuracy   *float64   `json:"accuracy_meters"`
		RecordedAt *time.Time `json:"recorded_at"`
	}
	var rows []item
	if err := h.db.Table("location_tracks lt").Select("lt.user_id, u.nama, lt.tanggal, lt.latitude, lt.longitude, lt.accuracy_meters, lt.recorded_at").Joins("JOIN users u ON u.id = lt.user_id").Where("lt.tanggal = ?", date).Order("lt.recorded_at DESC").Limit(2000).Scan(&rows).Error; err != nil {
		return err
	}
	settings, _ := settingsMap(h.db)
	return httpx.Success(c, "Tracking lokasi terbaru", fiber.Map{"date": date, "settings": settings, "items": rows})
}

func (h *Handler) manualEntry(c *fiber.Ctx) error {
	if c.Method() == fiber.MethodGet {
		var users []models.User
		if err := h.db.Where("role = ? AND archived_at IS NULL", "guru").Order("nama ASC").Find(&users).Error; err != nil {
			return err
		}
		data := make([]map[string]any, 0, len(users))
		for _, user := range users {
			data = append(data, mapUser(user))
		}
		return httpx.Success(c, "Data guru berhasil diambil", data)
	}
	if c.Method() != fiber.MethodPost {
		return fiber.ErrMethodNotAllowed
	}
	body, err := readJSON(c)
	if err != nil {
		return invalid(c, err.Error())
	}
	claims, err := userClaims(c)
	if err != nil {
		return err
	}
	return h.createAttendance(c, claims, body)
}
