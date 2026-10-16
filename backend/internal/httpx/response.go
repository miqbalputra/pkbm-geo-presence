package httpx

import "github.com/gofiber/fiber/v2"

func Success(c *fiber.Ctx, message string, data any) error {
	return c.JSON(fiber.Map{"success": true, "message": message, "data": data})
}

func Error(c *fiber.Ctx, status int, code, message string) error {
	return c.Status(status).JSON(fiber.Map{
		"success":   false,
		"code":      code,
		"message":   message,
		"requestId": c.Get("X-Request-ID"),
	})
}
