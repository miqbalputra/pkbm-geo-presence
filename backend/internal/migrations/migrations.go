package migrations

import (
	"embed"
	"fmt"
	"sort"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
)

//go:embed sql/*.sql
var files embed.FS

func Run(db *gorm.DB) error {
	if db.Dialector.Name() == "sqlite" {
		return runSQLite(db)
	}

	if err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).Error; err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	entries, err := files.ReadDir("sql")
	if err != nil {
		return err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	for _, entry := range entries {
		version := strings.TrimSuffix(entry.Name(), ".sql")
		var count int64
		if err := db.Table("schema_migrations").Where("version = ?", version).Count(&count).Error; err != nil {
			return fmt.Errorf("check migration %s: %w", version, err)
		}
		if count > 0 {
			continue
		}
		content, err := files.ReadFile("sql/" + entry.Name())
		if err != nil {
			return err
		}
		tx := db.Begin()
		if tx.Error != nil {
			return tx.Error
		}
		for _, statement := range splitStatements(string(content)) {
			if err := tx.Exec(statement).Error; err != nil {
				tx.Rollback()
				return fmt.Errorf("apply migration %s: %w", version, err)
			}
		}
		if err := tx.Exec("INSERT INTO schema_migrations (version) VALUES (?)", version).Error; err != nil {
			tx.Rollback()
			return fmt.Errorf("record migration %s: %w", version, err)
		}
		if err := tx.Commit().Error; err != nil {
			return fmt.Errorf("commit migration %s: %w", version, err)
		}
	}
	return ensureLegacyUserColumns(db)
}

