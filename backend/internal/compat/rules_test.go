package compat

import (
	"errors"
	"testing"
	"time"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
)

func TestDistanceMeters(t *testing.T) {
	distance := distanceMeters(-7.403244, 109.324961, -7.403244, 109.324961)
	if distance != 0 {
		t.Fatalf("expected zero distance, got %f", distance)
	}
	nearby := distanceMeters(-7.403244, 109.324961, -7.403244, 109.325061)
	if nearby < 10 || nearby > 12 {
		t.Fatalf("unexpected nearby distance: %f", nearby)
	}
}

func TestLocationSettings(t *testing.T) {
	h := &Handler{}
	settings := map[string]string{
		"radius_gps":            "20",
		"sekolah_latitude":      "-7.403244",
		"sekolah_longitude":     "109.324961",
		"lokasi_laki_latitude":  "",
		"lokasi_laki_longitude": "",
	}
	inside, _ := h.isInsideLocationWithSettings(settings, -7.403244, 109.324961)
	if !inside {
		t.Fatal("expected school coordinate to be inside geofence")
	}
	outside, distance := h.isInsideLocationWithSettings(settings, -7.404244, 109.324961)
	if outside || distance < 100 {
		t.Fatalf("expected coordinate to be outside geofence, distance=%f", distance)
	}
}

func TestPrefetchedWorkdayCalendar(t *testing.T) {
	calendar := workdayCalendar{
		holidays: map[string]models.Holiday{
			"2026-08-17": {IsWorkday: false},
			"2026-08-18": {IsWorkday: true},
		},
		optional: map[string]struct{}{"2026-08-19": {}},
		settings: map[string]string{"workday_days": "1,2,3,4,5"},
	}
	user := models.User{}
	loc, _ := time.LoadLocation("Asia/Jakarta")
	cases := []struct {
		date     string
		workday  bool
		optional bool
	}{
		{date: "2026-08-17", workday: false},
		{date: "2026-08-18", workday: true},
		{date: "2026-08-19", workday: false, optional: true},
		{date: "2026-08-20", workday: true},
	}
	for _, tc := range cases {
		date, _ := time.ParseInLocation("2006-01-02", tc.date, loc)
		workday, optional := calendar.isWorkday(user, date)
		if workday != tc.workday || optional != tc.optional {
			t.Fatalf("calendar %s = workday:%v optional:%v, want workday:%v optional:%v", tc.date, workday, optional, tc.workday, tc.optional)
		}
	}
}

func TestPKBMWorkdayCalendarDefaultsToSaturdayAndHonorsWeekendOverrides(t *testing.T) {
	calendar := workdayCalendar{
		holidays: map[string]models.Holiday{},
		optional: map[string]struct{}{},
		overrides: map[string]models.WeekendOverride{
			"7:2026-08-15": {UserID: 7, Tanggal: time.Date(2026, time.August, 15, 0, 0, 0, 0, time.UTC), IsWorkday: false},
			"7:2026-08-16": {UserID: 7, Tanggal: time.Date(2026, time.August, 16, 0, 0, 0, 0, time.UTC), IsWorkday: true},
		},
		settings: map[string]string{},
	}
	user := models.User{ID: 7}
	loc, _ := time.LoadLocation("Asia/Jakarta")
	for _, tc := range []struct {
		date string
		want bool
	}{
		{date: "2026-08-14", want: false}, // Jumat
		{date: "2026-08-15", want: false}, // override Sabtu ke non-kerja
		{date: "2026-08-16", want: true},  // override Minggu menjadi kerja
		{date: "2026-08-22", want: true},  // default Sabtu PKBM
		{date: "2026-08-23", want: false}, // default Minggu non-kerja
	} {
		date, _ := time.ParseInLocation("2006-01-02", tc.date, loc)
		workday, optional := calendar.isWorkday(user, date)
		if workday != tc.want || optional {
			t.Fatalf("calendar %s = workday:%v optional:%v, want workday:%v optional:false", tc.date, workday, optional, tc.want)
		}
	}
}

