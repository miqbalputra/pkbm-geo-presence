package database

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/glebarez/sqlite"
	sqldriver "github.com/go-sql-driver/mysql"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/config"
)

func Open(cfg config.Config) (*gorm.DB, error) {
	location, err := time.LoadLocation(cfg.AppTimezone)
	if err != nil {
		location = time.FixedZone("WIB", 7*60*60)
	}
	driver := strings.ToLower(strings.TrimSpace(cfg.DBDriver))
	if driver == "" {
		driver = "mysql"
	}

	gormConfig := &gorm.Config{Logger: newLogger(cfg.AppEnv)}
	var db *gorm.DB
	if driver == "sqlite" {
		if cfg.DBPath == "" {
			return nil, fmt.Errorf("DB_PATH wajib diisi saat DB_DRIVER=sqlite")
		}
		if !strings.HasPrefix(cfg.DBPath, ":memory:") && !strings.HasPrefix(cfg.DBPath, "file:") {
			if err := os.MkdirAll(filepath.Dir(cfg.DBPath), 0o755); err != nil {
				return nil, fmt.Errorf("create sqlite directory: %w", err)
			}
		}
		db, err = gorm.Open(sqlite.Open(cfg.DBPath), gormConfig)
	} else {
		db, err = gorm.Open(mysql.Open(mysqlDSN(cfg, location)), gormConfig)
	}
	if err != nil {
		return nil, err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	if driver == "sqlite" {
		// SQLite is intentionally single-writer for local development. WAL keeps
		// reads responsive while avoiding lock storms from concurrent requests.
		if err := db.Exec("PRAGMA foreign_keys = ON").Error; err != nil {
			return nil, fmt.Errorf("enable sqlite foreign keys: %w", err)
		}
		if err := db.Exec("PRAGMA busy_timeout = 5000").Error; err != nil {
			return nil, fmt.Errorf("configure sqlite busy timeout: %w", err)
		}
		if err := db.Exec("PRAGMA journal_mode = WAL").Error; err != nil {
			return nil, fmt.Errorf("configure sqlite WAL: %w", err)
		}
		sqlDB.SetMaxOpenConns(1)
		sqlDB.SetMaxIdleConns(1)
	} else {
		sqlDB.SetMaxOpenConns(cfg.DBMaxOpenConns)
		sqlDB.SetMaxIdleConns(cfg.DBMaxIdleConns)
	}
	sqlDB.SetConnMaxLifetime(cfg.DBConnMaxLifetime)
	sqlDB.SetConnMaxIdleTime(cfg.DBConnMaxIdleTime)
	return db, nil
}

func mysqlDSN(cfg config.Config, location *time.Location) string {
	// Start with the driver's defaults: a zero-value Config disables
	// mysql_native_password, which MariaDB deployments may still require.
	dsnConfig := sqldriver.NewConfig()
	dsnConfig.User = cfg.DBUser
	dsnConfig.Passwd = cfg.DBPass
	dsnConfig.Net = "tcp"
	dsnConfig.Addr = cfg.DBHost + ":" + cfg.DBPort
	dsnConfig.DBName = cfg.DBName
	dsnConfig.Params = map[string]string{"charset": "utf8mb4"}
	dsnConfig.ParseTime = true
	dsnConfig.Loc = location
	dsnConfig.Timeout = cfg.DBConnectTimeout
	dsnConfig.ReadTimeout = cfg.DBReadTimeout
	dsnConfig.WriteTimeout = cfg.DBWriteTimeout
	return dsnConfig.FormatDSN()
}

func newLogger(appEnv string) logger.Interface {
	level := logger.Warn
	if strings.EqualFold(strings.TrimSpace(appEnv), "development") {
		level = logger.Info
	}

	return logger.New(log.New(os.Stdout, "", log.LstdFlags), logger.Config{
		SlowThreshold:             time.Second,
		LogLevel:                  level,
		IgnoreRecordNotFoundError: true,
		ParameterizedQueries:      true,
		Colorful:                  false,
	})
}
