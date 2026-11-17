package compat

import (
	"encoding/json"
	"io"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/auth"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/config"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
)

type correctionFixture struct {
	db                                  *gorm.DB
	h                                   *Handler
	app                                 *fiber.App
	adminToken, teacherToken, headToken string
	rows                                []models.AttendanceLog
	users                               []models.User
	options                             correctionOptions
}

func newCorrectionFixture(t *testing.T) correctionFixture {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	t.Cleanup(func() { sqlDB.Close() })
	if err := db.AutoMigrate(&models.User{}, &models.AttendanceLog{}, &models.Setting{}, &models.Holiday{}, &models.JadwalPiket{}, &models.OptionalWorkday{}, &models.WeekendOverride{}, &models.AttendanceCorrection{}, &models.MonthlyAttendanceConfirmation{}); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{AppTimezone: "Asia/Jakarta", JWTSecret: "correction-test-secret-longer-than-32-characters", JWTIssuer: "test", JWTAudience: "web", JWTAccessTTL: time.Hour}
	manager := auth.NewJWTManager(cfg)
	h := NewHandler(db, cfg, manager)
	app := fiber.New()
	h.RegisterCorrectionRoutes(app)
	for _, s := range []models.Setting{{Key: "jam_masuk_normal", Value: "07:00"}, {Key: "workday_days", Value: "6"}, {Key: "piket_rotation_enabled", Value: "1"}, {Key: "piket_jam_masuk", Value: "07:00"}, {Key: "toleransi_terlambat", Value: "10"}} {
		if err := db.Create(&s).Error; err != nil {
			t.Fatal(err)
		}
	}
	created := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	users := []models.User{
		{Username: "admin", Nama: "Admin", Role: "admin", CreatedAt: created},
		{Username: "yusuf", Nama: "Yusuf", Role: "guru", PiketGroup: pointerString("A"), CreatedAt: created},
		{Username: "duty-b", Nama: "Grup B", Role: "guru", PiketGroup: pointerString("B"), CreatedAt: created},
		{Username: "pokjar-afternoon", Nama: "Pokjar Sore", Role: "guru", Pokjar: pointerString("Lentera Qalbu"), PiketGroup: pointerString("B"), CreatedAt: created},
		{Username: "pokjar-no-clock", Nama: "Pokjar Tanpa Jam", Role: "guru", Pokjar: pointerString("Umar bin Khattab"), CreatedAt: created},
		{Username: "manual", Nama: "Sudah Hadir", Role: "guru", Pokjar: pointerString("  "), CreatedAt: created},
		{Username: "head", Nama: "Kepala", Role: "kepala_sekolah", CreatedAt: created},
	}
	for i := range users {
		if err := db.Create(&users[i]).Error; err != nil {
			t.Fatal(err)
		}
	}
	token := func(user models.User) string {
		v, _, err := manager.IssueAccess(user)
		if err != nil {
			t.Fatal(err)
		}
		return v
	}
	d1, _ := parseDate("2026-11-07", appLocation(h))
	d2, _ := parseDate("2026-11-14", appLocation(h))
	outside, _ := parseDate("2026-10-31", appLocation(h))
	rows := []models.AttendanceLog{
		{UserID: users[1].ID, Nama: users[1].Nama, Tanggal: d1, Status: "hadir_terlambat", JamMasuk: pointerString("07:10:00"), Keterangan: pointerString("Catatan admin | Terlambat 10 menit (Piket Sabtu)")},
		{UserID: users[1].ID, Nama: users[1].Nama, Tanggal: d2, Status: "hadir_terlambat", JamMasuk: pointerString("07:10:00"), JamPulang: pointerString("11:05:33"), JamHadir: pointerString("07:10:15"), Keterangan: pointerString("Catatan admin | Terlambat 10 menit"), Latitude: pointerFloat(-7.23, true), Longitude: pointerFloat(109.45, true), Metode: "qr", QRNonce: pointerString("preserve-nonce")},
		{UserID: users[2].ID, Nama: users[2].Nama, Tanggal: d2, Status: "hadir_izin_terlambat", JamMasuk: pointerString("07:10:00"), Keterangan: pointerString("Terlambat 10 menit | Izin kepala")},
		{UserID: users[3].ID, Nama: users[3].Nama, Tanggal: d2, Status: "hadir_terlambat", JamMasuk: pointerString("14:00:00"), Keterangan: pointerString("Terlambat 420 menit (Parah) (Piket Sabtu) | Catatan Pokjar")},
		{UserID: users[4].ID, Nama: users[4].Nama, Tanggal: d2, Status: "hadir_izin_terlambat", Keterangan: pointerString("Terlambat 10 menit | Bukti hadir diverifikasi")},
		{UserID: users[5].ID, Nama: users[5].Nama, Tanggal: d2, Status: "hadir", JamMasuk: pointerString("09:00:00"), Keterangan: pointerString("Disetujui manual")},
		{UserID: users[1].ID, Nama: users[1].Nama, Tanggal: d1.AddDate(0, 0, 1), Status: "sakit", JamSakit: pointerString("09:00:00"), Keterangan: pointerString("Surat sakit")},
		{UserID: users[3].ID, Nama: users[3].Nama, Tanggal: d1, Status: "izin", JamIzin: pointerString("08:00:00")},
		{UserID: users[1].ID, Nama: users[1].Nama, Tanggal: outside, Status: "hadir_terlambat", JamMasuk: pointerString("07:10:00")},
	}
	for i := range rows {
		if err := db.Create(&rows[i]).Error; err != nil {
			t.Fatal(err)
		}
		// Compare database representations, including timestamp precision/zone.
		if err := db.First(&rows[i], rows[i].ID).Error; err != nil {
			t.Fatal(err)
		}
	}
	// An old weekday roster must not override a non-duty rotation week.
	if err := db.Create(&models.JadwalPiket{UserID: users[1].ID, Hari: "Sabtu", JamPiket: pointerString("06:00"), IsActive: true}).Error; err != nil {
		t.Fatal(err)
	}
	confirmed := models.MonthlyAttendanceConfirmation{UserID: users[1].ID, PeriodStart: d1, PeriodEnd: d2, Status: monthlyConfirmationStatusConfirmed, Snapshot: pointerString("immutable-confirmed-snapshot")}
	if err := db.Create(&confirmed).Error; err != nil {
		t.Fatal(err)
	}
	return correctionFixture{db: db, h: h, app: app, adminToken: token(users[0]), teacherToken: token(users[1]), headToken: token(users[6]), rows: rows, users: users, options: correctionOptions{StartDate: "2026-11-07", EndDate: "2026-11-14", Scope: "all", NormalTime: "07:20", Reason: "Salah set jam normal menjadi 07.00"}}
}

