package compat

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/auth"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/httpx"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
)

var errCorrectionStale = errors.New("data atau aturan berubah; buat pratinjau baru")
var errCorrectionAlreadyUndone = errors.New("koreksi sudah dibatalkan")
var errCorrectionNoChanges = errors.New("tidak ada presensi yang perlu diperbaiki")

type correctionOptions struct {
	StartDate  string `json:"start_date"`
	EndDate    string `json:"end_date"`
	Scope      string `json:"scope"`
	NormalTime string `json:"normal_time"`
	Reason     string `json:"reason"`
}

type correctionChange struct {
	todayCheckInRecalculationItem
	Date     string `json:"date"`
	Category string `json:"category"`
	Pokjar   string `json:"pokjar"`
}

type correctionPreview struct {
	Options           correctionOptions  `json:"options"`
	Hash              string             `json:"preview_hash"`
	Processed         int                `json:"processed"`
	Changed           int                `json:"changed"`
	PusatChanged      int                `json:"pusat_changed"`
	PokjarChanged     int                `json:"pokjar_changed"`
	SkippedNoTime     int                `json:"skipped_no_time"`
	SkippedNoUser     int                `json:"skipped_no_user"`
	SkippedNonWorkday int                `json:"skipped_non_workday"`
	Items             []correctionChange `json:"items"`
}

type correctionJournalEntry struct {
	Before    models.AttendanceLog `json:"before"`
	AfterHash string               `json:"after_hash"`
	Change    correctionChange     `json:"change"`
}

// All rule inputs are fingerprinted, including the category and actual times.
// The POST locks these rows before recomputing the fingerprint and writing.
type correctionInputs struct {
	Rows      []models.AttendanceLog
	Users     []models.User
	Settings  []models.Setting
	Holidays  []models.Holiday
	Schedules []models.JadwalPiket
	Optional  []models.OptionalWorkday
	Overrides []models.WeekendOverride
}

func (h *Handler) RegisterCorrectionRoutes(app fiber.Router) {
	group := app.Group("/api/v1/operations/attendance-corrections", auth.RequireActiveUser(h.db, h.jwt), auth.RequireRoles("admin"))
	group.Get("/preview", h.bulkCorrectionPreview)
	group.Post("/apply", h.bulkCorrectionApply)
	group.Get("/", h.bulkCorrectionHistory)
	group.Get("/:id", h.bulkCorrectionDetails)
	group.Post("/:id/undo", h.bulkCorrectionUndo)
}

func parseCorrectionOptions(c *fiber.Ctx, location *time.Location) (correctionOptions, string, error) {
	var o correctionOptions
	hash := ""
	if c.Method() == fiber.MethodGet {
		o = correctionOptions{StartDate: c.Query("start_date"), EndDate: c.Query("end_date"), Scope: c.Query("scope", "pusat"), NormalTime: c.Query("normal_time"), Reason: strings.TrimSpace(c.Query("reason"))}
	} else {
		var body struct {
			correctionOptions
			Hash string `json:"preview_hash"`
		}
		if err := json.Unmarshal(c.Body(), &body); err != nil {
			return o, "", errors.New("payload perbaikan tidak valid")
		}
		o, hash = body.correctionOptions, body.Hash
	}
	o.Reason = strings.TrimSpace(o.Reason)
	start, err := parseDate(o.StartDate, location)
	if err != nil {
		return o, "", errors.New("tanggal awal tidak valid")
	}
	end, err := parseDate(o.EndDate, location)
	if err != nil || !validReportRange(start, end) {
		return o, "", errors.New("rentang tanggal harus berurutan dan maksimal 366 hari")
	}
	if end.After(dateOnly(time.Now().In(location))) {
		return o, "", errors.New("tanggal perbaikan tidak boleh di masa depan")
	}
	if !contains([]string{"pusat", "pokjar", "all"}, o.Scope) {
		return o, "", errors.New("kategori harus pusat, pokjar, atau all")
	}
	if o.Scope == "pokjar" {
		o.NormalTime = ""
	} else {
		// An explicit time makes past-date corrections independent of accidental
		// edits to the global normal check-in setting. Piket/event times still win.
		if len(o.NormalTime) != 5 || !validTime(o.NormalTime) {
			return o, "", errors.New("isi jam normal PKBM Pusat dengan format HH:MM")
		}
	}
	if len([]rune(o.Reason)) < 5 || len([]rune(o.Reason)) > 500 {
		return o, "", errors.New("alasan perbaikan wajib diisi, 5–500 karakter")
	}
	return o, hash, nil
}

