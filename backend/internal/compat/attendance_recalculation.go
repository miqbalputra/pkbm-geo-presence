package compat

import (
	"errors"
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/httpx"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
)

var errTodayCheckInRecalculationStale = errors.New("catatan presensi berubah saat perbaikan diproses")

var generatedLateNotePattern = regexp.MustCompile(`(?i)Terlambat\s+(\d+)\s+menit(?:\s+\(Parah\))?(?:\s+\((?:Piket(?:\s+Apel)?|Apel\s+Senin|Event:\s*[^)]*)\))?`)

// todayCheckInRecalculation lets an administrator correct one selected day's
// stored arrival statuses after updating the normal check-in time. The chosen
// date must not be in the future, so the action remains bounded to one known
// attendance day.
func (h *Handler) todayCheckInRecalculation(c *fiber.Ctx) error {
	if c.Method() != fiber.MethodGet && c.Method() != fiber.MethodPost {
		return fiber.ErrMethodNotAllowed
	}
	claims, err := userClaims(c)
	if err != nil {
		return err
	}
	if claims.Role != "admin" {
		return fiber.ErrForbidden
	}

	location := appLocation(h)
	date, err := checkInRecalculationDate(c, location)
	if err != nil {
		return invalid(c, err.Error())
	}
	settings, err := settingsMap(h.db)
	if err != nil {
		return err
	}
	preview, err := h.todayCheckInRecalculationPreview(date, settings)
	if err != nil {
		return err
	}

	if c.Method() == fiber.MethodPost && preview.Changed > 0 {
		if err := h.db.Transaction(func(tx *gorm.DB) error {
			for _, item := range preview.Items {
				if !item.Changed {
					continue
				}
				result := tx.Model(&models.AttendanceLog{}).
					Where("id = ?", item.ID).
					Where("status = ?", item.OldStatus).
					Where("COALESCE(keterangan, '') = ?", item.OldKeterangan).
					Updates(map[string]any{"status": item.NewStatus, "keterangan": pointerString(item.NewKeterangan)})
				if result.Error != nil {
					return result.Error
				}
				if result.RowsAffected != 1 {
					return errTodayCheckInRecalculationStale
				}
			}
			return nil
		}); err != nil {
			if errors.Is(err, errTodayCheckInRecalculationStale) {
				return httpx.Error(c, fiber.StatusConflict, "ATTENDANCE_CHANGED", "Data presensi berubah saat diproses. Perbarui pratinjau lalu coba lagi.")
			}
			return err
		}

		var actor models.User
		if err := h.db.Select("nama").First(&actor, claims.UserID).Error; err == nil {
			if err := h.db.Create(&models.ActivityLog{
				Waktu:     time.Now().In(location),
				User:      actor.Nama,
				Aktivitas: "Hitung ulang status masuk",
				Status:    preview.Date + " · " + strconv.Itoa(preview.Changed) + " presensi disesuaikan",
			}).Error; err != nil {
				// An unavailable legacy audit table must not roll back the actual fix.
				log.Printf("today check-in recalculation audit log failed: %v", err)
			}
		}
	}

	message := "Pratinjau status masuk berhasil dimuat"
	if c.Method() == fiber.MethodPost {
		message = "Status masuk berhasil disesuaikan"
	}
	return httpx.Success(c, message, preview)
}

func checkInRecalculationDate(c *fiber.Ctx, location *time.Location) (time.Time, error) {
	value := time.Now().In(location).Format("2006-01-02")
	if c.Method() == fiber.MethodGet {
		value = c.Query("date", value)
	} else if strings.TrimSpace(string(c.Body())) != "" {
		body, err := readJSON(c)
		if err != nil {
			return time.Time{}, err
		}
		if requested := stringValue(body, "date", "tanggal"); requested != "" {
			value = requested
		}
	}
	date, err := parseDate(value, location)
	if err != nil {
		return time.Time{}, errors.New("format tanggal tidak valid")
	}
	if date.After(dateOnly(time.Now().In(location))) {
		return time.Time{}, errors.New("tanggal perbaikan tidak boleh melewati hari ini")
	}
	return dateOnly(date), nil
}

type todayCheckInRecalculationResponse struct {
	Date             string                          `json:"date"`
	NormalTarget     string                          `json:"normal_target"`
	ToleranceMinutes string                          `json:"tolerance_minutes"`
	Processed        int                             `json:"processed"`
	Changed          int                             `json:"changed"`
	Unchanged        int                             `json:"unchanged"`
	SkippedNoTime    int                             `json:"skipped_no_time"`
	SkippedNoUser    int                             `json:"skipped_no_user"`
	Items            []todayCheckInRecalculationItem `json:"items"`
}

type todayCheckInRecalculationItem struct {
	ID             uint   `json:"id"`
	UserID         uint   `json:"user_id"`
	Nama           string `json:"nama"`
	JamMasuk       string `json:"jam_masuk"`
	OldStatus      string `json:"old_status"`
	NewStatus      string `json:"new_status"`
	OldKeterangan  string `json:"old_keterangan"`
	NewKeterangan  string `json:"new_keterangan"`
	OldLateMinutes *int   `json:"old_late_minutes,omitempty"`
	NewLateMinutes *int   `json:"new_late_minutes,omitempty"`
	Target         string `json:"target"`
	TargetLabel    string `json:"target_label"`
	StatusChanged  bool   `json:"status_changed"`
	NoteChanged    bool   `json:"note_changed"`
	Changed        bool   `json:"changed"`
}