func correctionCall(t *testing.T, f correctionFixture, method, path, token string, body any) (int, []byte) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = strings.NewReader(string(data))
	}
	req := httptest.NewRequest(method, "/api/v1/operations/attendance-corrections"+path, reader)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := f.app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(res.Body)
	return res.StatusCode, data
}

func correctionPayload(o correctionOptions, hash string) map[string]any {
	return map[string]any{"start_date": o.StartDate, "end_date": o.EndDate, "scope": o.Scope, "normal_time": o.NormalTime, "reason": o.Reason, "preview_hash": hash}
}

func apiCorrectionPreview(t *testing.T, f correctionFixture) correctionPreview {
	t.Helper()
	q := url.Values{"start_date": {f.options.StartDate}, "end_date": {f.options.EndDate}, "scope": {f.options.Scope}, "normal_time": {f.options.NormalTime}, "reason": {f.options.Reason}}
	status, data := correctionCall(t, f, "GET", "/preview?"+q.Encode(), f.adminToken, nil)
	if status != 200 {
		t.Fatalf("preview %d: %s", status, data)
	}
	var envelope struct {
		Data correctionPreview `json:"data"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		t.Fatal(err)
	}
	return envelope.Data
}

func applyCorrectionFixture(t *testing.T, f correctionFixture, p correctionPreview) models.AttendanceCorrection {
	t.Helper()
	status, data := correctionCall(t, f, "POST", "/apply", f.adminToken, correctionPayload(p.Options, p.Hash))
	if status != 200 {
		t.Fatalf("apply %d: %s", status, data)
	}
	var envelope struct {
		Data models.AttendanceCorrection `json:"data"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		t.Fatal(err)
	}
	return envelope.Data
}