func correctionQuery(db *gorm.DB, lock bool) *gorm.DB {
	if lock {
		return db.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	return db
}

func (h *Handler) loadCorrectionInputs(o correctionOptions, lock bool) (correctionInputs, error) {
	var in correctionInputs
	end, _ := parseDate(o.EndDate, appLocation(h))
	endExclusive := end.AddDate(0, 0, 1).Format("2006-01-02")
	// A stable lock order is shared by apply requests.
	if err := correctionQuery(h.db, lock).Order("id ASC").Find(&in.Settings).Error; err != nil {
		return in, err
	}
	if err := correctionQuery(h.db, lock).Select("id, nama, role, tipe_guru, pokjar, piket_group, created_at").Where("role = ?", "guru").Order("id ASC").Find(&in.Users).Error; err != nil {
		return in, err
	}
	if err := correctionQuery(h.db, lock).Where("tanggal >= ? AND tanggal < ?", o.StartDate, endExclusive).Order("id ASC").Find(&in.Holidays).Error; err != nil {
		return in, err
	}
	if err := correctionQuery(h.db, lock).Where("is_active = ?", true).Order("id ASC").Find(&in.Schedules).Error; err != nil {
		return in, err
	}
	if err := correctionQuery(h.db, lock).Where("tanggal >= ? AND tanggal < ?", o.StartDate, endExclusive).Order("id ASC").Find(&in.Optional).Error; err != nil {
		return in, err
	}
	if err := correctionQuery(h.db, lock).Where("tanggal >= ? AND tanggal < ?", o.StartDate, endExclusive).Order("id ASC").Find(&in.Overrides).Error; err != nil {
		return in, err
	}
	if err := correctionQuery(h.db, lock).Where("tanggal >= ? AND tanggal < ?", o.StartDate, endExclusive).Order("id ASC").Limit(20001).Find(&in.Rows).Error; err != nil {
		return in, err
	}
	if len(in.Rows) > 20000 {
		return in, errors.New("rentang berisi lebih dari 20.000 presensi; gunakan rentang lebih pendek")
	}
	return in, nil
}

func correctionHash(value any) string {
	data, _ := json.Marshal(value)
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func attendanceCorrectionHash(row models.AttendanceLog) string {
	return correctionHash(struct {
		Row     models.AttendanceLog
		QRNonce *string
	}{row, row.QRNonce})
}

func (h *Handler) correctionPreviewFor(o correctionOptions, lock bool) (correctionPreview, []correctionJournalEntry, error) {
	p := correctionPreview{Options: o, Items: []correctionChange{}}
	in, err := h.loadCorrectionInputs(o, lock)
	if err != nil {
		return p, nil, err
	}
	p.Hash = correctionHash(struct {
		Options correctionOptions
		Inputs  correctionInputs
	}{o, in})
	settings := map[string]string{}
	for _, s := range in.Settings {
		settings[s.Key] = s.Value
	}
	rotationSettings(settings)
	if o.NormalTime != "" {
		settings["jam_masuk_normal"] = o.NormalTime
	}
	calendar := workdayCalendar{settings: settings, holidays: map[string]models.Holiday{}, optional: map[string]struct{}{}, overrides: map[string]models.WeekendOverride{}}
	for _, v := range in.Holidays {
		calendar.holidays[v.Tanggal.Format("2006-01-02")] = v
	}
	for _, v := range in.Optional {
		calendar.optional[v.Tanggal.Format("2006-01-02")] = struct{}{}
	}
	for _, v := range in.Overrides {
		calendar.overrides[workdayOverrideKey(v.UserID, v.Tanggal)] = v
	}
	users := map[uint]models.User{}
	for _, v := range in.Users {
		users[v.ID] = v
	}
	schedules := map[string]*models.JadwalPiket{}
	for i := range in.Schedules {
		v := &in.Schedules[i]
		key := fmt.Sprintf("%d:%s", v.UserID, v.Hari)
		if schedules[key] == nil {
			schedules[key] = v
		}
	}
	journal := []correctionJournalEntry{}
	for _, row := range in.Rows {
		if !isPresentRevisionStatus(row.Status) {
			continue
		} // Never manufacture attendance or change leave/sick/Alfa.
		user, ok := users[row.UserID]
		if !ok {
			p.SkippedNoUser++
			continue
		}
		pokjar := isPokjarTeacher(user)
		if o.Scope == "pusat" && pokjar || o.Scope == "pokjar" && !pokjar {
			continue
		}
		p.Processed++
		date, _ := parseDate(row.Tanggal.Format("2006-01-02"), appLocation(h))
		category := "pusat"
		target, label, newStatus, generated := "", "Pokjar · hadir berdasarkan tanggal", "hadir", ""
		checkIn := row.JamMasuk
		if strings.TrimSpace(stringPointerValue(checkIn)) == "" {
			checkIn = row.JamHadir
		}
		if pokjar {
			category = "pokjar"
		} else {
			workday, optional := calendar.isWorkday(user, date)
			if !workday && !optional {
				p.SkippedNonWorkday++
				continue
			}
			// Preserve manually approved on-time attendance: this repair only
			// reassesses existing lateness, never adds a new penalty.
			if row.Status == "hadir" {
				continue
			}
			minutes, valid := timeToMinutes(stringPointerValue(checkIn))
			if !valid {
				p.SkippedNoTime++
				continue
			}
			holiday := calendar.holidays[date.Format("2006-01-02")]
			target, label, _ = targetForLoadedRules(user, date, settings, &holiday, schedules[fmt.Sprintf("%d:%s", user.ID, dayName(date.Weekday()))])
			at := time.Date(date.Year(), date.Month(), date.Day(), minutes/60, minutes%60, 0, 0, date.Location())
			newStatus, generated = classifyCheckIn(user, at, target, label, settings["toleransi_terlambat"], "")
			if newStatus == "hadir_terlambat" && row.Status == "hadir_izin_terlambat" {
				newStatus = row.Status
			}
		}
		oldNote := stringPointerValue(row.Keterangan)
		noteStatus := newStatus
		if noteStatus == "hadir_izin_terlambat" {
			noteStatus = "hadir_terlambat"
		}
		newNote := recalculatedCheckInNote(oldNote, generated, noteStatus)
		change := correctionChange{todayCheckInRecalculationItem: todayCheckInRecalculationItem{
			ID: row.ID, UserID: row.UserID, Nama: user.Nama, JamMasuk: stringPointerValue(checkIn), OldStatus: row.Status, NewStatus: newStatus,
			OldKeterangan: oldNote, NewKeterangan: newNote, OldLateMinutes: lateMinutesFromNote(oldNote), NewLateMinutes: lateMinutesFromNote(newNote), Target: target, TargetLabel: strings.TrimSpace(label),
			StatusChanged: row.Status != newStatus, NoteChanged: oldNote != newNote,
		}, Date: date.Format("2006-01-02"), Category: category, Pokjar: strings.TrimSpace(stringPointerValue(user.Pokjar))}
		change.Changed = change.StatusChanged || change.NoteChanged
		if !change.Changed {
			continue
		}
		p.Items = append(p.Items, change)
		p.Changed++
		if pokjar {
			p.PokjarChanged++
		} else {
			p.PusatChanged++
		}
		journal = append(journal, correctionJournalEntry{Before: row, Change: change})
	}
	return p, journal, nil
}

func correctionError(c *fiber.Ctx, err error) error {
	if errors.Is(err, errCorrectionStale) || errors.Is(err, errCorrectionAlreadyUndone) || errors.Is(err, errCorrectionNoChanges) {
		return httpx.Error(c, fiber.StatusConflict, "CORRECTION_CONFLICT", err.Error())
	}
	return err
}

func (h *Handler) bulkCorrectionPreview(c *fiber.Ctx) error {
	o, _, err := parseCorrectionOptions(c, appLocation(h))
	if err != nil {
		return invalid(c, err.Error())
	}
	p, _, err := h.correctionPreviewFor(o, false)
	if err != nil {
		return err
	}
	return httpx.Success(c, "Pratinjau perbaikan bulk berhasil dimuat", p)
}

func (h *Handler) bulkCorrectionApply(c *fiber.Ctx) error {
	o, hash, err := parseCorrectionOptions(c, appLocation(h))
	if err != nil {
		return invalid(c, err.Error())
	}
	if len(hash) != 64 {
		return invalid(c, "buat pratinjau sebelum menjalankan perbaikan")
	}
	claims, _ := userClaims(c)
	var batch models.AttendanceCorrection
	err = h.db.Transaction(func(tx *gorm.DB) error {
		worker := *h
		worker.db = tx
		p, journal, err := worker.correctionPreviewFor(o, true)
		if err != nil {
			return err
		}
		if p.Hash != hash {
			return errCorrectionStale
		}
		if len(journal) == 0 {
			return errCorrectionNoChanges
		}
		for i := range journal {
			entry := &journal[i]
			result := tx.Model(&models.AttendanceLog{}).Where("id = ? AND status = ?", entry.Before.ID, entry.Before.Status).
				Updates(map[string]any{"status": entry.Change.NewStatus, "keterangan": pointerString(entry.Change.NewKeterangan)})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return errCorrectionStale
			}
			var saved models.AttendanceLog
			if err := tx.First(&saved, entry.Before.ID).Error; err != nil {
				return err
			}
			entry.AfterHash = attendanceCorrectionHash(saved)
		}
		snapshot, err := json.Marshal(journal)
		if err != nil {
			return err
		}
		batch = models.AttendanceCorrection{ID: uuid.NewString(), CreatedBy: claims.UserID, Reason: o.Reason, StartDate: o.StartDate, EndDate: o.EndDate, Scope: o.Scope, NormalTime: o.NormalTime, Changed: p.Changed, Snapshot: string(snapshot)}
		return tx.Create(&batch).Error // Failure to save the journal rolls back every attendance update.
	})
	if err != nil {
		return correctionError(c, err)
	}
	return httpx.Success(c, "Perbaikan bulk tersimpan beserta salinan sebelum perubahan", batch)
}

func (h *Handler) bulkCorrectionHistory(c *fiber.Ctx) error {
	var rows []models.AttendanceCorrection
	if err := h.db.Omit("snapshot").Order("created_at DESC, id DESC").Limit(50).Find(&rows).Error; err != nil {
		return err
	}
	return httpx.Success(c, "Riwayat perbaikan bulk", rows)
}

func (h *Handler) bulkCorrectionDetails(c *fiber.Ctx) error {
	var batch models.AttendanceCorrection
	if err := h.db.First(&batch, "id = ?", c.Params("id")).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return fiber.ErrNotFound
		}
		return err
	}
	var journal []correctionJournalEntry
	if err := json.Unmarshal([]byte(batch.Snapshot), &journal); err != nil {
		return err
	}
	changes := make([]correctionChange, 0, len(journal))
	for _, entry := range journal {
		changes = append(changes, entry.Change)
	}
	return httpx.Success(c, "Rincian perbaikan bulk", fiber.Map{"batch": batch, "items": changes})
}

