package compat

import (
	"strings"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
	"gorm.io/gorm"
)

func TestClassifyCheckInMarksLateAfterConfiguredTime(t *testing.T) {
	user := models.User{TipeGuru: "full_time"}
	checkedInAt := time.Date(2026, time.August, 14, 7, 24, 49, 0, time.FixedZone("WIB", 7*60*60))

	status, note := classifyCheckIn(user, checkedInAt, "07:20", "", "15", "")
	if status != "hadir_terlambat" {
		t.Fatalf("status = %q, want hadir_terlambat", status)
	}
	if note != "Terlambat 4 menit" {
		t.Fatalf("note = %q, want late-minute explanation", note)
	}
}

func TestLateMinutesForAttendanceUsesEffectivePiketTarget(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := db.AutoMigrate(&models.Holiday{}, &models.JadwalPiket{}); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	piketTime, checkInTime := "07:00", "07:12"
	if err := db.Create(&models.JadwalPiket{UserID: 42, Hari: "Selasa", JamPiket: &piketTime, IsActive: true}).Error; err != nil {
		t.Fatalf("create piket schedule: %v", err)
	}

	minutes, err := (&Handler{db: db}).lateMinutesForAttendance(
		models.User{ID: 42},
		models.AttendanceLog{JamMasuk: &checkInTime},
		time.Date(2026, time.August, 18, 0, 0, 0, 0, time.UTC),
		map[string]string{"jam_masuk_normal": "07:20"},
	)
	if err != nil {
		t.Fatalf("calculate late minutes: %v", err)
	}
	if minutes == nil || *minutes != 12 {
		t.Fatalf("late minutes = %v, want 12", minutes)
	}
}

func TestClassifyCheckInKeepsLegacyPartTimeException(t *testing.T) {
	user := models.User{TipeGuru: "partime"}
	checkedInAt := time.Date(2026, time.August, 14, 8, 0, 0, 0, time.FixedZone("WIB", 7*60*60))

	status, note := classifyCheckIn(user, checkedInAt, "07:20", "", "15", "")
	if status != "hadir" || note != "Guru Partime" {
		t.Fatalf("part-time result = (%q, %q), want (hadir, Guru Partime)", status, note)
	}
}

func TestCheckInTargetUsesOnlyActivePiketSchedule(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := db.AutoMigrate(&models.Holiday{}, &models.JadwalPiket{}); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	inactiveTime := "06:45"
	activeTime := "07:00"
	for _, schedule := range []models.JadwalPiket{
		{UserID: 42, Hari: "Selasa", JamPiket: &inactiveTime, IsActive: false},
		{UserID: 42, Hari: "Selasa", JamPiket: &activeTime, IsActive: true},
	} {
		if err := db.Create(&schedule).Error; err != nil {
			t.Fatalf("create piket schedule: %v", err)
		}
	}

	h := &Handler{db: db}
	target, label, err := h.checkInTarget(42, time.Date(2026, time.August, 18, 0, 0, 0, 0, time.UTC), map[string]string{
		"jam_masuk_normal": "07:20",
	})
	if err != nil {
		t.Fatalf("check in target: %v", err)
	}
	if target != "07:00:00" || label != " (Piket)" {
		t.Fatalf("piket target = (%q, %q), want (07:00:00,  (Piket))", target, label)
	}
	status, note := classifyCheckIn(models.User{TipeGuru: "full_time"}, time.Date(2026, time.August, 18, 7, 1, 0, 0, time.UTC), target, label, "15", "")
	if status != "hadir_terlambat" || note != "Terlambat 1 menit (Piket)" {
		t.Fatalf("piket check in = (%q, %q), want (hadir_terlambat, Terlambat 1 menit (Piket))", status, note)
	}
}

func TestDerivedAttendanceStatusMarksStoredHadirLate(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := db.AutoMigrate(&models.Holiday{}, &models.JadwalPiket{}); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	h := &Handler{db: db}
	checkInTime := "07:24:49"
	status, err := h.derivedAttendanceStatus(
		models.User{ID: 42, TipeGuru: "full_time"},
		models.AttendanceLog{Status: "hadir", JamMasuk: &checkInTime},
		time.Date(2026, time.August, 14, 0, 0, 0, 0, time.FixedZone("WIB", 7*60*60)),
		map[string]string{"jam_masuk_normal": "07:20", "toleransi_terlambat": "15"},
	)
	if err != nil {
		t.Fatalf("derive attendance status: %v", err)
	}
	if status != "hadir_terlambat" {
		t.Fatalf("status = %q, want hadir_terlambat", status)
	}
}

func TestCheckoutTargetUsesPiketScheduleAndDailyOverride(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.Holiday{}, &models.JadwalPiket{}, &models.PengaturanHarian{}); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	piketPulang := "13:00"
	if err := db.Create(&models.JadwalPiket{UserID: 42, Hari: "Selasa", JamPulangPiket: &piketPulang, IsActive: true}).Error; err != nil {
		t.Fatalf("create piket schedule: %v", err)
	}
	date := time.Date(2026, time.August, 18, 0, 0, 0, 0, time.UTC)
	overridePiket := "14:00"
	if err := db.Create(&models.PengaturanHarian{Tanggal: date, JamPulangPiketKhusus: &overridePiket, JamPulangPiketAktif: true}).Error; err != nil {
		t.Fatalf("create daily override: %v", err)
	}

	target, isPiket, err := (&Handler{db: db}).checkoutTarget(42, date, map[string]string{"jam_min_pulang": "12:30"})
	if err != nil {
		t.Fatalf("checkout target: %v", err)
	}
	if target != "14:00:00" || !isPiket {
		t.Fatalf("checkout target = (%q, %t), want (14:00:00, true)", target, isPiket)
	}

	groupA := "A"
	if err := db.Create(&models.User{ID: 43, Username: "guru-a", Role: "guru", Nama: "Guru A", PiketGroup: &groupA}).Error; err != nil {
		t.Fatalf("create rotation teacher: %v", err)
	}
	rotationDate := time.Date(2026, time.August, 1, 0, 0, 0, 0, time.UTC)
	if err := db.Create(&models.PengaturanHarian{Tanggal: rotationDate, JamPulangPiketKhusus: &overridePiket, JamPulangPiketAktif: true}).Error; err != nil {
		t.Fatalf("create Saturday override: %v", err)
	}
	target, isPiket, err = (&Handler{db: db}).checkoutTarget(43, rotationDate, map[string]string{"jam_min_pulang": "12:30"})
	if err != nil {
		t.Fatalf("Saturday checkout target: %v", err)
	}
	if target != "14:00:00" || !isPiket {
		t.Fatalf("Saturday checkout target = (%q, %t), want (14:00:00, true)", target, isPiket)
	}
}