func TestBulkCorrectionSeparatesPusatPokjarAndPreservesOriginalData(t *testing.T) {
	f := newCorrectionFixture(t)
	p := apiCorrectionPreview(t, f)
	if p.Changed != 4 || p.PusatChanged != 2 || p.PokjarChanged != 2 {
		t.Fatalf("unexpected preview: %+v", p)
	}
	byID := map[uint]correctionChange{}
	for _, v := range p.Items {
		byID[v.ID] = v
	}
	if _, ok := byID[f.rows[0].ID]; ok {
		t.Fatal("week-one group-A duty already correct, must be unchanged")
	}
	if byID[f.rows[1].ID].NewStatus != "hadir" || byID[f.rows[1].ID].Target != "07:20:00" {
		t.Fatal("Yusuf week-two non-duty must become on-time")
	}
	if byID[f.rows[2].ID].NewStatus != "hadir_izin_terlambat" || byID[f.rows[2].ID].Target != "07:00:00" {
		t.Fatal("assigned duty must retain late permission")
	}
	for _, i := range []int{3, 4} {
		v := byID[f.rows[i].ID]
		if v.Category != "pokjar" || v.Target != "" || v.NewStatus != "hadir" {
			t.Fatalf("Pokjar classification: %+v", v)
		}
	}
	assertRecalculatedStatus(t, f.db, f.rows[1].ID, "hadir_terlambat") // Preview is read-only.
	batch := applyCorrectionFixture(t, f, p)
	for i, before := range f.rows {
		var after models.AttendanceLog
		f.db.First(&after, before.ID)
		if i == 1 {
			if after.Status != "hadir" || stringPointerValue(after.Keterangan) != "Catatan admin" {
				t.Fatal("incorrect Yusuf fix")
			}
		}
		if i == 3 || i == 4 {
			if after.Status != "hadir" || strings.Contains(stringPointerValue(after.Keterangan), "Terlambat") || strings.Contains(stringPointerValue(after.Keterangan), "Piket Sabtu") {
				t.Fatal("Pokjar late markers survived")
			}
		}
		// Only status, generated note and update timestamp may differ.
		after.Status = before.Status
		after.Keterangan = before.Keterangan
		after.UpdatedAt = before.UpdatedAt
		if !reflect.DeepEqual(after, before) {
			t.Fatalf("attendance %d lost original fields:\n%+v\n%+v", i, before, after)
		}
	}
	var settings models.Setting
	f.db.First(&settings, "setting_key = ?", "jam_masuk_normal")
	if settings.Value != "07:00" {
		t.Fatal("bulk correction changed global settings")
	}
	var confirmed models.MonthlyAttendanceConfirmation
	f.db.First(&confirmed)
	if stringPointerValue(confirmed.Snapshot) != "immutable-confirmed-snapshot" {
		t.Fatal("confirmed snapshot changed")
	}
	var stored models.AttendanceCorrection
	f.db.First(&stored, "id = ?", batch.ID)
	if stored.Snapshot == "" {
		t.Fatal("missing original-data journal")
	}
	status, _ := correctionCall(t, f, "POST", "/apply", f.adminToken, correctionPayload(p.Options, p.Hash))
	if status != 409 {
		t.Fatalf("replayed preview status %d", status)
	}
	if apiCorrectionPreview(t, f).Changed != 0 {
		t.Fatal("correction must be idempotent")
	}
	status, data := correctionCall(t, f, "GET", "/"+batch.ID, f.adminToken, nil)
	if status != 200 || !strings.Contains(string(data), "Catatan admin") {
		t.Fatalf("missing details %s", data)
	}
	status, data = correctionCall(t, f, "POST", "/"+batch.ID+"/undo", f.adminToken, nil)
	if status != 200 {
		t.Fatalf("undo %d %s", status, data)
	}
	for _, before := range f.rows {
		var after models.AttendanceLog
		f.db.First(&after, before.ID)
		after.UpdatedAt = before.UpdatedAt
		if !reflect.DeepEqual(before, after) {
			t.Fatalf("undo failed to restore %d", before.ID)
		}
	}
	status, _ = correctionCall(t, f, "POST", "/"+batch.ID+"/undo", f.adminToken, nil)
	if status != 409 {
		t.Fatal("duplicate undo must be rejected")
	}
}