func (h *Handler) todayCheckInRecalculationPreview(date time.Time, settings map[string]string) (todayCheckInRecalculationResponse, error) {
	response := todayCheckInRecalculationResponse{
		Date:             date.Format("2006-01-02"),
		NormalTarget:     settingTime(settings["jam_masuk_normal"], "07:20"),
		ToleranceMinutes: strings.TrimSpace(settings["toleransi_terlambat"]),
		Items:            []todayCheckInRecalculationItem{},
	}
	if response.ToleranceMinutes == "" {
		response.ToleranceMinutes = "15"
	}

	var rows []models.AttendanceLog
	if err := h.db.
		Where("tanggal >= ? AND tanggal < ?", date, date.AddDate(0, 0, 1)).
		Where("status IN ?", []string{"hadir", "hadir_terlambat", "hadir_izin_terlambat"}).
		Order("id ASC").
		Find(&rows).Error; err != nil {
		return response, err
	}
	response.Processed = len(rows)
	if len(rows) == 0 {
		return response, nil
	}

	userIDs := make([]uint, 0, len(rows))
	seenUsers := make(map[uint]struct{}, len(rows))
	for _, row := range rows {
		if _, seen := seenUsers[row.UserID]; !seen {
			seenUsers[row.UserID] = struct{}{}
			userIDs = append(userIDs, row.UserID)
		}
	}
	var users []models.User
	if err := h.db.Select("id, nama, tipe_guru").Where("id IN ? AND role = ?", userIDs, "guru").Find(&users).Error; err != nil {
		return response, err
	}
	usersByID := make(map[uint]models.User, len(users))
	for _, user := range users {
		usersByID[user.ID] = user
	}

	for _, row := range rows {
		user, found := usersByID[row.UserID]
		if !found {
			response.SkippedNoUser++
			continue
		}
		checkIn := row.JamMasuk
		if checkIn == nil || strings.TrimSpace(*checkIn) == "" {
			checkIn = row.JamHadir
		}
		if checkIn == nil || strings.TrimSpace(*checkIn) == "" {
			response.SkippedNoTime++
			continue
		}
		minutes, valid := timeToMinutes(*checkIn)
		if !valid {
			response.SkippedNoTime++
			continue
		}
		target, targetLabel, err := h.checkInTarget(user.ID, date, settings)
		if err != nil {
			return response, err
		}
		checkedInAt := time.Date(date.Year(), date.Month(), date.Day(), minutes/60, minutes%60, 0, 0, date.Location())
		newStatus, generatedLateNote := classifyCheckIn(user, checkedInAt, target, targetLabel, response.ToleranceMinutes, "")
		oldNote := ""
		if row.Keterangan != nil {
			oldNote = *row.Keterangan
		}
		newNote := recalculatedCheckInNote(oldNote, generatedLateNote, newStatus)
		item := todayCheckInRecalculationItem{
			ID:             row.ID,
			UserID:         row.UserID,
			Nama:           row.Nama,
			JamMasuk:       normalizeTime(*checkIn),
			OldStatus:      row.Status,
			NewStatus:      newStatus,
			OldKeterangan:  oldNote,
			NewKeterangan:  newNote,
			OldLateMinutes: lateMinutesFromNote(oldNote),
			NewLateMinutes: lateMinutesFromNote(newNote),
			Target:         target,
			TargetLabel:    strings.TrimSpace(targetLabel),
			StatusChanged:  row.Status != newStatus,
			NoteChanged:    oldNote != newNote,
		}
		item.Changed = item.StatusChanged || item.NoteChanged
		if item.Nama == "" {
			item.Nama = user.Nama
		}
		if item.Changed {
			response.Changed++
		} else {
			response.Unchanged++
		}
		response.Items = append(response.Items, item)
	}

	return response, nil
}

// recalculatedCheckInNote replaces only the automatic lateness sentence. Any
// note added manually by an administrator stays in place, including when a
// record becomes on-time and its automatic delay sentence is removed.
func recalculatedCheckInNote(current, generated, status string) string {
	match := generatedLateNotePattern.FindStringIndex(current)
	if status != "hadir_terlambat" {
		if match == nil {
			return current
		}
		return joinAttendanceNoteFragments(current[:match[0]], current[match[1]:])
	}
	if match == nil {
		if strings.TrimSpace(current) == "" {
			return generated
		}
		return joinAttendanceNoteFragments(current, generated)
	}
	return joinAttendanceNoteFragments(current[:match[0]], generated, current[match[1]:])
}

func joinAttendanceNoteFragments(parts ...string) string {
	clean := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.Trim(strings.TrimSpace(part), "| ")
		if part != "" {
			clean = append(clean, part)
		}
	}
	return strings.Join(clean, " | ")
}

func lateMinutesFromNote(note string) *int {
	match := generatedLateNotePattern.FindStringSubmatch(note)
	if len(match) < 2 {
		return nil
	}
	minutes, err := strconv.Atoi(match[1])
	if err != nil {
		return nil
	}
	return &minutes
}
