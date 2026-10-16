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

func TestCreateAttendanceSucceedsWhenAuditLogIsUnavailable(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	// Deliberately omit ActivityLog. A broken/legacy audit table must not
	// roll back the attendance that has already been saved.
	if err := db.AutoMigrate(&models.User{}, &models.AttendanceLog{}, &models.Setting{}, &models.Holiday{}, &models.OptionalWorkday{}, &models.WeekendOverride{}, &models.JadwalPiket{}); err != nil {
		t.Fatal(err)
	}

	guru := models.User{
		Username:  "guru-attendance",
		Role:      "guru",
		Nama:      "Guru Attendance",
		TipeGuru:  "full_time",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if err := db.Create(&guru).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&models.Setting{Key: "mode_testing", Value: "1"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&models.Setting{Key: "weekend_workday_enabled", Value: "1"}).Error; err != nil {
		t.Fatal(err)
	}

	cfg := config.Config{AppTimezone: "Asia/Jakarta"}
	h := NewHandler(db, cfg, auth.NewJWTManager(cfg))
	app := fiber.New()
	app.Post("/attendance", func(c *fiber.Ctx) error {
		c.Locals("authClaims", &auth.Claims{UserID: guru.ID, Role: "guru"})
		return h.presensi(c)
	})

	request := httptest.NewRequest("POST", "/attendance", strings.NewReader(`{"status":"hadir","latitude":-6.2,"longitude":106.8}`))
	request.Header.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
	response, err := app.Test(request)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != fiber.StatusOK {
		t.Fatalf("status = %d, want %d", response.StatusCode, fiber.StatusOK)
	}

	var payload struct {
		Success bool `json:"success"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if !payload.Success {
		t.Fatal("attendance response was not successful")
	}

	var saved models.AttendanceLog
	if err := db.Where("user_id = ?", guru.ID).First(&saved).Error; err != nil {
		t.Fatalf("attendance was not saved: %v", err)
	}
}

func TestTeacherAttendanceIsRejectedOnConfiguredHoliday(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.AttendanceLog{}, &models.Setting{}, &models.Holiday{}, &models.OptionalWorkday{}, &models.WeekendOverride{}, &models.JadwalPiket{}); err != nil {
		t.Fatal(err)
	}
	guru := models.User{Username: "guru-holiday", Role: "guru", Nama: "Guru Holiday", TipeGuru: "full_time", CreatedAt: time.Now(), UpdatedAt: time.Now()}
	if err := db.Create(&guru).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&models.Setting{Key: "mode_testing", Value: "1"}).Error; err != nil {
		t.Fatal(err)
	}
	loc, _ := time.LoadLocation("Asia/Jakarta")
	today := time.Now().In(loc).Format("2006-01-02")
	holidayDate, _ := time.ParseInLocation("2006-01-02", today, loc)
	if err := db.Create(&models.Holiday{Tanggal: holidayDate, Nama: "Libur Uji", Jenis: "sekolah"}).Error; err != nil {
		t.Fatal(err)
	}

	cfg := config.Config{AppTimezone: "Asia/Jakarta"}
	h := NewHandler(db, cfg, auth.NewJWTManager(cfg))
	app := fiber.New()
	app.Post("/attendance", func(c *fiber.Ctx) error {
		c.Locals("authClaims", &auth.Claims{UserID: guru.ID, Role: "guru"})
		return h.presensi(c)
	})

	request := httptest.NewRequest("POST", "/attendance", strings.NewReader(`{"status":"hadir","latitude":-6.2,"longitude":106.8}`))
	request.Header.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
	response, err := app.Test(request)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != fiber.StatusConflict {
		t.Fatalf("status = %d, want %d", response.StatusCode, fiber.StatusConflict)
	}
	var count int64
	if err := db.Model(&models.AttendanceLog{}).Where("user_id = ?", guru.ID).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("holiday attendance was saved: %d record(s)", count)
	}
}