func TestBulkCorrectionScopeAndPokjarWithoutClock(t *testing.T) {
	for _, scope := range []string{"pusat", "pokjar"} {
		t.Run(scope, func(t *testing.T) {
			f := newCorrectionFixture(t)
			f.options.Scope = scope
			p := apiCorrectionPreview(t, f)
			if p.Changed != 2 {
				t.Fatalf("scope changes %d", p.Changed)
			}
			for _, v := range p.Items {
				if v.Category != scope {
					t.Fatalf("cross-category correction %+v", v)
				}
			}
			applyCorrectionFixture(t, f, p)
		})
	}
}

func TestBulkCorrectionRejectsStalePreview(t *testing.T) {
	mutations := map[string]func(correctionFixture){
		"time":        func(f correctionFixture) { f.db.Model(&f.rows[1]).Update("jam_masuk", "06:00:00") },
		"manual-note": func(f correctionFixture) { f.db.Model(&f.rows[1]).Update("keterangan", "New manual note") },
		"category":    func(f correctionFixture) { f.db.Model(&f.users[1]).Update("pokjar", "Lentera Qalbu") },
		"group":       func(f correctionFixture) { f.db.Model(&f.users[1]).Update("piket_group", "B") },
		"rules": func(f correctionFixture) {
			f.db.Model(&models.Setting{}).Where("setting_key = ?", "piket_jam_masuk").Update("setting_value", "06:40")
		},
		"new-row": func(f correctionFixture) {
			date, _ := parseDate("2026-11-14", appLocation(f.h))
			f.db.Create(&models.AttendanceLog{UserID: f.users[5].ID, Tanggal: date, Status: "hadir_terlambat", JamMasuk: pointerString("07:10")})
		},
		"deleted-row": func(f correctionFixture) { f.db.Delete(&models.AttendanceLog{}, f.rows[1].ID) },
	}
	for name, mutate := range mutations {
		t.Run(name, func(t *testing.T) {
			f := newCorrectionFixture(t)
			p := apiCorrectionPreview(t, f)
			mutate(f)
			var before []models.AttendanceLog
			f.db.Order("id").Find(&before)
			status, data := correctionCall(t, f, "POST", "/apply", f.adminToken, correctionPayload(p.Options, p.Hash))
			if status != 409 {
				t.Fatalf("stale %d %s", status, data)
			}
			var after []models.AttendanceLog
			f.db.Order("id").Find(&after)
			if !reflect.DeepEqual(before, after) {
				t.Fatal("stale preview wrote attendance")
			}
			var count int64
			f.db.Model(&models.AttendanceCorrection{}).Count(&count)
			if count != 0 {
				t.Fatal("stale batch saved")
			}
		})
	}
}

func TestBulkCorrectionJournalFailureRollsBackAllWrites(t *testing.T) {
	f := newCorrectionFixture(t)
	p := apiCorrectionPreview(t, f)
	if err := f.db.Migrator().DropTable(&models.AttendanceCorrection{}); err != nil {
		t.Fatal(err)
	}
	status, _ := correctionCall(t, f, "POST", "/apply", f.adminToken, correctionPayload(p.Options, p.Hash))
	if status == 200 {
		t.Fatal("journal failure reported success")
	}
	for _, before := range f.rows {
		var after models.AttendanceLog
		f.db.First(&after, before.ID)
		if !reflect.DeepEqual(before, after) {
			t.Fatal("journal failure did not roll back attendance")
		}
	}
}

