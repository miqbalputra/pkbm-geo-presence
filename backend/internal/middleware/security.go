package middleware

import (
	"errors"
	"log"
	"strings"

	"github.com/gofiber/fiber/v2"
)

func SecurityHeaders() fiber.Handler {
	return func(c *fiber.Ctx) error {
		c.Set("X-Content-Type-Options", "nosniff")
		c.Set("X-Frame-Options", "DENY")
		c.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Set("Permissions-Policy", "geolocation=(self), camera=(self), microphone=()")
		c.Set("Content-Security-Policy", "default-src 'self'; script-src 'self' https://accounts.google.com https://challenges.cloudflare.com; connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://challenges.cloudflare.com; frame-src 'self' https://accounts.google.com https://challenges.cloudflare.com; img-src 'self' data: https://*.googleusercontent.com; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
		// Coolify/NGINX terminates TLS before forwarding to the Go container, so
		// honor the standard proxy protocol header for HSTS as well.
		if c.Protocol() == "https" || strings.EqualFold(c.Get("X-Forwarded-Proto"), "https") {
			c.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		return c.Next()
	}
}

func ErrorHandler(appEnv string) fiber.ErrorHandler {
	return func(c *fiber.Ctx, err error) error {
		status := fiber.StatusInternalServerError
		message := "Terjadi kesalahan pada server."
		var fiberErr *fiber.Error
		if errors.As(err, &fiberErr) {
			status = fiberErr.Code
			message = fiberErr.Message
		}
		if status >= 500 && appEnv != "development" {
			log.Printf("server error request_id=%s method=%s path=%s: %v", c.Get("X-Request-ID"), c.Method(), c.Path(), err)
			message = "Terjadi kesalahan pada server."
		}
		return c.Status(status).JSON(fiber.Map{
			"success":   false,
			"code":      strings.ToUpper(strings.ReplaceAll(message, " ", "_")),
			"message":   message,
			"requestId": c.Get("X-Request-ID"),
		})
	}
}
