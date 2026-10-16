package compat

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/auth"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/config"
)

func TestIntegrationAuthRequiresConfiguredKey(t *testing.T) {
	h := &Handler{cfg: config.Config{N8NAPIKey: "staging-key"}}
	app := fiber.New()
	app.Get("/integration", h.integrationAuth, func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusNoContent) })

	missing, _ := app.Test(httptest.NewRequest("GET", "/integration", nil))
	if missing.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("missing key status = %d", missing.StatusCode)
	}

	validRequest := httptest.NewRequest("GET", "/integration", nil)
	validRequest.Header.Set("X-API-Key", "staging-key")
	valid, _ := app.Test(validRequest)
	if valid.StatusCode != fiber.StatusNoContent {
		t.Fatalf("valid key status = %d", valid.StatusCode)
	}
}

func TestWebhookURLValidation(t *testing.T) {
	if err := validateWebhookURL("https://n8n.example.com/webhook", true, false); err != nil {
		t.Fatalf("valid HTTPS URL rejected: %v", err)
	}
	if err := validateWebhookURL("http://n8n.example.com/webhook", true, false); err == nil {
		t.Fatal("expected production HTTP URL to fail")
	}
	if err := validateWebhookURL("http://127.0.0.1:5678/webhook", false, false); err == nil {
		t.Fatal("expected private target to fail")
	}
	if err := validateWebhookURL("http://127.0.0.1:5678/webhook", false, true); err != nil {
		t.Fatalf("private target should be allowed explicitly: %v", err)
	}
}

func TestNormalizeWhatsAppPhone(t *testing.T) {
	for input, expected := range map[string]string{
		"0812-3456-7890": "6281234567890",
		"+6281234567890": "6281234567890",
		"0812":           "",
	} {
		if got := normalizeWhatsAppPhone(input); got != expected {
			t.Fatalf("normalizeWhatsAppPhone(%q) = %q, want %q", input, got, expected)
		}
	}
}

func TestSendGowaMessageUsesBasicAuthAndJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		username, password, ok := r.BasicAuth()
		if !ok || username != "user" || password != "pass" {
			t.Errorf("unexpected Basic Auth: %q/%q", username, password)
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("content type = %q", r.Header.Get("Content-Type"))
		}
		body, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(body), `"phone":"6281234567890"`) {
			t.Errorf("phone missing from payload: %s", body)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	h := &Handler{cfg: config.Config{GowaWebhookURL: server.URL, GowaUsername: "user", GowaPassword: "pass"}}
	if err := h.sendGowaMessage("6281234567890", "test message"); err != nil {
		t.Fatalf("sendGowaMessage failed: %v", err)
	}
}

func TestRESTV1AliasesRequireAuthentication(t *testing.T) {
	cfg := config.Config{JWTSecret: "test-secret-that-is-long-enough-for-the-test", JWTIssuer: "test", JWTAudience: "web"}
	h := &Handler{cfg: cfg, jwt: auth.NewJWTManager(cfg)}
	app := fiber.New()
	h.RegisterCoreRoutes(app)
	h.RegisterAttendanceRoutes(app)
	h.RegisterIntegrationRoutes(app)
	for _, path := range []string{
		"/api/v1/users",
		"/api/v1/attendance",
		"/api/v1/reports/admin-summary",
		"/api/v1/reports/analytics",
		"/api/v1/qr/scan",
		"/api/v1/integrations/hermes",
		"/api/v1/integrations/n8n/users",
		"/api/v1/integrations/webhook",
		"/api/v1/integrations/journal/teachers",
		"/api/v1/integrations/journal/attendance",
	} {
		response, err := app.Test(httptest.NewRequest("GET", path, nil))
		if err != nil {
			t.Fatal(err)
		}
		if response.StatusCode != fiber.StatusUnauthorized {
			t.Fatalf("%s status = %d, want 401", path, response.StatusCode)
		}
	}
}
