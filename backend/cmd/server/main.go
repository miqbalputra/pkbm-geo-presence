package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	_ "time/tzdata"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/compress"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/fiber/v2/middleware/requestid"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/auth"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/backup"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/compat"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/config"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/database"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/middleware"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/migrations"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	db, err := database.Open(cfg)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}

	if err := migrations.Run(db); err != nil {
		log.Fatalf("run migrations: %v", err)
	}

	app := fiber.New(fiber.Config{
		AppName:      "Presensi PKBM Tunas Ilmu API",
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 20 * time.Second,
		IdleTimeout:  60 * time.Second,
		BodyLimit:    int(backup.UploadChunkSize),
		ErrorHandler: middleware.ErrorHandler(cfg.AppEnv),
	})

	app.Use(requestid.New())
	app.Use(recover.New(recover.Config{EnableStackTrace: !cfg.IsSecureEnvironment()}))
	app.Use(middleware.SecurityHeaders())
	app.Use(compress.New(compress.Config{Level: compress.LevelBestSpeed}))
	app.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.FrontendOrigins,
		AllowMethods:     "GET,POST,PUT,PATCH,DELETE,OPTIONS",
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization, X-Request-ID, X-CSRF-Token, X-Chunk-Offset",
		AllowCredentials: true,
		MaxAge:           600,
	}))
	app.Use(limiter.New(limiter.Config{
		Next: func(c *fiber.Ctx) bool {
			return c.Path() == "/health/live" || c.Path() == "/health/ready"
		},
		Max:        120,
		Expiration: time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			return fiber.NewError(fiber.StatusTooManyRequests, "Terlalu banyak request. Silakan coba lagi.")
		},
	}))
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("db", db)
		return c.Next()
	})

	j := auth.NewJWTManager(cfg)
	authHandler := auth.NewHandler(db, cfg, j)
	compatHandler := compat.NewHandler(db, cfg, j)
	backupService := backup.NewService(db, cfg)
	if err := backupService.Initialize(); err != nil {
		log.Fatalf("initialize backup service: %v", err)
	}
	go backupService.StartCleanup(context.Background())
	backupHandler := backup.NewHandler(backupService, db, cfg, j)
	app.Use(backupService.MaintenanceMiddleware())

	app.Get("/health/live", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"success": true, "status": "live"})
	})
	app.Get("/health/ready", func(c *fiber.Ctx) error {
		sqlDB, err := db.DB()
		if err != nil || sqlDB.PingContext(c.Context()) != nil {
			return fiber.NewError(fiber.StatusServiceUnavailable, "Database belum siap")
		}
		return c.JSON(fiber.Map{"success": true, "status": "ready"})
	})
	app.Get("/version", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"success": true, "data": fiber.Map{"version": cfg.AppVersion, "environment": cfg.AppEnv}})
	})

	api := app.Group("/api/v1")
	api.Get("/config", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"success": true, "message": "Konfigurasi login", "data": fiber.Map{"googleClientId": cfg.GoogleClientID, "turnstileSiteKey": cfg.TurnstileSiteKey}})
	})
	authHandler.RegisterRoutes(api)
	authHandler.RegisterLegacyRoutes(app)
	compatHandler.RegisterCoreRoutes(app)
	compatHandler.RegisterAttendanceRoutes(app)
	compatHandler.RegisterIntegrationRoutes(app)
	backupHandler.RegisterRoutes(app)

	// Transitional compatibility path. Feature handlers are added per migration stage.
	app.Get("/api/health.php", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"success": true, "message": "Go API aktif", "data": fiber.Map{"status": "ok"}})
	})
	app.Get("/api/google_config.php", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"success": true, "message": "Konfigurasi login", "data": fiber.Map{"googleClientId": cfg.GoogleClientID, "turnstileSiteKey": cfg.TurnstileSiteKey}})
	})
	app.Get("/api/version.php", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"success": true, "message": "Deployment version info", "data": fiber.Map{"version": cfg.AppVersion, "teacher_workdays_role": []string{"admin", "kepala_sekolah", "guru"}, "optional_workdays_role": []string{"admin", "kepala_sekolah", "guru"}}})
	})
	app.Use("/assets", func(c *fiber.Ctx) error {
		c.Set("Cache-Control", "public, max-age=31536000, immutable")
		return c.Next()
	})
	app.Use(func(c *fiber.Ctx) error {
		// HTML shell, manifest, and service worker must not be held by the
		// browser/CDN between deployments. Hashed assets remain immutable above.
		switch c.Path() {
		case "/", "/index.html", "/sw.js", "/manifest.json":
			c.Set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
			c.Set("Pragma", "no-cache")
			c.Set("Expires", "0")
		}
		return c.Next()
	})
	app.Static("/", cfg.StaticDir, fiber.Static{Browse: false})
	app.Use(func(c *fiber.Ctx) error {
		if strings.HasPrefix(c.Path(), "/api") || strings.HasPrefix(c.Path(), "/health") || c.Path() == "/version" {
			return fiber.ErrNotFound
		}
		return c.SendFile(filepath.Join(cfg.StaticDir, "index.html"))
	})

	go func() {
		if err := app.Listen(cfg.ListenAddress()); err != nil {
			log.Printf("server stopped: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := app.ShutdownWithContext(ctx); err != nil {
		log.Printf("graceful shutdown: %v", err)
	}
	if sqlDB, err := db.DB(); err == nil {
		_ = sqlDB.Close()
	}
}
