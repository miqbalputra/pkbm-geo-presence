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

func TestCheckInRecalculationSupportsPastDateAndPiketTargets(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.AttendanceLog{}, &models.Setting{}, &models.Holiday{}, &models.JadwalPiket{}, &models.ActivityLog{}); err != nil {
		t.Fatal(err)
	}
	location, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		t.Fatal(err)
	}
	date := dateOnly(time.Now().In(location)).AddDate(0, 0, -1)
	admin := models.User{Username: "admin-recalculate", Role: "admin", Nama: "Admin Recalculate", TipeGuru: "full_time"}
	normal := models.User{Username: "normal-recalculate", Role: "guru", Nama: "Guru Normal", TipeGuru: "full_time"}
	late := models.User{Username: "late-recalculate", Role: "guru", Nama: "Guru Terlambat", TipeGuru: "full_time"}
	piket := models.User{Username: "piket-recalculate", Role: "guru", Nama: "Guru Piket", TipeGuru: "full_time"}
	legacy := models.User{Username: "legacy-recalculate", Role: "guru", Nama: "Guru Legacy", TipeGuru: "full_time"}
	for _, user := range []*models.User{&admin, &normal, &late, &piket, &legacy} {
		if err := db.Create(user).Error; err != nil {
			t.Fatal(err)
		}
	}
	for _, setting := range []models.Setting{
		{Key: "jam_masuk_normal", Value: "07:20"},
		{Key: "toleransi_terlambat", Value: "15"},
		{Key: "apel_senin_enabled", Value: "0"},
	} {
		if err := db.Create(&setting).Error; err != nil {
			t.Fatal(err)
		}
	}
	piketTime := "07:00"
	if err := db.Create(&models.JadwalPiket{UserID: piket.ID, NamaGuru: piket.Nama, Hari: dayName(date.Weekday()), JamPiket: &piketTime, IsActive: true}).Error; err != nil {
		t.Fatal(err)
	}
	sevenTen, sevenForty := "07:10:00", "07:40:00"
	manualNote := "Catatan manual harus tetap utuh"
	lateNote := "Terlambat 40 menit"
	legacyLateNote := "Terlambat 10 menit"
	rows := []models.AttendanceLog{
		{UserID: normal.ID, Nama: normal.Nama, Tanggal: date, Status: "hadir_terlambat", JamMasuk: &sevenTen, Keterangan: &manualNote},
		{UserID: late.ID, Nama: late.Nama, Tanggal: date, Status: "hadir_terlambat", JamMasuk: &sevenForty, Keterangan: &lateNote},
		{UserID: piket.ID, Nama: piket.Nama, Tanggal: date, Status: "hadir", JamMasuk: &sevenTen},
		{UserID: legacy.ID, Nama: legacy.Nama, Tanggal: date, Status: "hadir_izin_terlambat", JamMasuk: &sevenTen, Keterangan: &legacyLateNote},
		{UserID: normal.ID, Nama: normal.Nama, Tanggal: date, Status: "izin"},
	}
	for index := range rows {
		if err := db.Create(&rows[index]).Error; err != nil {
			t.Fatal(err)
		}
	}

	cfg := config.Config{AppTimezone: "Asia/Jakarta"}
	h := NewHandler(db, cfg, auth.NewJWTManager(cfg))
	app := fiber.New()
	app.Get("/preview", func(c *fiber.Ctx) error {
		c.Locals("authClaims", &auth.Claims{UserID: admin.ID, Role: "admin"})
		return h.todayCheckInRecalculation(c)
	})
	app.Post("/apply", func(c *fiber.Ctx) error {
		c.Locals("authClaims", &auth.Claims{UserID: admin.ID, Role: "admin"})
		return h.todayCheckInRecalculation(c)
	})

	previewRequest := httptest.NewRequest(fiber.MethodGet, "/preview?date="+date.Format("2006-01-02"), nil)
	previewResponse, err := app.Test(previewRequest)
	if err != nil {
		t.Fatal(err)
	}
	if previewResponse.StatusCode != fiber.StatusOK {
		t.Fatalf("preview status = %d, want %d", previewResponse.StatusCode, fiber.StatusOK)
	}
	var preview struct {
		Data todayCheckInRecalculationResponse `json:"data"`
	}
	if err := json.NewDecoder(previewResponse.Body).Decode(&preview); err != nil {
		t.Fatal(err)
	}
	if preview.Data.Date != date.Format("2006-01-02") || preview.Data.NormalTarget != "07:20:00" {
		t.Fatalf("unexpected preview period/target: %#v", preview.Data)
	}
	if preview.Data.Processed != 4 || preview.Data.Changed != 4 || preview.Data.Unchanged != 0 {
		t.Fatalf("preview counts = processed %d changed %d unchanged %d, want 4/4/0", preview.Data.Processed, preview.Data.Changed, preview.Data.Unchanged)
	}
	if !preview.Data.Items[1].NoteChanged || preview.Data.Items[1].StatusChanged || preview.Data.Items[1].NewLateMinutes == nil || *preview.Data.Items[1].NewLateMinutes != 20 {
		t.Fatalf("late-note preview = %#v, want unchanged status and 20 late minutes", preview.Data.Items[1])
	}
	if preview.Data.Items[2].Target != "07:00:00" || preview.Data.Items[2].NewStatus != "hadir_terlambat" {
		t.Fatalf("piket preview = %#v, want target 07:00 and late", preview.Data.Items[2])
	}
	var before models.AttendanceLog
	if err := db.First(&before, rows[0].ID).Error; err != nil {
		t.Fatal(err)
	}
	if before.Status != "hadir_terlambat" {
		t.Fatalf("preview changed status to %q", before.Status)
	}

	applyRequest := httptest.NewRequest(fiber.MethodPost, "/apply", strings.NewReader(`{"date":"`+date.Format("2006-01-02")+`"}`))
	applyRequest.Header.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
	applyResponse, err := app.Test(applyRequest)
	if err != nil {
		t.Fatal(err)
	}
	if applyResponse.StatusCode != fiber.StatusOK {
		t.Fatalf("apply status = %d, want %d", applyResponse.StatusCode, fiber.StatusOK)
	}
	assertRecalculatedStatus(t, db, rows[0].ID, "hadir")
	assertRecalculatedStatus(t, db, rows[1].ID, "hadir_terlambat")
	assertRecalculatedStatus(t, db, rows[2].ID, "hadir_terlambat")
	assertRecalculatedStatus(t, db, rows[3].ID, "hadir")
	assertRecalculatedStatus(t, db, rows[4].ID, "izin")
	var saved models.AttendanceLog
	if err := db.First(&saved, rows[0].ID).Error; err != nil {
		t.Fatal(err)
	}
	if saved.Keterangan == nil || *saved.Keterangan != manualNote {
		t.Fatalf("manual note changed to %#v", saved.Keterangan)
	}
	assertRecalculatedNote(t, db, rows[1].ID, "Terlambat 20 menit (Parah)")
	assertRecalculatedNote(t, db, rows[2].ID, "Terlambat 10 menit (Piket)")
	assertRecalculatedNote(t, db, rows[3].ID, "")

	secondPreviewRequest := httptest.NewRequest(fiber.MethodGet, "/preview?date="+date.Format("2006-01-02"), nil)
	secondPreviewResponse, err := app.Test(secondPreviewRequest)
	if err != nil {
		t.Fatal(err)
	}
	var secondPreview struct {
		Data todayCheckInRecalculationResponse `json:"data"`
	}
	if err := json.NewDecoder(secondPreviewResponse.Body).Decode(&secondPreview); err != nil {
		t.Fatal(err)
	}
	if secondPreview.Data.Changed != 0 {
		t.Fatalf("second preview still reports %d changes", secondPreview.Data.Changed)
	}

	futureRequest := httptest.NewRequest(fiber.MethodGet, "/preview?date="+dateOnly(time.Now().In(location)).AddDate(0, 0, 1).Format("2006-01-02"), nil)
	futureResponse, err := app.Test(futureRequest)
	if err != nil {
		t.Fatal(err)
	}
	if futureResponse.StatusCode != fiber.StatusBadRequest {
		t.Fatalf("future date status = %d, want %d", futureResponse.StatusCode, fiber.StatusBadRequest)
	}
}

func assertRecalculatedStatus(t *testing.T, db *gorm.DB, id uint, want string) {
	t.Helper()
	var record models.AttendanceLog
	if err := db.First(&record, id).Error; err != nil {
		t.Fatal(err)
	}
	if record.Status != want {
		t.Fatalf("record %d status = %q, want %q", id, record.Status, want)
	}
}

func assertRecalculatedNote(t *testing.T, db *gorm.DB, id uint, want string) {
	t.Helper()
	var record models.AttendanceLog
	if err := db.First(&record, id).Error; err != nil {
		t.Fatal(err)
	}
	got := ""
	if record.Keterangan != nil {
		got = *record.Keterangan
	}
	if got != want {
		t.Fatalf("record %d note = %q, want %q", id, got, want)
	}
}