func runSQLite(db *gorm.DB) error {
	if err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`).Error; err != nil {
		return fmt.Errorf("create sqlite schema_migrations: %w", err)
	}

	// Production migration files target MySQL. SQLite uses the equivalent
	// model-driven schema only for local development.
	if err := db.AutoMigrate(
		&models.User{},
		&models.AttendanceLog{},
		&models.AttendanceEvent{},
		&models.ActivityLog{},
		&models.Setting{},
		&models.Holiday{},
		&models.JadwalPiket{},
		&models.RefreshToken{},
		&models.SecurityEvent{},
		&models.OptionalWorkday{},
		&models.WeekendOverride{},
		&models.PengaturanHarian{},
		&models.LocationTrack{},
		&models.WebhookConfig{},
		&models.WebhookLog{},
		&models.BackupJob{},
		&models.BackupRestoreJob{},
		&models.MaintenanceState{},
		&models.BackupUpload{},
		&models.MonthlyAttendanceConfirmation{},
		&models.AttendanceRevisionRequest{},
	); err != nil {
		return fmt.Errorf("auto migrate sqlite schema: %w", err)
	}

	for _, statement := range []string{
		"CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON users (username)",
		"CREATE UNIQUE INDEX IF NOT EXISTS uq_users_id_guru ON users (id_guru)",
		"CREATE INDEX IF NOT EXISTS idx_users_role_archived_id ON users (role, archived_at, id)",
		"CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_user_date ON attendance_logs (user_id, tanggal)",
		"CREATE INDEX IF NOT EXISTS idx_attendance_date_status ON attendance_logs (tanggal, status)",
		"CREATE UNIQUE INDEX IF NOT EXISTS uq_settings_key ON settings (setting_key)",
		"CREATE UNIQUE INDEX IF NOT EXISTS uq_holidays_date ON holidays (tanggal)",
		"CREATE UNIQUE INDEX IF NOT EXISTS uq_optional_workday_date ON optional_workdays (tanggal)",
		"CREATE UNIQUE INDEX IF NOT EXISTS uq_weekend_override_user_date ON user_weekend_overrides (user_id, tanggal)",
		"CREATE INDEX IF NOT EXISTS idx_location_user_date ON location_tracks (user_id, tanggal, recorded_at)",
		"CREATE UNIQUE INDEX IF NOT EXISTS uq_jwt_refresh_token_hash ON jwt_refresh_tokens (token_hash)",
		"CREATE INDEX IF NOT EXISTS idx_attendance_qr_nonce ON attendance_logs (qr_nonce)",
		"CREATE UNIQUE INDEX IF NOT EXISTS uq_backup_idempotency ON backup_jobs (idempotency_key)",
		"CREATE INDEX IF NOT EXISTS idx_backup_status_requested ON backup_jobs (status, requested_at)",
		"CREATE INDEX IF NOT EXISTS idx_backup_expires ON backup_jobs (expires_at)",
		"CREATE INDEX IF NOT EXISTS idx_restore_status_created ON backup_restore_jobs (status, created_at)",
		"CREATE INDEX IF NOT EXISTS idx_backup_upload_expires ON backup_uploads (expires_at)",
		"CREATE INDEX IF NOT EXISTS idx_monthly_confirmation_period_status ON monthly_attendance_confirmations (period_start, status)",
	} {
		if err := db.Exec(statement).Error; err != nil {
			return fmt.Errorf("create sqlite index: %w", err)
		}
	}

	entries, err := files.ReadDir("sql")
	if err != nil {
		return err
	}
	for _, entry := range entries {
		version := strings.TrimSuffix(entry.Name(), ".sql")
		if err := db.Exec("INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)", version).Error; err != nil {
			return fmt.Errorf("record sqlite migration %s: %w", version, err)
		}
	}

	if err := seedSQLiteAdmin(db); err != nil {
		return err
	}
	return nil
}

func seedSQLiteAdmin(db *gorm.DB) error {
	var count int64
	if err := db.Model(&models.User{}).Where("username = ?", "admin").Count(&count).Error; err != nil {
		return fmt.Errorf("check sqlite admin seed: %w", err)
	}
	if count > 0 {
		return nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash sqlite admin seed password: %w", err)
	}
	now := time.Now().UTC()
	admin := models.User{
		Username:  "admin",
		Password:  string(hash),
		Role:      "admin",
		Nama:      "Admin Sekolah",
		TipeGuru:  "full_time",
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := db.Create(&admin).Error; err != nil {
		return fmt.Errorf("seed sqlite admin: %w", err)
	}
	return nil
}

func splitStatements(content string) []string {
	// Strip full-line SQL comments before splitting. A semicolon inside a
	// comment is documentation, not a statement boundary.
	var uncommented strings.Builder
	for _, line := range strings.Split(content, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "--") {
			continue
		}
		uncommented.WriteString(line)
		uncommented.WriteByte('\n')
	}

	parts := strings.Split(uncommented.String(), ";")
	statements := make([]string, 0, len(parts))
	for _, part := range parts {
		if statement := strings.TrimSpace(part); statement != "" {
			statements = append(statements, statement)
		}
	}
	return statements
}

func ensureLegacyUserColumns(db *gorm.DB) error {
	legacyColumns := []struct {
		table      string
		name       string
		definition string
	}{
		{table: "users", name: "email", definition: "VARCHAR(255) NULL"},
		{table: "users", name: "google_id", definition: "VARCHAR(255) NULL"},
		{table: "users", name: "archived_at", definition: "TIMESTAMP NULL"},
		{table: "users", name: "archive_reason", definition: "VARCHAR(255) NULL"},
		{table: "users", name: "tanggal_lahir", definition: "DATE NULL"},
		{table: "users", name: "tipe_guru", definition: "VARCHAR(30) NOT NULL DEFAULT 'full_time'"},
		{table: "users", name: "piket_group", definition: "VARCHAR(1) NULL"},
		{table: "users", name: "pokjar", definition: "VARCHAR(100) NULL"},
		{table: "users", name: "tanda_tangan", definition: "LONGTEXT NULL"},
		{table: "attendance_logs", name: "metode", definition: "VARCHAR(30) NOT NULL DEFAULT 'button'"},
		{table: "attendance_logs", name: "lokasi_pulang", definition: "VARCHAR(16) NULL DEFAULT NULL"},
		{table: "attendance_logs", name: "qr_nonce", definition: "VARCHAR(64) NULL DEFAULT NULL"},
		{table: "attendance_logs", name: "checkin_accuracy_meters", definition: "DECIMAL(8,2) NULL"},
		{table: "attendance_logs", name: "checkout_latitude", definition: "DECIMAL(10,8) NULL"},
		{table: "attendance_logs", name: "checkout_longitude", definition: "DECIMAL(11,8) NULL"},
		{table: "attendance_logs", name: "checkout_accuracy_meters", definition: "DECIMAL(8,2) NULL"},
		{table: "attendance_logs", name: "checkout_distance_meters", definition: "INT NULL"},
		{table: "attendance_logs", name: "checkout_location_verdict", definition: "VARCHAR(16) NULL"},
		{table: "monthly_attendance_confirmations", name: "confirmed_by_admin_id", definition: "INT NULL DEFAULT NULL"},
	}
	for _, column := range legacyColumns {
		if err := ensureColumn(db, column.table, column.name, column.definition); err != nil {
			return err
		}
	}

	// These indexes are deliberately non-unique so existing legacy data with
	// duplicate or NULL identity values remains migratable.
	indexes := []struct {
		table string
		name  string
		cols  string
	}{
		{table: "users", name: "idx_users_email", cols: "`email`"},
		{table: "users", name: "idx_users_google_id", cols: "`google_id`"},
		{table: "users", name: "idx_users_archived_at", cols: "`archived_at`"},
		{table: "users", name: "idx_users_role_archived_id", cols: "`role`, `archived_at`, `id`"},
		{table: "attendance_logs", name: "idx_attendance_qr_nonce", cols: "`qr_nonce`"},
		{table: "attendance_logs", name: "idx_attendance_date_status", cols: "`tanggal`, `status`"},
		{table: "monthly_attendance_confirmations", name: "idx_monthly_confirmation_admin_actor", cols: "`confirmed_by_admin_id`"},
	}
	for _, index := range indexes {
		if err := ensureIndex(db, index.table, index.name, index.cols); err != nil {
			return err
		}
	}
	if err := ensureForeignKey(db, "monthly_attendance_confirmations", "fk_monthly_confirmation_admin_actor", "ALTER TABLE `monthly_attendance_confirmations` ADD CONSTRAINT `fk_monthly_confirmation_admin_actor` FOREIGN KEY (`confirmed_by_admin_id`) REFERENCES `users` (`id`) ON DELETE SET NULL"); err != nil {
		return err
	}
	return nil
}

func ensureForeignKey(db *gorm.DB, table, name, statement string) error {
	var count int64
	if err := db.Raw(`SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_name = ?`, table, name).Scan(&count).Error; err != nil {
		return fmt.Errorf("check foreign key %s.%s: %w", table, name, err)
	}
	if count > 0 {
		return nil
	}
	if err := db.Exec(statement).Error; err != nil {
		return fmt.Errorf("add foreign key %s.%s: %w", table, name, err)
	}
	return nil
}

func ensureColumn(db *gorm.DB, table, name, definition string) error {
	var count int64
	if err := db.Raw(`SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`, table, name).Scan(&count).Error; err != nil {
		return fmt.Errorf("check %s.%s: %w", table, name, err)
	}
	if count > 0 {
		return nil
	}
	if err := db.Exec("ALTER TABLE `" + table + "` ADD COLUMN `" + name + "` " + definition).Error; err != nil {
		return fmt.Errorf("add %s.%s: %w", table, name, err)
	}
	return nil
}

func ensureIndex(db *gorm.DB, table, name, columns string) error {
	var count int64
	if err := db.Raw(`SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`, table, name).Scan(&count).Error; err != nil {
		return fmt.Errorf("check index %s.%s: %w", table, name, err)
	}
	if count > 0 {
		return nil
	}
	if err := db.Exec("ALTER TABLE `" + table + "` ADD KEY `" + name + "` (" + columns + ")").Error; err != nil {
		return fmt.Errorf("add index %s.%s: %w", table, name, err)
	}
	return nil
}
