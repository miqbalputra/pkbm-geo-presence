package compat

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
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

type analyticsTestResponse struct {
	Success bool `json:"success"`
	Data    struct {
		Summary struct {
			TotalGuru       int `json:"totalGuru"`
			TotalHariKerja  int `json:"totalHariKerja"`
			Hadir           int `json:"hadir"`
			TepatWaktu      int `json:"tepatWaktu"`
			Terlambat       int `json:"terlambat"`
			Izin            int `json:"izin"`
			Sakit           int `json:"sakit"`
			Alfa            int `json:"alfa"`
			CheckoutLengkap int `json:"checkoutLengkap"`
			LupaCheckout    int `json:"lupaCheckout"`
		} `json:"summary"`
		Teachers []struct {
			ID        uint    `json:"id"`
			Nama      string  `json:"nama"`
			Skor      float64 `json:"skor"`
			Terlambat int     `json:"terlambat"`
		} `json:"teachers"`
		Details struct {
			TerlambatPiket []map[string]any `json:"terlambatPiket"`
			PulangAwal     []map[string]any `json:"pulangAwal"`
			LupaCheckout   []map[string]any `json:"lupaCheckout"`
		} `json:"details"`
	} `json:"data"`
}

func analyticsTestSetup(t *testing.T) (*fiber.App, *auth.JWTManager, models.User, models.User, models.User, string, string) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.AttendanceLog{}, &models.Setting{}, &models.Holiday{}, &models.OptionalWorkday{}, &models.WeekendOverride{}, &models.JadwalPiket{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&models.Setting{Key: "workday_days", Value: "1,2,3,4,5"}).Error; err != nil {
		t.Fatal(err)
	}
	createdAt := time.Date(2020, time.January, 1, 0, 0, 0, 0, time.UTC)
	admin := models.User{Username: "analytics-admin", Role: "admin", Nama: "Admin", CreatedAt: createdAt, UpdatedAt: createdAt}
	guruOne := models.User{Username: "analytics-guru-1", Role: "guru", Nama: "Guru Tetap", TipeGuru: "full_time", CreatedAt: createdAt, UpdatedAt: createdAt}
	guruTwo := models.User{Username: "analytics-guru-2", Role: "guru", Nama: "Guru Paruh Waktu", TipeGuru: "partime", CreatedAt: createdAt, UpdatedAt: createdAt}
	for _, user := range []*models.User{&admin, &guruOne, &guruTwo} {
		if err := db.Create(user).Error; err != nil {
			t.Fatal(err)
		}
	}
	loc, _ := time.LoadLocation("Asia/Jakarta")
	end := dateOnly(time.Now().In(loc)).AddDate(0, 0, -7)
	for end.Weekday() != time.Wednesday {
		end = end.AddDate(0, 0, -1)
	}
	start := end.AddDate(0, 0, -2) // Monday through Wednesday: three normal workdays.
	clock := func(value string) *string { return &value }
	logs := []models.AttendanceLog{
		{UserID: guruOne.ID, Nama: guruOne.Nama, Tanggal: start, Status: "hadir", JamMasuk: clock("07:00"), JamPulang: clock("14:00")},
		{UserID: guruOne.ID, Nama: guruOne.Nama, Tanggal: start.AddDate(0, 0, 1), Status: "hadir_terlambat", JamMasuk: clock("08:05")},
		{UserID: guruOne.ID, Nama: guruOne.Nama, Tanggal: end, Status: "izin"},
		{UserID: guruTwo.ID, Nama: guruTwo.Nama, Tanggal: start, Status: "sakit"},
		{UserID: guruTwo.ID, Nama: guruTwo.Nama, Tanggal: end, Status: "hadir", JamMasuk: clock("07:10"), JamPulang: clock("13:30"), Keterangan: clock("Izin Pulang Awal Piket | Alasan: Uji")},
	}
	if err := db.Create(&logs).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&models.JadwalPiket{UserID: guruOne.ID, NamaGuru: guruOne.Nama, Hari: dayName(start.AddDate(0, 0, 1).Weekday()), IsActive: true}).Error; err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{AppTimezone: "Asia/Jakarta", JWTSecret: "analytics-test-secret-that-is-long-enough", JWTIssuer: "test", JWTAudience: "web", JWTAccessTTL: time.Hour}
	manager := auth.NewJWTManager(cfg)
	app := fiber.New()
	NewHandler(db, cfg, manager).RegisterAttendanceRoutes(app)
	return app, manager, admin, guruOne, guruTwo, start.Format("2006-01-02"), end.Format("2006-01-02")
}