func TestSaturdayRotationGroupsAndWeekFiveMode(t *testing.T) {
	settings := rotationSettings(map[string]string{})
	groupA := models.User{PiketGroup: pointerString("A")}
	groupB := models.User{PiketGroup: pointerString("B")}
	pokjar := models.User{PiketGroup: pointerString("A"), Pokjar: pointerString("Lentera Qalbu")}
	weekOneSaturday := time.Date(2026, time.August, 1, 0, 0, 0, 0, time.UTC)
	weekTwoSaturday := time.Date(2026, time.August, 8, 0, 0, 0, 0, time.UTC)
	weekFiveSaturday := time.Date(2026, time.August, 29, 0, 0, 0, 0, time.UTC)
	if !isRotationTeacherOnDate(settings, groupA, weekOneSaturday) || isRotationTeacherOnDate(settings, groupB, weekOneSaturday) {
		t.Fatal("week one must assign only group A")
	}
	if !isRotationTeacherOnDate(settings, groupB, weekTwoSaturday) || isRotationTeacherOnDate(settings, groupA, weekTwoSaturday) {
		t.Fatal("week two must assign only group B")
	}
	if !isRotationTeacherOnDate(settings, groupA, weekFiveSaturday) || !isRotationTeacherOnDate(settings, groupB, weekFiveSaturday) {
		t.Fatal("default week five mode must assign both groups")
	}
	settings["piket_week5_mode"] = "none"
	if isRotationTeacherOnDate(settings, groupA, weekFiveSaturday) || isRotationTeacherOnDate(settings, groupB, weekFiveSaturday) {
		t.Fatal("week five none mode must assign neither group")
	}
	settings["piket_week5_mode"] = "all"
	if isRotationTeacherOnDate(settings, pokjar, weekFiveSaturday) {
		t.Fatal("Pokjar teachers must be excluded from Saturday rotation")
	}
}

func TestReportRangeLimit(t *testing.T) {
	start := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	if !validReportRange(start, start.AddDate(0, 0, 365)) {
		t.Fatal("expected one-year report range to be valid")
	}
	if validReportRange(start, start.AddDate(0, 0, 366)) {
		t.Fatal("expected report range beyond one year to be rejected")
	}
	if validReportRange(start.AddDate(0, 0, 1), start) {
		t.Fatal("expected reversed report range to be rejected")
	}
}

func TestValidateQRPayload(t *testing.T) {
	expires := time.Now().UTC().Add(5 * time.Minute)
	settings := map[string]string{"qr_secret": "secret", "qr_active_nonce": "nonce"}
	valid := map[string]any{"type": "attendance", "secret": "secret", "nonce": "nonce", "expires_at": expires.Format(time.RFC3339)}
	if nonce, err := validateQRPayload(valid, settings, time.Now().UTC()); err != nil || nonce != "nonce" {
		t.Fatalf("valid QR rejected: nonce=%q err=%v", nonce, err)
	}
	for name, payload := range map[string]map[string]any{
		"expired":  {"type": "attendance", "secret": "secret", "nonce": "nonce", "expires_at": time.Now().UTC().Add(-time.Minute).Format(time.RFC3339)},
		"replayed": {"type": "attendance", "secret": "secret", "nonce": "old", "expires_at": expires.Format(time.RFC3339)},
	} {
		if _, err := validateQRPayload(payload, settings, time.Now().UTC()); err == nil {
			t.Fatalf("%s QR should be rejected", name)
		}
	}
}

func TestAttendanceSafetyHelpers(t *testing.T) {
	settings := map[string]string{"location_tracking_accuracy_limit": "100"}
	if code, _ := gpsAccuracyError(settings, map[string]any{"accuracy": 101.0}); code != "GPS_ACCURACY_LOW" {
		t.Fatalf("expected low GPS accuracy error, got %q", code)
	}
	if code, _ := gpsAccuracyError(settings, map[string]any{"accuracy": 25.0}); code != "" {
		t.Fatalf("expected valid GPS accuracy, got %q", code)
	}
	if !isDuplicateError(errors.New("UNIQUE constraint failed: attendance_logs.user_id, attendance_logs.tanggal")) {
		t.Fatal("expected SQLite unique violation to be recognized as duplicate")
	}
	if !isDuplicateError(errors.New("Duplicate entry for key 'uq_attendance_user_date'")) {
		t.Fatal("expected MySQL duplicate violation to be recognized as duplicate")
	}
}
