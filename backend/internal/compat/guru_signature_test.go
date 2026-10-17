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

func TestGuruSignatureDirectoryAndDetail(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.User{}); err != nil {
		t.Fatal(err)
	}
	empty, whitespace, image := "", " \n\t", "data:image/png;base64,c2lnbmF0dXJl"
	users := []models.User{
		{ID: 1, Username: "admin", Nama: "Admin", Role: "admin"},
		{ID: 2, Username: "kepsek", Nama: "Kepala Sekolah", Role: "kepala_sekolah"},
		{ID: 3, Username: "signed", Nama: "Sudah", Role: "guru", TandaTangan: &image},
		{ID: 4, Username: "missing", Nama: "Belum", Role: "guru"},
		{ID: 5, Username: "empty", Nama: "Kosong", Role: "guru", TandaTangan: &empty},
		{ID: 6, Username: "whitespace", Nama: "Spasi", Role: "guru", TandaTangan: &whitespace},
	}
	if err := db.Create(&users).Error; err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{JWTSecret: "signature-test-secret-longer-than-32-characters", JWTIssuer: "test", JWTAudience: "web", JWTAccessTTL: time.Minute}
	manager := auth.NewJWTManager(cfg)
	app := fiber.New()
	NewHandler(db, cfg, manager).RegisterCoreRoutes(app)

	for _, actor := range users[:3] {
		token, _, err := manager.IssueAccess(actor)
		if err != nil {
			t.Fatal(err)
		}
		for _, endpoint := range []string{"/api/v1/users", "/api/v1/users?id=3", "/api/guru.php", "/api/guru.php?id=3"} {
			t.Run(actor.Role+endpoint, func(t *testing.T) {
				request := httptest.NewRequest("GET", endpoint, nil)
				request.Header.Set(fiber.HeaderAuthorization, "Bearer "+token)
				response, err := app.Test(request)
				if err != nil {
					t.Fatal(err)
				}
				defer response.Body.Close()
				if actor.Role == "guru" {
					if response.StatusCode != fiber.StatusForbidden {
						t.Fatalf("guru status = %d, want 403", response.StatusCode)
					}
					return
				}
				if response.StatusCode != fiber.StatusOK {
					t.Fatalf("status = %d, want 200", response.StatusCode)
				}
				var payload struct {
					Data json.RawMessage `json:"data"`
				}
				if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
					t.Fatal(err)
				}
				if strings.Contains(endpoint, "?id=") {
					var teacher map[string]any
					if err := json.Unmarshal(payload.Data, &teacher); err != nil {
						t.Fatal(err)
					}
					if teacher["punyaTandaTangan"] != true || teacher["tandaTangan"] != image || teacher["tanda_tangan"] != image {
						t.Fatal("detail must return the saved image and status")
					}
					return
				}
				var teachers []map[string]any
				if err := json.Unmarshal(payload.Data, &teachers); err != nil {
					t.Fatal(err)
				}
				if len(teachers) != 4 {
					t.Fatalf("teacher count = %d, want 4", len(teachers))
				}
				for _, teacher := range teachers {
					if teacher["punyaTandaTangan"] != (teacher["username"] == "signed") {
						t.Fatal("incorrect saved signature status")
					}
					for _, field := range []string{"tandaTangan", "tanda_tangan", "password"} {
						if _, exists := teacher[field]; exists {
							t.Fatalf("list includes %s", field)
						}
					}
				}
			})
		}
	}
}
