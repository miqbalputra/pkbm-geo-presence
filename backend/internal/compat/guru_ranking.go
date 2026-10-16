package compat

import (
	"sort"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/httpx"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
)

const guruRankingLimit = 10

// guruRankingItem is the public, compact representation used by the guru
// dashboard. The score fields intentionally mirror the existing admin
// leaderboard so both views explain the same ranking.
func guruRankingItem(teacher analyticsTeacher, rank int) map[string]any {
	return map[string]any{
		"rank":                 rank,
		"id":                   teacher.ID,
		"nama":                 teacher.Nama,
		"jabatan":              teacher.Jabatan,
		"skor":                 teacher.Skor,
		"persentaseKehadiran":  teacher.PersentaseKehadiran,
		"persentaseTepatWaktu": teacher.PersentaseTepatWaktu,
		"persentasePulang":     teacher.PersentasePulang,
		"hadir":                teacher.Hadir,
		"tepatWaktu":           teacher.TepatWaktu,
		"terlambat":            teacher.Terlambat,
		"checkoutLengkap":      teacher.CheckoutLengkap,
		"lupaCheckout":         teacher.LupaCheckout,
		"lemburMenit":          teacher.LemburMenit,
		"bonusLembur":          float64(teacher.LemburMenit) / 60,
		"totalHariKerja":       teacher.TotalHariKerja,
	}
}

func (h *Handler) guruRanking(c *fiber.Ctx) error {
	claims, err := userClaims(c)
	if err != nil {
		return err
	}

	now := dateOnly(time.Now().In(appLocation(h)))
	start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	var users []models.User
	if err := h.db.Where("role = ? AND archived_at IS NULL", "guru").Order("nama ASC").Find(&users).Error; err != nil {
		return err
	}

	period, err := h.analyticsPeriod(users, start, now, now)
	if err != nil {
		return err
	}

	// analyticsPeriod already applies the canonical score and deterministic
	// score/name ordering. Re-sort defensively here so the API contract remains
	// stable if the report implementation changes later.
	sort.SliceStable(period.Teachers, func(i, j int) bool {
		if period.Teachers[i].Skor == period.Teachers[j].Skor {
			return period.Teachers[i].Nama < period.Teachers[j].Nama
		}
		return period.Teachers[i].Skor > period.Teachers[j].Skor
	})

	items := make([]map[string]any, 0, minInt(guruRankingLimit, len(period.Teachers)))
	var myRank map[string]any
	for index, teacher := range period.Teachers {
		item := guruRankingItem(teacher, index+1)
		if teacher.ID == claims.UserID {
			myRank = item
		}
		if index < guruRankingLimit {
			items = append(items, item)
		}
	}

	return httpx.Success(c, "Peringkat guru bulan ini berhasil diambil", fiber.Map{
		"period": fiber.Map{
			"label":     "Bulan Ini",
			"startDate": start.Format("2006-01-02"),
			"endDate":   now.Format("2006-01-02"),
		},
		"items":  items,
		"myRank": myRank,
	})
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
