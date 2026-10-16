package compat

import (
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/httpx"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
)

type rotationTeacher struct {
	UserID         uint    `json:"user_id"`
	Nama           string  `json:"nama"`
	Username       string  `json:"username,omitempty"`
	PiketGroup     *string `json:"piket_group"`
	Pokjar         *string `json:"pokjar,omitempty"`
	JenisKelamin   *string `json:"jenis_kelamin,omitempty"`
	JamPiket       string  `json:"jam_piket,omitempty"`
	JamPulangPiket string  `json:"jam_pulang_piket,omitempty"`
}

func rotationSettings(settings map[string]string) map[string]string {
	defaults := map[string]string{
		"piket_rotation_enabled": "1", "piket_group_a_weeks": "1,3", "piket_group_b_weeks": "2,4",
		"piket_week5_mode": "all", "piket_jam_masuk": "07:00", "piket_jam_pulang": "13:00",
	}
	for key, value := range defaults {
		if strings.TrimSpace(settings[key]) == "" {
			settings[key] = value
		}
	}
	return settings
}

func (h *Handler) rotationOverview(c *fiber.Ctx) error {
	claims, err := userClaims(c)
	if err != nil {
		return err
	}
	settings, err := settingsMap(h.db)
	if err != nil {
		return err
	}
	settings = rotationSettings(settings)
	now := time.Now().In(appLocation(h))
	week := weekOfMonth(now)
	groups := []string{}
	if settings["piket_rotation_enabled"] == "1" {
		for _, group := range []string{"A", "B"} {
			if groupWorksOnWeek(settings, group, week) {
				groups = append(groups, group)
			}
		}
	}
	var users []models.User
	if err := h.db.Where("role = ? AND archived_at IS NULL", "guru").Order("nama ASC").Find(&users).Error; err != nil {
		return err
	}
	teachers := make([]rotationTeacher, 0, len(users))
	assigned := make([]rotationTeacher, 0, len(users))
	for _, user := range users {
		item := rotationTeacher{UserID: user.ID, Nama: user.Nama, Username: user.Username, PiketGroup: user.PiketGroup, Pokjar: user.Pokjar, JenisKelamin: user.JenisKelamin}
		teachers = append(teachers, item)
		if settings["piket_rotation_enabled"] == "1" && isRotationTeacherOnWeek(settings, user, week) {
			item.JamPiket = settings["piket_jam_masuk"]
			item.JamPulangPiket = settings["piket_jam_pulang"]
			assigned = append(assigned, item)
		}
	}
	if c.Query("today") == "1" {
		var mine any
		for _, row := range assigned {
			if row.UserID == claims.UserID {
				mine = row
				break
			}
		}
		return httpx.Success(c, "Piket hari ini berhasil diambil", fiber.Map{
			"hari": dayName(now.Weekday()), "tanggal": now.Format("2006-01-02"), "week_of_month": week,
			"jadwal": assigned, "mine": mine, "isPiketToday": mine != nil,
		})
	}
	return httpx.Success(c, "Konfigurasi rotasi piket berhasil diambil", fiber.Map{
		"config": fiber.Map{
			"piket_rotation_enabled": settings["piket_rotation_enabled"], "piket_group_a_weeks": settings["piket_group_a_weeks"],
			"piket_group_b_weeks": settings["piket_group_b_weeks"], "piket_week5_mode": settings["piket_week5_mode"],
			"piket_jam_masuk": settings["piket_jam_masuk"], "piket_jam_pulang": settings["piket_jam_pulang"],
		},
		"today": fiber.Map{"tanggal": now.Format("2006-01-02"), "day_name": dayName(now.Weekday()), "week_of_month": week, "groups_piket": groups},
		"guru":  teachers, "piket_today": assigned,
	})
}

func weekOfMonth(date time.Time) int { return (date.Day()-1)/7 + 1 }

func groupWorksOnWeek(settings map[string]string, group string, week int) bool {
	if group != "A" && group != "B" {
		return false
	}
	if week >= 5 {
		switch settings["piket_week5_mode"] {
		case "none":
			return false
		case "A":
			return group == "A"
		case "B":
			return group == "B"
		default:
			return true
		}
	}
	weeks := "1,3"
	if group == "B" {
		weeks = "2,4"
	}
	if strings.TrimSpace(settings["piket_group_"+strings.ToLower(group)+"_weeks"]) != "" {
		weeks = settings["piket_group_"+strings.ToLower(group)+"_weeks"]
	}
	for _, value := range strings.Split(weeks, ",") {
		parsed, err := strconv.Atoi(strings.TrimSpace(value))
		if err == nil && parsed == week {
			return true
		}
	}
	return false
}

func isRotationTeacherOnDate(settings map[string]string, user models.User, date time.Time) bool {
	if date.Weekday() != time.Saturday || user.Pokjar != nil && strings.TrimSpace(*user.Pokjar) != "" {
		return false
	}
	return isRotationTeacherOnWeek(settings, user, weekOfMonth(date))
}

func isRotationTeacherOnWeek(settings map[string]string, user models.User, week int) bool {
	if user.Pokjar != nil && strings.TrimSpace(*user.Pokjar) != "" {
		return false
	}
	return user.PiketGroup != nil && groupWorksOnWeek(settings, *user.PiketGroup, week)
}

// rotationPiket returns the PKBM Saturday rotation duty. The boolean reports
// whether group rotation governs that date, including dates when this teacher
// is not assigned, so the legacy weekday schedule cannot override the groups.
func (h *Handler) rotationPiket(userID uint, date time.Time, settings map[string]string) (bool, bool, error) {
	if date.Weekday() != time.Saturday || settings["piket_rotation_enabled"] == "0" {
		return false, false, nil
	}
	var user models.User
	if err := h.db.Select("id, piket_group, pokjar").First(&user, userID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return true, false, nil
		}
		return false, false, err
	}
	return true, isRotationTeacherOnDate(settings, user, date), nil
}
