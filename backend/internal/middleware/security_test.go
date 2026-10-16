package middleware

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestSecurityHeaders(t *testing.T) {
	app := fiber.New()
	app.Use(SecurityHeaders())
	app.Get("/", func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusNoContent) })
	response, err := app.Test(httptest.NewRequest("GET", "/", nil))
	if err != nil {
		t.Fatal(err)
	}
	if response.Header.Get("X-Content-Type-Options") != "nosniff" {
		t.Fatal("missing nosniff header")
	}
	if response.Header.Get("X-Frame-Options") != "DENY" {
		t.Fatal("missing frame protection header")
	}
	if response.Header.Get("Content-Security-Policy") == "" {
		t.Fatal("missing CSP header")
	}
}

func TestSecurityHeadersTrustForwardedHTTPS(t *testing.T) {
	app := fiber.New()
	app.Use(SecurityHeaders())
	app.Get("/", func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusNoContent) })
	request := httptest.NewRequest("GET", "/", nil)
	request.Header.Set("X-Forwarded-Proto", "https")
	response, err := app.Test(request)
	if err != nil {
		t.Fatal(err)
	}
	if response.Header.Get("Strict-Transport-Security") == "" {
		t.Fatal("missing HSTS header for forwarded HTTPS request")
	}
}
