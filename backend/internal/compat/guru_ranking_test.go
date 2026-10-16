package compat

import (
	"encoding/json"
	"fmt"
	"net/http"
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

type guruRankingTestItem struct {
	Rank        int     `json:"rank"`
	ID          uint    `json:"id"`
	Nama        string  `json:"nama"`
	Skor        float64 `json:"skor"`
	BonusLembur float64 `json:"bonusLembur"`
}

type guruRankingTestResponse struct {
	Success bool `json:"success"`
	Data    struct {
		Period struct {
			Label     string `json:"label"`
			StartDate string `json:"startDate"`
			EndDate   string `json:"endDate"`
		} `json:"period"`
		Items  []guruRankingTestItem `json:"items"`
		MyRank *guruRankingTestItem  `json:"myRank"`
	} `json:"data"`
}

func TestGuruRankingReturnsCurrentMonthTopTenAndMyRank(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.AttendanceLog{}, &models.Setting{}, &models.Holiday{}, &models.OptionalWorkday{}, &models.WeekendOverride{}, &models.JadwalPiket{}); err != nil {
		t.Fatal(err)
	}

	loc, _ := time.LoadLocation("Asia/Jakarta")
	today := dateOnly(time.Now().In(loc))
	monthStart := time.Date(today.Year(), today.Month(), 1, 0, 0, 0, 0, loc)
	admin := models.User{Username: "ranking-admin", Role: "admin", Nama: "Admin Ranking", TipeGuru: "full_time"}
	if err := db.Create(&admin).Error; err != nil {
		t.Fatal(err)
	}

	users := make([]models.User, 0, 12)
	for index := 1; index <= 12; index++ {
		user := models.User{
			Username: fmt.Sprintf("ranking-guru-%02d", index),
			Role:     "guru",
			Nama:     fmt.Sprintf("Guru %02d", index),
			TipeGuru: "full_time",
		}
		if err := db.Create(&user).Error; err != nil {
			t.Fatal(err)
		}
		users = append(users, user)
	}

	clock := func(value string) *string { return &value }
	for _, user := range users[:11] {
		if err := db.Create(&models.AttendanceLog{
			UserID: user.ID, Nama: user.Nama, Tanggal: today, Status: "hadir", JamMasuk: clock("07:20"), JamPulang: clock("15:00"),
		}).Error; err != nil {
			t.Fatal(err)
		}
	}
	// A perfect record in the previous month must not affect this month's rank.
	if err := db.Create(&models.AttendanceLog{
		UserID: users[11].ID, Nama: users[11].Nama, Tanggal: monthStart.AddDate(0, 0, -1), Status: "hadir", JamMasuk: clock("07:00"), JamPulang: clock("13:00"),
	}).Error; err != nil {
		t.Fatal(err)
	}
	// The current-month record contributes a fractional 90-minute overtime
	// bonus. The otherwise perfect previous-month record must stay excluded.
	if err := db.Create(&models.AttendanceLog{
		UserID: users[11].ID, Nama: users[11].Nama, Tanggal: today, Status: "hadir", JamMasuk: clock("07:00"), JamPulang: clock("14:30"),
	}).Error; err != nil {
		t.Fatal(err)
	}

	cfg := config.Config{AppTimezone: "Asia/Jakarta", JWTSecret: "guru-ranking-test-secret-that-is-long-enough", JWTIssuer: "test", JWTAudience: "web", JWTAccessTTL: time.Hour}
	manager := auth.NewJWTManager(cfg)
	app := fiber.New()
	h := NewHandler(db, cfg, manager)
	h.RegisterCoreRoutes(app)
	h.RegisterAttendanceRoutes(app)

	token, _, err := manager.IssueAccess(users[11])
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/guru/ranking", nil)
	request.Header.Set(fiber.HeaderAuthorization, "Bearer "+token)
	response, err := app.Test(request)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", response.StatusCode)
	}
	var payload guruRankingTestResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if !payload.Success {
		t.Fatal("ranking response was not successful")
	}
	if payload.Data.Period.Label != "Bulan Ini" || payload.Data.Period.StartDate != monthStart.Format("2006-01-02") || payload.Data.Period.EndDate != today.Format("2006-01-02") {
		t.Fatalf("period = %+v, want current month through today", payload.Data.Period)
	}
	if len(payload.Data.Items) != guruRankingLimit {
		t.Fatalf("items = %d, want %d", len(payload.Data.Items), guruRankingLimit)
	}
	for index, item := range payload.Data.Items {
		if item.Rank != index+1 || item.ID != users[index].ID {
			t.Fatalf("item %d = %+v, want rank %d for %s", index, item, index+1, users[index].Nama)
		}
		if item.BonusLembur != 2 {
			t.Fatalf("top-10 item %d bonusLembur = %v, want 2", index, item.BonusLembur)
		}
	}
	if payload.Data.MyRank == nil || payload.Data.MyRank.ID != users[11].ID || payload.Data.MyRank.Rank != 12 || payload.Data.MyRank.BonusLembur != 1.5 {
		t.Fatalf("myRank = %+v, want rank 12 with 1.5 overtime bonus", payload.Data.MyRank)
	}

	adminToken, _, err := manager.IssueAccess(admin)
	if err != nil {
		t.Fatal(err)
	}
	adminRequest := httptest.NewRequest(http.MethodGet, "/api/v1/guru/ranking", nil)
	adminRequest.Header.Set(fiber.HeaderAuthorization, "Bearer "+adminToken)
	adminResponse, err := app.Test(adminRequest)
	if err != nil {
		t.Fatal(err)
	}
	if adminResponse.StatusCode != fiber.StatusForbidden {
		t.Fatalf("admin status = %d, want 403", adminResponse.StatusCode)
	}
}

func TestGuruRankingItemCalculatesWholeAndFractionalOvertimeBonus(t *testing.T) {
	tests := []struct {
		name        string
		lemburMenit int
		wantBonus   float64
	}{
		{name: "one full hour", lemburMenit: 60, wantBonus: 1},
		{name: "ninety minutes", lemburMenit: 90, wantBonus: 1.5},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			item := guruRankingItem(analyticsTeacher{LemburMenit: test.lemburMenit}, 1)
			if bonus, ok := item["bonusLembur"].(float64); !ok || bonus != test.wantBonus {
				t.Fatalf("bonusLembur = %v, want %v", item["bonusLembur"], test.wantBonus)
			}
		})
	}
}
