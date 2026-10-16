package compat

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/auth"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/config"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/httpx"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
)

type Handler struct {
	db  *gorm.DB
	cfg config.Config
	jwt *auth.JWTManager
}

func NewHandler(db *gorm.DB, cfg config.Config, jwt *auth.JWTManager) *Handler {
	return &Handler{db: db, cfg: cfg, jwt: jwt}
}

func userClaims(c *fiber.Ctx) (*auth.Claims, error) {
	claims, ok := c.Locals("authClaims").(*auth.Claims)
	if !ok || claims == nil {
		return nil, fiber.ErrUnauthorized
	}
	return claims, nil
}

func requireUser(c *fiber.Ctx) (models.User, error) {
	claims, err := userClaims(c)
	if err != nil {
		return models.User{}, err
	}
	var user models.User
	if err := currentDB(c).First(&user, claims.UserID).Error; err != nil || user.ArchivedAt != nil {
		return models.User{}, fiber.ErrUnauthorized
	}
	return user, nil
}

func currentDB(c *fiber.Ctx) *gorm.DB {
	return c.Locals("db").(*gorm.DB)
}

func attachDB(_ fiber.Router, _ *gorm.DB) {
	// Database locals are installed once in cmd/server before route registration.
}

func parseUint(value string) (uint, error) {
	n, err := strconv.ParseUint(strings.TrimSpace(value), 10, 64)
	if err != nil || n == 0 || n > uint64(^uint(0)) {
		return 0, fmt.Errorf("nilai id tidak valid")
	}
	return uint(n), nil
}

func queryUint(c *fiber.Ctx, key string) (uint, error) {
	return parseUint(c.Query(key))
}

func parseDate(value string, location *time.Location) (time.Time, error) {
	if strings.TrimSpace(value) == "" {
		return time.Time{}, fmt.Errorf("tanggal wajib diisi")
	}
	return time.ParseInLocation("2006-01-02", value, location)
}

func appLocation(h *Handler) *time.Location {
	location, err := time.LoadLocation(h.cfg.AppTimezone)
	if err != nil {
		return time.FixedZone("WIB", 7*60*60)
	}
	return location
}

func today(h *Handler) string { return time.Now().In(appLocation(h)).Format("2006-01-02") }

func readJSON(c *fiber.Ctx) (map[string]any, error) {
	var body map[string]any
	if err := json.Unmarshal(c.Body(), &body); err != nil {
		return nil, fmt.Errorf("payload JSON tidak valid")
	}
	return body, nil
}

func stringValue(body map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, ok := body[key]; ok && value != nil {
			return strings.TrimSpace(fmt.Sprint(value))
		}
	}
	return ""
}

func boolValue(body map[string]any, keys ...string) bool {
	for _, key := range keys {
		if value, ok := body[key]; ok {
			switch typed := value.(type) {
			case bool:
				return typed
			case float64:
				return typed == 1
			case string:
				return typed == "1" || strings.EqualFold(typed, "true")
			}
		}
	}
	return false
}

func uintValue(body map[string]any, keys ...string) (uint, error) {
	for _, key := range keys {
		if value, ok := body[key]; ok && value != nil {
			return parseUint(fmt.Sprint(value))
		}
	}
	return 0, fmt.Errorf("id wajib diisi")
}

func floatValue(body map[string]any, keys ...string) (float64, bool) {
	for _, key := range keys {
		if value, ok := body[key]; ok && value != nil {
			n, err := strconv.ParseFloat(fmt.Sprint(value), 64)
			return n, err == nil
		}
	}
	return 0, false
}

func pointerString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func pointerFloat(value float64, ok bool) *float64 {
	if !ok {
		return nil
	}
	return &value
}

func normalizeTime(value string) string {
	value = strings.TrimSpace(value)
	if len(value) == 5 {
		return value + ":00"
	}
	return value
}

func validTime(value string) bool {
	_, err := time.Parse("15:04:05", normalizeTime(value))
	return err == nil
}

func validCoordinates(lat, lon float64) bool {
	return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
}

func distanceMeters(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadius = 6371000.0
	latDiff := (lat2 - lat1) * math.Pi / 180
	lonDiff := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(latDiff/2)*math.Sin(latDiff/2) + math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*math.Sin(lonDiff/2)*math.Sin(lonDiff/2)
	return earthRadius * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

func settingsMap(db *gorm.DB) (map[string]string, error) {
	var rows []models.Setting
	if err := db.Order("setting_key ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	result := make(map[string]string, len(rows))
	for _, row := range rows {
		result[row.Key] = row.Value
	}
	return result, nil
}

func mapUser(user models.User) map[string]any {
	result := user.Public()
	if user.Jabatan != nil && *user.Jabatan != "" {
		var roles []string
		if json.Unmarshal([]byte(*user.Jabatan), &roles) == nil {
			result["jabatan"] = roles
		}
	}
	result["idGuru"] = user.IDGuru
	result["noHP"] = user.NoHP
	result["jenisKelamin"] = user.JenisKelamin
	result["tanggalBertugas"] = user.TanggalBertugas
	result["tanggalLahir"] = user.TanggalLahir
	result["tipeGuru"] = user.TipeGuru
	result["piketGroup"] = user.PiketGroup
	result["piket_group"] = user.PiketGroup
	result["pokjar"] = user.Pokjar
	result["tandaTangan"] = user.TandaTangan
	result["tanda_tangan"] = user.TandaTangan
	result["archivedAt"] = user.ArchivedAt
	result["archiveReason"] = user.ArchiveReason
	return result
}

func mapAttendance(record models.AttendanceLog) map[string]any { return record.Public() }

func invalid(c *fiber.Ctx, message string) error {
	return httpx.Error(c, fiber.StatusBadRequest, "VALIDATION_ERROR", message)
}

func contains(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}

func isDuplicateError(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "duplicate") ||
		strings.Contains(message, "unique constraint") ||
		strings.Contains(message, "uq_attendance_user_date")
}
