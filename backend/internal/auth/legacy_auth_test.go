package auth

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/gofiber/fiber/v2"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/config"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
	"gorm.io/gorm"
)

const legacyAuthTestTimeout = 5_000

func TestLegacyPWALoginUsesCompatibleResponseAndCookie(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:legacy-auth-test?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.RefreshToken{}, &models.SecurityEvent{}); err != nil {
		t.Fatalf("migrate models: %v", err)
	}
	password, err := HashPassword("password-test")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	if err := db.Create(&models.User{ID: 91, Username: "guru-pwa", Password: password, Role: "guru", Nama: "Guru PWA", TipeGuru: "full_time"}).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	cfg := config.Config{
		JWTSecret:     "test-secret-that-is-long-enough-for-the-test",
		JWTIssuer:     "test",
		JWTAudience:   "web",
		JWTAccessTTL:  time.Minute,
		JWTRefreshTTL: time.Hour,
		CookieSecure:  false,
	}
	handler := NewHandler(db, cfg, NewJWTManager(cfg))
	app := fiber.New()
	handler.RegisterLegacyRoutes(app)
	app.Get("/protected", RequireActiveUser(db, handler.jwt), func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	body := bytes.NewBufferString(`{"username":"guru-pwa","password":"password-test"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/auth.php?action=login", body)
	request.Header.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
	response, err := app.Test(request, legacyAuthTestTimeout)
	if err != nil {
		t.Fatalf("legacy login request: %v", err)
	}
	if response.StatusCode != http.StatusOK {
		t.Fatalf("legacy login status = %d, want 200", response.StatusCode)
	}

	var payload struct {
		Success bool           `json:"success"`
		Data    map[string]any `json:"data"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !payload.Success || payload.Data["username"] != "guru-pwa" {
		t.Fatalf("unexpected legacy payload: %#v", payload)
	}
	if _, hasAccessToken := payload.Data["accessToken"]; hasAccessToken {
		t.Fatalf("legacy payload must preserve the old user-only response shape: %#v", payload.Data)
	}

	var accessCookie *http.Cookie
	for _, cookie := range response.Cookies() {
		if cookie.Name == "gp_legacy_access" {
			accessCookie = cookie
			break
		}
	}
	if accessCookie == nil || !accessCookie.HttpOnly || accessCookie.Path != "/api" {
		t.Fatalf("legacy access cookie missing or unsafe: %#v", accessCookie)
	}

	checkRequest := httptest.NewRequest(http.MethodGet, "/api/auth.php?action=check", nil)
	checkRequest.AddCookie(accessCookie)
	checkResponse, err := app.Test(checkRequest, legacyAuthTestTimeout)
	if err != nil {
		t.Fatalf("legacy session check request: %v", err)
	}
	if checkResponse.StatusCode != http.StatusOK {
		t.Fatalf("legacy session check status = %d, want 200", checkResponse.StatusCode)
	}

	protectedRequest := httptest.NewRequest(http.MethodGet, "/protected", nil)
	protectedRequest.AddCookie(accessCookie)
	protectedResponse, err := app.Test(protectedRequest, legacyAuthTestTimeout)
	if err != nil {
		t.Fatalf("protected request: %v", err)
	}
	if protectedResponse.StatusCode != http.StatusNoContent {
		t.Fatalf("protected status = %d, want 204", protectedResponse.StatusCode)
	}
}