func TestBulkCorrectionUndoProtectsLaterEditsAtomically(t *testing.T) {
	f := newCorrectionFixture(t)
	batch := applyCorrectionFixture(t, f, apiCorrectionPreview(t, f))
	// Edit the last affected row so a naive loop would already have restored
	// earlier rows before discovering the conflict.
	f.db.Model(&f.rows[4]).Update("jam_pulang", "15:00:00")
	var before []models.AttendanceLog
	f.db.Order("id").Find(&before)
	status, data := correctionCall(t, f, "POST", "/"+batch.ID+"/undo", f.adminToken, nil)
	if status != 409 {
		t.Fatalf("undo conflict %d %s", status, data)
	}
	var after []models.AttendanceLog
	f.db.Order("id").Find(&after)
	if !reflect.DeepEqual(before, after) {
		t.Fatal("failed undo partially restored rows")
	}
}

func TestBulkCorrectionAuthAndValidation(t *testing.T) {
	f := newCorrectionFixture(t)
	for _, token := range []string{"", f.teacherToken, f.headToken} {
		for _, path := range []string{"/", "/preview", "/missing-id"} {
			status, _ := correctionCall(t, f, "GET", path, token, nil)
			if status != 401 && status != 403 {
				t.Fatalf("read auth %d", status)
			}
		}
		for _, path := range []string{"/apply", "/missing-id/undo"} {
			status, _ := correctionCall(t, f, "POST", path, token, map[string]any{})
			if status != 401 && status != 403 {
				t.Fatalf("write auth %d", status)
			}
		}
	}
	p := apiCorrectionPreview(t, f)
	for name, edit := range map[string]func(map[string]any){
		"missing-preview": func(v map[string]any) { delete(v, "preview_hash") },
		"invalid-time":    func(v map[string]any) { v["normal_time"] = "25:00" },
		"future":          func(v map[string]any) { v["end_date"] = time.Now().AddDate(0, 0, 2).Format("2006-01-02") },
		"reversed":        func(v map[string]any) { v["start_date"] = "2026-11-15" },
		"range":           func(v map[string]any) { v["start_date"] = "2024-01-01" },
		"unknown-scope":   func(v map[string]any) { v["scope"] = "Tutor" },
		"no-reason":       func(v map[string]any) { v["reason"] = "" },
	} {
		t.Run(name, func(t *testing.T) {
			v := correctionPayload(p.Options, p.Hash)
			edit(v)
			status, data := correctionCall(t, f, "POST", "/apply", f.adminToken, v)
			if status != 400 {
				t.Fatalf("validation %d %s", status, data)
			}
		})
	}
}

func TestBulkCorrectionSharedRulesMatchLiveAttendance(t *testing.T) {
	f := newCorrectionFixture(t)
	settings := rotationSettings(map[string]string{"jam_masuk_normal": "07:20", "piket_jam_masuk": "06:40", "apel_senin_enabled": "1"})
	for _, day := range []string{"2026-11-02", "2026-11-07", "2026-11-14", "2026-11-21", "2026-11-28", "2026-08-29"} {
		date, _ := parseDate(day, appLocation(f.h))
		for _, user := range []models.User{f.users[1], f.users[2], f.users[3]} {
			var schedule models.JadwalPiket
			var ptr *models.JadwalPiket
			if f.db.Where("user_id = ? AND hari = ? AND is_active = ?", user.ID, dayName(date.Weekday()), true).First(&schedule).Error == nil {
				ptr = &schedule
			}
			a, b, err := f.h.checkInTarget(user.ID, date, settings)
			if err != nil {
				t.Fatal(err)
			}
			x, y, _ := targetForLoadedRules(user, date, settings, nil, ptr)
			if a != x || b != y {
				t.Fatalf("rule mismatch %s user %d: %s/%s vs %s/%s", day, user.ID, a, b, x, y)
			}
		}
	}
}

