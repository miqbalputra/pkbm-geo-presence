package compat

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/auth"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/config"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
)

func TestGuruCannotReadAdminDirectoryOrActivityLog(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.ActivityLog{}, &models.Setting{}); err != nil {
		t.Fatal(err)
	}

	admin := models.User{Username: "admin", Role: "admin", Nama: "Admin", TipeGuru: "full_time", CreatedAt: time.Now(), UpdatedAt: time.Now()}
	guru := models.User{Username: "guru", Role: "guru", Nama: "Guru Audit", TipeGuru: "full_time", CreatedAt: time.Now(), UpdatedAt: time.Now()}
	if err := db.Create(&admin).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&guru).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&models.Setting{Key: "qr_secret", Value: "private"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&models.Setting{Key: "radius_gps", Value: "100"}).Error; err != nil {
		t.Fatal(err)
	}

	cfg := config.Config{JWTSecret: "test-secret-that-is-long-enough-for-the-test", JWTIssuer: "test", JWTAudience: "web", JWTAccessTTL: time.Minute}
	manager := auth.NewJWTManager(cfg)
	token, _, err := manager.IssueAccess(guru)
	if err != nil {
		t.Fatal(err)
	}

	app := fiber.New()
	h := NewHandler(db, cfg, manager)
	h.RegisterCoreRoutes(app)

	for _, path := range []string{"/api/v1/users", "/api/v1/activities", "/api/v1/operations/checkin-recalculation", "/api/v1/operations/today-checkin-recalculation"} {
		request := httptest.NewRequest("GET", path, nil)
		request.Header.Set(fiber.HeaderAuthorization, "Bearer "+token)
		response, err := app.Test(request)
		if err != nil {
			t.Fatal(err)
		}
		if response.StatusCode != fiber.StatusForbidden {
			t.Fatalf("%s status = %d, want 403", path, response.StatusCode)
		}
	}

	settingsRequest := httptest.NewRequest("GET", "/api/v1/settings", nil)
	settingsRequest.Header.Set(fiber.HeaderAuthorization, "Bearer "+token)
	settingsResponse, err := app.Test(settingsRequest)
	if err != nil {
		t.Fatal(err)
	}
	var settingsPayload struct {
		Data map[string]string `json:"data"`
	}
	if err := json.NewDecoder(settingsResponse.Body).Decode(&settingsPayload); err != nil {
		t.Fatal(err)
	}
	if _, leaked := settingsPayload.Data["qr_secret"]; leaked {
		t.Fatal("qr_secret leaked to guru settings response")
	}
	if settingsPayload.Data["radius_gps"] != "100" {
		t.Fatal("non-private settings should remain available to guru")
	}

	activityRequest := httptest.NewRequest("POST", "/api/v1/activities", strings.NewReader(`{"user":"SPOOFED","aktivitas":"Audit test","status":"Sukses"}`))
	activityRequest.Header.Set(fiber.HeaderAuthorization, "Bearer "+token)
	activityRequest.Header.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
	activityResponse, err := app.Test(activityRequest)
	if err != nil {
		t.Fatal(err)
	}
	var activityPayload struct {
		Data models.ActivityLog `json:"data"`
	}
	if err := json.NewDecoder(activityResponse.Body).Decode(&activityPayload); err != nil {
		t.Fatal(err)
	}
	if activityPayload.Data.User != "Guru Audit" {
		t.Fatalf("activity actor = %q, want authenticated user", activityPayload.Data.User)
	}
}