func analyticsRequest(t *testing.T, app *fiber.App, manager *auth.JWTManager, user models.User, path string) (*http.Response, analyticsTestResponse) {
	t.Helper()
	token, _, err := manager.IssueAccess(user)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.Header.Set(fiber.HeaderAuthorization, "Bearer "+token)
	response, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	var payload analyticsTestResponse
	if response.StatusCode == http.StatusOK {
		if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
	}
	return response, payload
}

func TestAnalyticsReportUsesCanonicalStatusAndCheckoutRules(t *testing.T) {
	app, manager, admin, guruOne, _, start, end := analyticsTestSetup(t)
	response, payload := analyticsRequest(t, app, manager, admin, "/api/v1/reports/analytics?start_date="+start+"&end_date="+end)
	if response.StatusCode != http.StatusOK || !payload.Success {
		t.Fatalf("status = %d, success = %t", response.StatusCode, payload.Success)
	}
	summary := payload.Data.Summary
	if summary.TotalGuru != 2 || summary.TotalHariKerja != 6 || summary.Hadir != 3 || summary.TepatWaktu != 2 || summary.Terlambat != 1 || summary.Izin != 1 || summary.Sakit != 1 || summary.Alfa != 1 {
		t.Fatalf("unexpected summary: %+v", summary)
	}
	if summary.CheckoutLengkap != 2 || summary.LupaCheckout != 1 {
		t.Fatalf("checkout summary = %+v", summary)
	}
	if len(payload.Data.Details.TerlambatPiket) != 1 || len(payload.Data.Details.PulangAwal) != 1 || len(payload.Data.Details.LupaCheckout) != 1 {
		t.Fatalf("unexpected operational details: %+v", payload.Data.Details)
	}
	if len(payload.Data.Teachers) != 2 || payload.Data.Teachers[0].Skor < payload.Data.Teachers[1].Skor {
		t.Fatalf("teachers are not sorted by the established score: %+v", payload.Data.Teachers)
	}

	filteredResponse, filtered := analyticsRequest(t, app, manager, admin, "/api/v1/reports/analytics?start_date="+start+"&end_date="+end+"&tipe_guru=full_time&user_id="+strconv.FormatUint(uint64(guruOne.ID), 10))
	if filteredResponse.StatusCode != http.StatusOK || filtered.Data.Summary.TotalGuru != 1 || filtered.Data.Summary.Hadir != 2 || len(filtered.Data.Teachers) != 1 || filtered.Data.Teachers[0].ID != guruOne.ID {
		t.Fatalf("teacher filter not applied: %+v", filtered.Data)
	}
}

func TestAnalyticsReportRejectsUnauthorizedRoleAndInvalidRanges(t *testing.T) {
	app, manager, admin, _, guru, start, end := analyticsTestSetup(t)
	for _, path := range []string{
		"/api/v1/reports/analytics?start_date=" + start + "&end_date=" + end,
		"/api/v1/reports/analytics?start_date=2030-01-01&end_date=2030-01-02",
		"/api/v1/reports/analytics?start_date=2024-01-01&end_date=2025-01-02",
	} {
		user := admin
		want := http.StatusBadRequest
		if strings.Contains(path, "start_date="+start) {
			user = guru
			want = http.StatusForbidden
		}
		response, _ := analyticsRequest(t, app, manager, user, path)
		if response.StatusCode != want {
			t.Fatalf("%s status = %d, want %d", path, response.StatusCode, want)
		}
	}
}