func TestPokjarClassificationAndSingleDateRepairNeverRequireTime(t *testing.T) {
	f := newCorrectionFixture(t)
	user := f.users[3]
	date, _ := parseDate("2026-11-14", appLocation(f.h))
	status, note := classifyCheckIn(user, date.Add(15*time.Hour), "07:00", " (Piket Sabtu)", "10", "Catatan manual")
	if status != "hadir" || note != "Catatan manual" {
		t.Fatal("Pokjar assessed on clock time")
	}
	minutes, err := f.h.lateMinutesForAttendance(user, f.rows[3], date, nil)
	if err != nil || minutes != nil {
		t.Fatal("Pokjar has derived late minutes")
	}
	derived, err := f.h.derivedAttendanceStatus(user, f.rows[3], date, nil)
	if err != nil || derived != "hadir" {
		t.Fatal("Pokjar derived view remains late")
	}
	p, err := f.h.todayCheckInRecalculationPreview(date, map[string]string{"jam_masuk_normal": "07:20"})
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []uint{f.rows[3].ID, f.rows[4].ID} {
		found := false
		for _, item := range p.Items {
			if item.ID == id {
				found = true
				if item.NewStatus != "hadir" || item.Target != "" {
					t.Fatalf("single date Pokjar %+v", item)
				}
			}
		}
		if !found {
			t.Fatal("Pokjar without time was skipped")
		}
	}
}

func TestBulkCorrectionSpecialAgendaOverridesPiketAndCalendar(t *testing.T) {
	t.Run("special-agenda", func(t *testing.T) {
		f := newCorrectionFixture(t)
		date, _ := parseDate("2026-11-14", appLocation(f.h))
		if err := f.db.Create(&models.Holiday{Tanggal: date, Nama: "Rapat", IsWorkday: true, JamMasukKhusus: pointerString("08:00")}).Error; err != nil {
			t.Fatal(err)
		}
		p := apiCorrectionPreview(t, f)
		for _, change := range p.Items {
			if change.Category == "pusat" && change.Date == "2026-11-14" {
				if change.Target != "08:00:00" || change.NewStatus != "hadir" {
					t.Fatalf("agenda lost precedence: %+v", change)
				}
			}
		}
		batch := applyCorrectionFixture(t, f, p)
		if batch.Changed != 4 {
			t.Fatalf("agenda changes %d", batch.Changed)
		}
	})
	t.Run("non-workday", func(t *testing.T) {
		f := newCorrectionFixture(t)
		date, _ := parseDate("2026-11-14", appLocation(f.h))
		if err := f.db.Create(&models.WeekendOverride{UserID: f.users[1].ID, Tanggal: date, IsWorkday: false}).Error; err != nil {
			t.Fatal(err)
		}
		p := apiCorrectionPreview(t, f)
		if p.SkippedNonWorkday != 1 {
			t.Fatal("non-workday not skipped")
		}
		for _, change := range p.Items {
			if change.ID == f.rows[1].ID {
				t.Fatal("non-workday changed")
			}
		}
	})
	t.Run("missing-pusat-clock", func(t *testing.T) {
		f := newCorrectionFixture(t)
		f.db.Model(&f.rows[1]).Updates(map[string]any{"jam_masuk": nil, "jam_hadir": nil})
		p := apiCorrectionPreview(t, f)
		if p.SkippedNoTime != 1 || p.PokjarChanged != 2 {
			t.Fatal("clock requirement leaked between Pusat and Pokjar")
		}
	})
}

func TestBulkCorrectionUndoRestoresNullNotes(t *testing.T) {
	f := newCorrectionFixture(t)
	f.db.Model(&f.rows[2]).Update("keterangan", nil)
	batch := applyCorrectionFixture(t, f, apiCorrectionPreview(t, f))
	status, data := correctionCall(t, f, "POST", "/"+batch.ID+"/undo", f.adminToken, nil)
	if status != 200 {
		t.Fatalf("undo %d %s", status, data)
	}
	var row models.AttendanceLog
	f.db.First(&row, f.rows[2].ID)
	if row.Keterangan != nil {
		t.Fatal("NULL original note not restored")
	}
}

func TestBulkCorrectionRemovesDuplicateAutomaticNotesIdempotently(t *testing.T) {
	f := newCorrectionFixture(t)
	f.db.Model(&f.rows[3]).Update("keterangan", "Catatan Pokjar | Terlambat 10 menit (Piket Sabtu) | Terlambat 420 menit (Parah)")
	applyCorrectionFixture(t, f, apiCorrectionPreview(t, f))
	assertRecalculatedNote(t, f.db, f.rows[3].ID, "Catatan Pokjar")
	if apiCorrectionPreview(t, f).Changed != 0 {
		t.Fatal("duplicate automatic notes require repeated corrections")
	}
}
