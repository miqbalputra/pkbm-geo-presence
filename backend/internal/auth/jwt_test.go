package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/config"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
	"gorm.io/gorm"
)

func TestJWTIssueAndParse(t *testing.T) {
	cfg := config.Config{JWTSecret: "test-secret-that-is-long-enough-for-the-test", JWTIssuer: "test", JWTAudience: "web", JWTAccessTTL: time.Minute}
	manager := NewJWTManager(cfg)
	token, _, err := manager.IssueAccess(models.User{ID: 42, Role: "guru"})
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	claims, err := manager.ParseAccess(token)
	if err != nil {
		t.Fatalf("parse token: %v", err)
	}
	if claims.UserID != 42 || claims.Role != "guru" {
		t.Fatalf("unexpected claims: %#v", claims)
	}
}

func TestJWTRejectsTamperedToken(t *testing.T) {
	cfg := config.Config{JWTSecret: "test-secret-that-is-long-enough-for-the-test", JWTIssuer: "test", JWTAudience: "web", JWTAccessTTL: time.Minute}
	manager := NewJWTManager(cfg)
	token, _, err := manager.IssueAccess(models.User{ID: 42, Role: "guru"})
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	if _, err := manager.ParseAccess(token + "tampered"); err == nil {
		t.Fatal("expected tampered token to fail")
	}
}

func TestJWTRejectsWrongIssuerAndAudience(t *testing.T) {
	issued := config.Config{JWTSecret: "test-secret-that-is-long-enough-for-the-test", JWTIssuer: "issuer-a", JWTAudience: "audience-a", JWTAccessTTL: time.Minute}
	manager := NewJWTManager(issued)
	token, _, err := manager.IssueAccess(models.User{ID: 42, Role: "guru"})
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	wrongIssuer := NewJWTManager(config.Config{JWTSecret: issued.JWTSecret, JWTIssuer: "issuer-b", JWTAudience: issued.JWTAudience, JWTAccessTTL: time.Minute})
	if _, err := wrongIssuer.ParseAccess(token); err == nil {
		t.Fatal("expected issuer mismatch to fail")
	}
	wrongAudience := NewJWTManager(config.Config{JWTSecret: issued.JWTSecret, JWTIssuer: issued.JWTIssuer, JWTAudience: "audience-b", JWTAccessTTL: time.Minute})
	if _, err := wrongAudience.ParseAccess(token); err == nil {
		t.Fatal("expected audience mismatch to fail")
	}
}

func TestJWTRejectsNoneAlgorithm(t *testing.T) {
	cfg := config.Config{JWTSecret: "test-secret-that-is-long-enough-for-the-test", JWTIssuer: "test", JWTAudience: "web", JWTAccessTTL: time.Minute}
	manager := NewJWTManager(cfg)
	token := jwt.NewWithClaims(jwt.SigningMethodNone, Claims{UserID: 42, Role: "admin"})
	raw, err := token.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("create none token: %v", err)
	}
	if _, err := manager.ParseAccess(raw); err == nil {
		t.Fatal("expected none algorithm to fail")
	}
}

func TestRequireActiveUserCallsProtectedHandlerOnce(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:auth-middleware-test?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}); err != nil {
		t.Fatalf("migrate user: %v", err)
	}
	if err := db.Create(&models.User{ID: 42, Username: "admin", Role: "admin", Nama: "Admin", TipeGuru: "full_time"}).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	cfg := config.Config{JWTSecret: "test-secret-that-is-long-enough-for-the-test", JWTIssuer: "test", JWTAudience: "web", JWTAccessTTL: time.Minute}
	manager := NewJWTManager(cfg)
	token, _, err := manager.IssueAccess(models.User{ID: 42, Role: "admin"})
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	app := fiber.New()
	app.Get("/protected", RequireActiveUser(db, manager), func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})
	request := httptest.NewRequest(http.MethodGet, "/protected", nil)
	request.Header.Set(fiber.HeaderAuthorization, "Bearer "+token)
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", response.StatusCode)
	}
}

func TestRequireActiveUserAcceptsShortLivedLegacyPWACookie(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:auth-legacy-cookie-test?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}); err != nil {
		t.Fatalf("migrate user: %v", err)
	}
	if err := db.Create(&models.User{ID: 77, Username: "guru", Role: "guru", Nama: "Guru", TipeGuru: "full_time"}).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	cfg := config.Config{JWTSecret: "test-secret-that-is-long-enough-for-the-test", JWTIssuer: "test", JWTAudience: "web", JWTAccessTTL: time.Minute}
	manager := NewJWTManager(cfg)
	token, _, err := manager.IssueAccess(models.User{ID: 77, Role: "guru"})
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	app := fiber.New()
	app.Get("/protected", RequireActiveUser(db, manager), func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})
	request := httptest.NewRequest(http.MethodGet, "/protected", nil)
	request.AddCookie(&http.Cookie{Name: "gp_legacy_access", Value: token})
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", response.StatusCode)
	}
}
