package config

import (
	"strings"
	"testing"
)

func setProductionConfigEnv(t *testing.T) {
	t.Helper()
	t.Setenv("APP_ENV", "production")
	t.Setenv("APP_TIMEZONE", "Asia/Jakarta")
	t.Setenv("JWT_SECRET", strings.Repeat("s", 48))
	t.Setenv("COOKIE_SECURE", "true")
	t.Setenv("DB_PASS", "staging-db-password")
	t.Setenv("APP_URL", "https://staging.example.test")
	t.Setenv("FRONTEND_ORIGINS", "https://staging.example.test")
	t.Setenv("TURNSTILE_REQUIRED", "false")
	t.Setenv("TURNSTILE_SECRET_KEY", "")
}

func TestInvalidConnectionPoolSettingsAreRejected(t *testing.T) {
	setProductionConfigEnv(t)
	t.Setenv("DB_MAX_OPEN_CONNS", "5")
	t.Setenv("DB_MAX_IDLE_CONNS", "6")
	if _, err := Load(); err == nil {
		t.Fatal("expected idle connections greater than open connections to be rejected")
	}
}

func TestProductionConfigurationAcceptsSecureDefaults(t *testing.T) {
	setProductionConfigEnv(t)
	if _, err := Load(); err != nil {
		t.Fatalf("secure production configuration rejected: %v", err)
	}
}

func TestProductionConfigurationRejectsWeakJWT(t *testing.T) {
	setProductionConfigEnv(t)
	t.Setenv("JWT_SECRET", "too-short")
	if _, err := Load(); err == nil {
		t.Fatal("expected weak JWT secret to be rejected")
	}
}

func TestProductionConfigurationRejectsInsecureCookie(t *testing.T) {
	setProductionConfigEnv(t)
	t.Setenv("COOKIE_SECURE", "false")
	if _, err := Load(); err == nil {
		t.Fatal("expected insecure production cookie to be rejected")
	}
}

func TestProductionConfigurationRequiresDatabasePassword(t *testing.T) {
	setProductionConfigEnv(t)
	t.Setenv("DB_PASS", "")
	if _, err := Load(); err == nil {
		t.Fatal("expected missing production database password to be rejected")
	}
}

func TestStagingConfigurationRequiresSecureSettings(t *testing.T) {
	setProductionConfigEnv(t)
	t.Setenv("APP_ENV", "staging")
	t.Setenv("JWT_SECRET", "too-short")
	if _, err := Load(); err == nil {
		t.Fatal("expected weak staging JWT secret to be rejected")
	}

	t.Setenv("JWT_SECRET", strings.Repeat("s", 48))
	t.Setenv("COOKIE_SECURE", "false")
	if _, err := Load(); err == nil {
		t.Fatal("expected insecure staging cookie to be rejected")
	}
}

func TestSecureConfigurationRequiresHTTPSOrigins(t *testing.T) {
	setProductionConfigEnv(t)
	t.Setenv("APP_URL", "http://staging.example.test")
	if _, err := Load(); err == nil {
		t.Fatal("expected HTTP APP_URL to be rejected in production")
	}

	t.Setenv("APP_URL", "https://staging.example.test")
	t.Setenv("FRONTEND_ORIGINS", "*")
	if _, err := Load(); err == nil {
		t.Fatal("expected wildcard CORS origin to be rejected in production")
	}
}

func TestRequiredTurnstileNeedsSecret(t *testing.T) {
	setProductionConfigEnv(t)
	t.Setenv("TURNSTILE_REQUIRED", "true")
	if _, err := Load(); err == nil {
		t.Fatal("expected required Turnstile without secret to be rejected")
	}
}

func TestRequiredTurnstileNeedsSiteKey(t *testing.T) {
	setProductionConfigEnv(t)
	t.Setenv("TURNSTILE_REQUIRED", "true")
	t.Setenv("TURNSTILE_SECRET_KEY", "turnstile-secret")
	t.Setenv("TURNSTILE_SITE_KEY", "")
	if _, err := Load(); err == nil {
		t.Fatal("expected required Turnstile without site key to be rejected")
	}
}

func TestPartialGowaConfigurationIsRejected(t *testing.T) {
	setProductionConfigEnv(t)
	t.Setenv("GOWA_WEBHOOK_URL", "https://gowa.example.com/send")
	t.Setenv("GOWA_USERNAME", "user")
	if _, err := Load(); err == nil {
		t.Fatal("expected partial GOWA configuration to be rejected")
	}
}

func TestProductionConfigurationRejectsWeakBackupIntegrationKey(t *testing.T) {
	setProductionConfigEnv(t)
	t.Setenv("BACKUP_N8N_API_KEY", "short-key")
	if _, err := Load(); err == nil {
		t.Fatal("expected weak backup integration key to be rejected")
	}
}
