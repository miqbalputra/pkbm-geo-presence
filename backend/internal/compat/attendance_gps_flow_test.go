package compat

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/gofiber/fiber/v2"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/auth"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/config"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
	"gorm.io/gorm"
)

func TestNonPokjarAttendanceRequiresGPSOnlyForHadir(t *testing.T) {
	h, db, date := newAttendanceFlowTestHandler(t)
	statuses := []string{"hadir", "izin", "sakit"}
	for _, status := range statuses {
		t.Run(status, func(t *testing.T) {
			guru := createAttendanceFlowTeacher(t, db, "gps-"+status)
			response := sendAttendanceFlowRequest(t, h, guru.ID, "POST", `{"status":"`+status+`","keterangan":"Keterangan uji presensi"}`)
			if status == "hadir" {
				if response.StatusCode != fiber.StatusBadRequest {
					t.Fatalf("Hadir without GPS status = %d, want %d", response.StatusCode, fiber.StatusBadRequest)
				}
				return
			}
			if response.StatusCode != fiber.StatusOK {
				t.Fatalf("%s without GPS status = %d, want %d", status, response.StatusCode, fiber.StatusOK)
			}

			var saved models.AttendanceLog
			if err := db.Where("user_id = ? AND tanggal = ?", guru.ID, date).First(&saved).Error; err != nil {
				t.Fatalf("load %s attendance: %v", status, err)
			}
			if saved.Latitude != nil || saved.Longitude != nil {
				t.Fatalf("%s attendance unexpectedly stored GPS coordinates", status)
			}
			if saved.Keterangan == nil || *saved.Keterangan != "Keterangan uji presensi" {
				t.Fatalf("%s note = %v, want the supplied explanation", status, saved.Keterangan)
			}
			if status == "izin" && saved.JamIzin == nil {
				t.Fatal("Izin attendance did not store its report time")
			}
			if status == "sakit" && saved.JamSakit == nil {
				t.Fatal("Sakit attendance did not store its report time")
			}
		})
	}
}

func TestNonPokjarCheckoutRequiresGPSAndPreservesCheckinData(t *testing.T) {
	h, db, date := newAttendanceFlowTestHandler(t)
	guru := createAttendanceFlowTeacher(t, db, "gps-checkout")
	checkinLat, checkinLon := -6.2, 106.8
	jamMasuk := "07:55:00"
	jamHadir := jamMasuk
	lateNote := "Terlambat 35 menit"
	record := models.AttendanceLog{
		UserID: guru.ID, Nama: guru.Nama, Tanggal: date, Status: "hadir_terlambat",
		JamMasuk: &jamMasuk, JamHadir: &jamHadir, Keterangan: &lateNote,
		Latitude: &checkinLat, Longitude: &checkinLon,
	}
	if err := db.Create(&record).Error; err != nil {
		t.Fatal(err)
	}

	missingGPS := sendAttendanceFlowRequest(t, h, guru.ID, "PUT", `{"id":`+uintString(record.ID)+`,"izin_pulang_awal":true}`)
	if missingGPS.StatusCode != fiber.StatusBadRequest {
		t.Fatalf("Pulang without GPS status = %d, want %d", missingGPS.StatusCode, fiber.StatusBadRequest)
	}

	checkoutLat, checkoutLon := -6.21, 106.81
	response := sendAttendanceFlowRequest(t, h, guru.ID, "PUT", `{"id":`+uintString(record.ID)+`,"latitude":-6.21,"longitude":106.81,"accuracy":8,"izin_pulang_awal":true,"keterangan":""}`)
	if response.StatusCode != fiber.StatusOK {
		t.Fatalf("Pulang with GPS status = %d, want %d", response.StatusCode, fiber.StatusOK)
	}

	var saved models.AttendanceLog
	if err := db.First(&saved, record.ID).Error; err != nil {
		t.Fatalf("load checked-out attendance: %v", err)
	}
	if saved.JamPulang == nil {
		t.Fatal("checkout time was not stored")
	}
	if saved.Keterangan == nil || *saved.Keterangan != lateNote {
		t.Fatalf("checkout replaced late explanation: got %v, want %q", saved.Keterangan, lateNote)
	}
	if saved.Latitude == nil || *saved.Latitude != checkinLat || saved.Longitude == nil || *saved.Longitude != checkinLon {
		t.Fatalf("check-in coordinates changed during checkout: (%v, %v)", saved.Latitude, saved.Longitude)
	}
	if saved.CheckoutLatitude == nil || *saved.CheckoutLatitude != checkoutLat || saved.CheckoutLongitude == nil || *saved.CheckoutLongitude != checkoutLon {
		t.Fatalf("checkout coordinates were not stored separately: (%v, %v)", saved.CheckoutLatitude, saved.CheckoutLongitude)
	}
}

func newAttendanceFlowTestHandler(t *testing.T) (*Handler, *gorm.DB, time.Time) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(
		&models.User{}, &models.AttendanceLog{}, &models.AttendanceEvent{}, &models.Setting{},
		&models.Holiday{}, &models.OptionalWorkday{}, &models.WeekendOverride{},
		&models.JadwalPiket{}, &models.PengaturanHarian{},
	); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&models.Setting{Key: "mode_testing", Value: "1"}).Error; err != nil {
		t.Fatal(err)
	}
	loc, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().In(loc)
	date := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	if err := db.Create(&models.Holiday{Tanggal: date, Nama: "Hari kerja uji", Jenis: "sekolah", IsWorkday: true}).Error; err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{AppTimezone: "Asia/Jakarta"}
	return NewHandler(db, cfg, auth.NewJWTManager(cfg)), db, date
}

func createAttendanceFlowTeacher(t *testing.T, db *gorm.DB, username string) models.User {
	t.Helper()
	guru := models.User{Username: username, Role: "guru", Nama: username, TipeGuru: "full_time", CreatedAt: time.Now(), UpdatedAt: time.Now()}
	if err := db.Create(&guru).Error; err != nil {
		t.Fatal(err)
	}
	return guru
}

func sendAttendanceFlowRequest(t *testing.T, h *Handler, userID uint, method, body string) *http.Response {
	t.Helper()
	app := fiber.New()
	app.All("/attendance", func(c *fiber.Ctx) error {
		c.Locals("authClaims", &auth.Claims{UserID: userID, Role: "guru"})
		return h.presensi(c)
	})
	request := httptest.NewRequest(method, "/attendance", strings.NewReader(body))
	request.Header.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
	response, err := app.Test(request)
	if err != nil {
		t.Fatal(err)
	}
	return response
}

func uintString(value uint) string {
	return strconv.FormatUint(uint64(value), 10)
}