func (h *Handler) bulkCorrectionUndo(c *fiber.Ctx) error {
	claims, _ := userClaims(c)
	err := h.db.Transaction(func(tx *gorm.DB) error {
		var batch models.AttendanceCorrection
		if err := correctionQuery(tx, true).First(&batch, "id = ?", c.Params("id")).Error; err != nil {
			return err
		}
		if batch.UndoneAt != nil {
			return errCorrectionAlreadyUndone
		}
		var journal []correctionJournalEntry
		if err := json.Unmarshal([]byte(batch.Snapshot), &journal); err != nil {
			return err
		}
		// Lock/check every record before restoring any record. A later manual
		// correction or checkout must not be overwritten by an old undo request.
		for _, entry := range journal {
			var current models.AttendanceLog
			if err := correctionQuery(tx, true).First(&current, entry.Before.ID).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return errCorrectionStale
				}
				return err
			}
			if attendanceCorrectionHash(current) != entry.AfterHash {
				return errCorrectionStale
			}
		}
		for _, entry := range journal {
			if err := tx.Model(&models.AttendanceLog{}).Where("id = ?", entry.Before.ID).Updates(map[string]any{"status": entry.Before.Status, "keterangan": entry.Before.Keterangan}).Error; err != nil {
				return err
			}
		}
		now := time.Now().In(appLocation(h))
		return tx.Model(&batch).Updates(map[string]any{"undone_at": now, "undone_by": claims.UserID}).Error
	})
	if err != nil {
		return correctionError(c, err)
	}
	return httpx.Success(c, "Koreksi bulk dibatalkan; status dan catatan sebelumnya dipulihkan", nil)
}
