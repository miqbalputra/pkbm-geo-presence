package migrations_test

import (
	"os"
	"testing"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/config"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/database"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/migrations"
)

func TestMySQLMigrationsAreIdempotentAndLegacyCompatible(t *testing.T) {
	if os.Getenv("MYSQL_INTEGRATION") != "1" {
		t.Skip("set MYSQL_INTEGRATION=1 to run against disposable MySQL")
	}
	cfg := config.Config{
		AppTimezone:       "Asia/Jakarta",
		DBHost:            envOr("DB_HOST", "127.0.0.1"),
		DBPort:            envOr("DB_PORT", "3306"),
		DBName:            envOr("DB_NAME", "geopresensi_test"),
		DBUser:            envOr("DB_USER", "geopresensi_test"),
		DBPass:            os.Getenv("DB_PASS"),
		DBMaxOpenConns:    5,
		DBMaxIdleConns:    2,
		DBConnMaxLifetime: 0,
	}
	db, err := database.Open(cfg)
	if err != nil {
		t.Fatalf("open mysql: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("get sql db: %v", err)
	}
	defer sqlDB.Close()

	if err := migrations.Run(db); err != nil {
		t.Fatalf("first migration: %v", err)
	}
	if err := migrations.Run(db); err != nil {
		t.Fatalf("second migration should be idempotent: %v", err)
	}

	// Simulate a legacy dump whose schema predates the Go-only columns while
	// retaining the migration ledger. The compatibility pass must restore them
	// without requiring a destructive migration reset.
	if err := db.Exec("ALTER TABLE users DROP INDEX idx_users_email, DROP INDEX idx_users_google_id, DROP INDEX idx_users_archived_at, DROP INDEX idx_users_role_archived_id, DROP COLUMN email, DROP COLUMN google_id, DROP COLUMN tanggal_lahir, DROP COLUMN archived_at, DROP COLUMN archive_reason, DROP COLUMN tipe_guru").Error; err != nil {
		t.Fatalf("simulate legacy users schema: %v", err)
	}
	if err := db.Exec("ALTER TABLE attendance_logs DROP INDEX idx_attendance_qr_nonce, DROP COLUMN metode, DROP COLUMN lokasi_pulang, DROP COLUMN qr_nonce").Error; err != nil {
		t.Fatalf("simulate legacy attendance schema: %v", err)
	}
	if err := migrations.Run(db); err != nil {
		t.Fatalf("legacy compatibility migration: %v", err)
	}

	for _, table := range []string{"users", "attendance_logs", "jwt_refresh_tokens", "security_events", "optional_workdays", "user_weekend_overrides", "pengaturan_harian", "location_tracks", "webhook_config", "webhook_logs", "backup_jobs", "backup_restore_jobs", "maintenance_state", "backup_uploads", "monthly_attendance_confirmations", "schema_migrations"} {
		var count int
		if err := db.Raw("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?", table).Scan(&count).Error; err != nil {
			t.Fatalf("check table %s: %v", table, err)
		}
		if count != 1 {
			t.Fatalf("expected table %s to exist", table)
		}
	}
	for _, column := range []struct {
		table string
		name  string
	}{
		{table: "users", name: "email"},
		{table: "users", name: "google_id"},
		{table: "users", name: "tanggal_lahir"},
		{table: "users", name: "archived_at"},
		{table: "users", name: "archive_reason"},
		{table: "users", name: "tipe_guru"},
		{table: "attendance_logs", name: "metode"},
		{table: "attendance_logs", name: "lokasi_pulang"},
		{table: "attendance_logs", name: "qr_nonce"},
	} {
		var count int
		if err := db.Raw("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?", column.table, column.name).Scan(&count).Error; err != nil {
			t.Fatalf("check column %s.%s: %v", column.table, column.name, err)
		}
		if count != 1 {
			t.Fatalf("expected column %s.%s to exist", column.table, column.name)
		}
	}
	for _, index := range []struct {
		table string
		name  string
	}{
		{table: "users", name: "idx_users_role_archived_id"},
		{table: "attendance_logs", name: "idx_attendance_date_status"},
		{table: "attendance_logs", name: "idx_attendance_qr_nonce"},
	} {
		var count int
		if err := db.Raw("SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?", index.table, index.name).Scan(&count).Error; err != nil {
			t.Fatalf("check index %s.%s: %v", index.table, index.name, err)
		}
		if count < 1 {
			t.Fatalf("expected index %s.%s to exist", index.table, index.name)
		}
	}
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
