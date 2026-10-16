package database

import (
	"testing"
	"time"

	sqldriver "github.com/go-sql-driver/mysql"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/config"
)

func TestMySQLDSNAllowsNativePasswordAuthentication(t *testing.T) {
	cfg := config.Config{
		DBUser:           "pkbm-user",
		DBPass:           "test-password",
		DBHost:           "db.example.test",
		DBPort:           "3306",
		DBName:           "pkbm",
		DBConnectTimeout: 5 * time.Second,
		DBReadTimeout:    10 * time.Second,
		DBWriteTimeout:   10 * time.Second,
	}

	parsed, err := sqldriver.ParseDSN(mysqlDSN(cfg, time.UTC))
	if err != nil {
		t.Fatalf("parse generated MySQL DSN: %v", err)
	}
	if !parsed.AllowNativePasswords {
		t.Fatal("generated MySQL DSN disables mysql_native_password authentication")
	}
	if parsed.User != cfg.DBUser || parsed.Passwd != cfg.DBPass {
		t.Fatal("generated MySQL DSN did not preserve database credentials")
	}
	if parsed.Addr != cfg.DBHost+":"+cfg.DBPort || parsed.DBName != cfg.DBName {
		t.Fatalf("generated MySQL DSN targets %s/%s, want %s:%s/%s", parsed.Addr, parsed.DBName, cfg.DBHost, cfg.DBPort, cfg.DBName)
	}
}
