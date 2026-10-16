package auth

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/config"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/httpx"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
)

type Handler struct {
	db  *gorm.DB
	cfg config.Config
	jwt *JWTManager
}

func NewHandler(db *gorm.DB, cfg config.Config, manager *JWTManager) *Handler {
	return &Handler{db: db, cfg: cfg, jwt: manager}
}

type loginRequest struct {
	Username       string `json:"username"`
	Password       string `json:"password"`
	TurnstileToken string `json:"turnstileToken"`
}

type googleLoginRequest struct {
	Credential     string `json:"credential"`
	TurnstileToken string `json:"turnstileToken"`
}

func (h *Handler) RegisterRoutes(api fiber.Router) {
	auth := api.Group("/auth")
	auth.Post("/login", limiter.New(limiter.Config{Max: 10, Expiration: 5 * time.Minute, KeyGenerator: func(c *fiber.Ctx) string { return c.IP() }, LimitReached: authRateLimitResponse}), h.login)
	auth.Post("/google", limiter.New(limiter.Config{Max: 20, Expiration: 5 * time.Minute, KeyGenerator: func(c *fiber.Ctx) string { return c.IP() }, LimitReached: authRateLimitResponse}), h.googleLogin)
	auth.Post("/refresh", h.refresh)
	auth.Post("/logout", h.logout)
	auth.Get("/me", RequireActiveUser(h.db, h.jwt), h.me)
}

// RegisterLegacyRoutes keeps installed PWA versions from before the Go-stack
// migration usable while their service worker replaces the old asset bundle.
// It is intentionally limited to the previous auth.php contract.
func (h *Handler) RegisterLegacyRoutes(app fiber.Router) {
	app.All("/api/auth.php", limiter.New(limiter.Config{Max: 10, Expiration: 5 * time.Minute, KeyGenerator: func(c *fiber.Ctx) string { return c.IP() }, LimitReached: authRateLimitResponse}), h.legacyAuth)
}

func authRateLimitResponse(c *fiber.Ctx) error {
	return httpx.Error(c, fiber.StatusTooManyRequests, "RATE_LIMITED", "Terlalu banyak percobaan login. Silakan tunggu beberapa menit sebelum mencoba lagi.")
}

func (h *Handler) login(c *fiber.Ctx) error {
	user, err := h.authenticatePassword(c)
	if err != nil {
		return err
	}
	if user == nil {
		return nil
	}
	return h.createSession(c, *user, "login_success")
}

func (h *Handler) authenticatePassword(c *fiber.Ctx) (*models.User, error) {
	var input loginRequest
	if err := c.BodyParser(&input); err != nil || strings.TrimSpace(input.Username) == "" || input.Password == "" {
		return nil, httpx.Error(c, fiber.StatusBadRequest, "VALIDATION_ERROR", "Username dan password harus diisi")
	}
	if err := h.verifyTurnstile(input.TurnstileToken, c.IP()); err != nil {
		h.recordEvent(c, "login_turnstile_failed", nil, map[string]any{"username": input.Username})
		return nil, httpx.Error(c, fiber.StatusForbidden, "TURNSTILE_FAILED", err.Error())
	}

	var user models.User
	if err := h.db.Where("username = ?", strings.TrimSpace(input.Username)).First(&user).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			h.recordEvent(c, "login_failed", nil, map[string]any{"username": input.Username})
			return nil, httpx.Error(c, fiber.StatusUnauthorized, "INVALID_CREDENTIALS", "Username atau password salah")
		}
		return nil, err
	}
	if user.ArchivedAt != nil {
		return nil, httpx.Error(c, fiber.StatusForbidden, "ACCOUNT_ARCHIVED", "Akun sudah diarsipkan")
	}
	if err := ComparePassword(user.Password, input.Password); err != nil {
		h.recordEvent(c, "login_failed", &user.ID, map[string]any{"username": user.Username})
		return nil, httpx.Error(c, fiber.StatusUnauthorized, "INVALID_CREDENTIALS", "Username atau password salah")
	}
	return &user, nil
}

func (h *Handler) legacyAuth(c *fiber.Ctx) error {
	switch c.Query("action") {
	case "login":
		if c.Method() != fiber.MethodPost {
			return httpx.Error(c, fiber.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Gunakan POST untuk login")
		}
		user, err := h.authenticatePassword(c)
		if err != nil {
			return err
		}
		if user == nil {
			return nil
		}
		access, expiresAt, err := h.startSession(c, *user, "legacy_login_success")
		if err != nil {
			return err
		}
		h.setLegacyAccessCookie(c, access, time.Until(expiresAt))
		return httpx.Success(c, "Login berhasil", user.Public())
	case "logout":
		if c.Method() != fiber.MethodPost {
			return httpx.Error(c, fiber.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Gunakan POST untuk logout")
		}
		return h.logout(c)
	case "check":
		if c.Method() != fiber.MethodGet {
			return httpx.Error(c, fiber.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Gunakan GET untuk cek sesi")
		}
		claims, err := parseBearerClaims(c, h.jwt)
		if err != nil {
			return fiber.ErrUnauthorized
		}
		var user models.User
		if err := h.db.Select("id", "username", "role", "archived_at").Where("id = ?", claims.UserID).First(&user).Error; err != nil || user.ArchivedAt != nil || user.Role != claims.Role {
			return fiber.ErrUnauthorized
		}
		return httpx.Success(c, "Session aktif", fiber.Map{"user_id": user.ID, "username": user.Username, "role": user.Role})
	default:
		return httpx.Error(c, fiber.StatusNotFound, "NOT_FOUND", "Endpoint lama tidak dikenali")
	}
}

func (h *Handler) googleLogin(c *fiber.Ctx) error {
	var input googleLoginRequest
	if err := c.BodyParser(&input); err != nil || strings.TrimSpace(input.Credential) == "" {
		return httpx.Error(c, fiber.StatusBadRequest, "VALIDATION_ERROR", "Credential Google tidak ditemukan")
	}
	if h.cfg.GoogleClientID == "" {
		return httpx.Error(c, fiber.StatusServiceUnavailable, "GOOGLE_NOT_CONFIGURED", "Login Google belum dikonfigurasi")
	}
	if err := h.verifyTurnstile(input.TurnstileToken, c.IP()); err != nil {
		return httpx.Error(c, fiber.StatusForbidden, "TURNSTILE_FAILED", err.Error())
	}

	googleUser, err := verifyGoogleCredential(input.Credential, h.cfg.GoogleClientID)
	if err != nil {
		h.recordEvent(c, "google_login_failed", nil, map[string]any{"reason": err.Error()})
		return httpx.Error(c, fiber.StatusUnauthorized, "GOOGLE_TOKEN_INVALID", "Token Google tidak valid")
	}

	var user models.User
	query := h.db.Where("google_id = ?", googleUser.Subject).First(&user)
	if query.Error == gorm.ErrRecordNotFound {
		query = h.db.Where("LOWER(email) = ?", strings.ToLower(googleUser.Email)).First(&user)
		if query.Error == nil {
			if err := h.db.Model(&user).Updates(map[string]any{"google_id": googleUser.Subject}).Error; err != nil {
				return err
			}
		}
	}
	if query.Error != nil {
		if query.Error == gorm.ErrRecordNotFound {
			return httpx.Error(c, fiber.StatusForbidden, "GOOGLE_ACCOUNT_NOT_LINKED", "Akun Google belum ditautkan oleh admin")
		}
		return query.Error
	}
	if user.ArchivedAt != nil || !contains([]string{"guru", "kepala_sekolah", "admin"}, user.Role) {
		return httpx.Error(c, fiber.StatusForbidden, "GOOGLE_ROLE_NOT_ALLOWED", "Role akun tidak diizinkan login dengan Google")
	}
	return h.createSession(c, user, "google_login_success")
}

func (h *Handler) me(c *fiber.Ctx) error {
	claims := c.Locals("authClaims").(*Claims)
	var user models.User
	if err := h.db.First(&user, claims.UserID).Error; err != nil {
		return fiber.ErrUnauthorized
	}
	if user.ArchivedAt != nil {
		return fiber.ErrUnauthorized
	}
	return httpx.Success(c, "Session aktif", user.Public())
}

func (h *Handler) refresh(c *fiber.Ctx) error {
	raw := c.Cookies("gp_refresh")
	if raw == "" {
		return httpx.Error(c, fiber.StatusUnauthorized, "REFRESH_REQUIRED", "Refresh token tidak ditemukan")
	}
	tx := h.db.Begin()
	if tx.Error != nil {
		return tx.Error
	}
	var stored models.RefreshToken
	// Lock the token row before checking/revoking it. This makes rotation
	// single-use even when two refresh requests arrive concurrently.
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("token_hash = ? AND revoked_at IS NULL AND expires_at > ?", HashRefreshToken(raw), time.Now().UTC()).First(&stored).Error; err != nil {
		tx.Rollback()
		return httpx.Error(c, fiber.StatusUnauthorized, "REFRESH_INVALID", "Refresh token tidak berlaku")
	}
	var user models.User
	if err := tx.First(&user, stored.UserID).Error; err != nil || user.ArchivedAt != nil {
		tx.Rollback()
		return httpx.Error(c, fiber.StatusUnauthorized, "SESSION_INVALID", "Akun tidak dapat memulihkan session")
	}

	now := time.Now().UTC()
	if err := tx.Model(&stored).Updates(map[string]any{"revoked_at": now, "last_used_at": now}).Error; err != nil {
		tx.Rollback()
		return err
	}
	access, expiresAt, err := h.jwt.IssueAccess(user)
	if err != nil {
		tx.Rollback()
		return err
	}
	newRefresh, err := randomToken(48)
	if err != nil {
		tx.Rollback()
		return err
	}
	newStored := models.RefreshToken{ID: uuid.NewString(), UserID: user.ID, TokenHash: HashRefreshToken(newRefresh), ExpiresAt: now.Add(h.cfg.JWTRefreshTTL), UserAgent: truncate(c.Get(fiber.HeaderUserAgent), 255), IPAddress: truncate(c.IP(), 45)}
	if err := tx.Create(&newStored).Error; err != nil {
		tx.Rollback()
		return err
	}
	if err := tx.Commit().Error; err != nil {
		return err
	}
	h.setRefreshCookie(c, newRefresh, h.cfg.JWTRefreshTTL)
	h.recordEvent(c, "refresh_success", &user.ID, nil)
	return httpx.Success(c, "Token diperbarui", fiber.Map{"accessToken": access, "tokenType": "Bearer", "expiresAt": expiresAt, "user": user.Public()})
}

func (h *Handler) logout(c *fiber.Ctx) error {
	if raw := c.Cookies("gp_refresh"); raw != "" {
		now := time.Now().UTC()
		_ = h.db.Model(&models.RefreshToken{}).Where("token_hash = ? AND revoked_at IS NULL", HashRefreshToken(raw)).Updates(map[string]any{"revoked_at": now}).Error
	}
	h.clearRefreshCookie(c)
	h.clearLegacyAccessCookie(c)
	return httpx.Success(c, "Logout berhasil", nil)
}

func (h *Handler) createSession(c *fiber.Ctx, user models.User, event string) error {
	access, expiresAt, err := h.startSession(c, user, event)
	if err != nil {
		return err
	}
	return httpx.Success(c, "Login berhasil", fiber.Map{"accessToken": access, "tokenType": "Bearer", "expiresAt": expiresAt, "user": user.Public()})
}

func (h *Handler) startSession(c *fiber.Ctx, user models.User, event string) (string, time.Time, error) {
	access, expiresAt, err := h.jwt.IssueAccess(user)
	if err != nil {
		return "", time.Time{}, err
	}
	refresh, err := randomToken(48)
	if err != nil {
		return "", time.Time{}, err
	}
	stored := models.RefreshToken{ID: uuid.NewString(), UserID: user.ID, TokenHash: HashRefreshToken(refresh), ExpiresAt: time.Now().UTC().Add(h.cfg.JWTRefreshTTL), UserAgent: truncate(c.Get(fiber.HeaderUserAgent), 255), IPAddress: truncate(c.IP(), 45)}
	if err := h.db.Create(&stored).Error; err != nil {
		return "", time.Time{}, err
	}
	h.setRefreshCookie(c, refresh, h.cfg.JWTRefreshTTL)
	h.recordEvent(c, event, &user.ID, nil)
	return access, expiresAt, nil
}

func (h *Handler) setRefreshCookie(c *fiber.Ctx, value string, ttl time.Duration) {
	maxAge := int(ttl.Seconds())
	c.Cookie(&fiber.Cookie{Name: "gp_refresh", Value: value, Path: "/", Domain: h.cfg.CookieDomain, MaxAge: maxAge, HTTPOnly: true, Secure: h.cfg.CookieSecure, SameSite: "Lax"})
}

func (h *Handler) clearRefreshCookie(c *fiber.Ctx) {
	c.Cookie(&fiber.Cookie{Name: "gp_refresh", Value: "", Path: "/", Domain: h.cfg.CookieDomain, MaxAge: -1, HTTPOnly: true, Secure: h.cfg.CookieSecure, SameSite: "Lax"})
}

// Only legacy auth.php clients receive this short-lived access cookie. Modern
// clients keep using the Authorization header plus the HttpOnly refresh token.
func (h *Handler) setLegacyAccessCookie(c *fiber.Ctx, value string, ttl time.Duration) {
	maxAge := int(ttl.Seconds())
	if maxAge < 1 {
		maxAge = 1
	}
	c.Cookie(&fiber.Cookie{Name: "gp_legacy_access", Value: value, Path: "/api", Domain: h.cfg.CookieDomain, MaxAge: maxAge, HTTPOnly: true, Secure: h.cfg.CookieSecure, SameSite: "Lax"})
}

func (h *Handler) clearLegacyAccessCookie(c *fiber.Ctx) {
	c.Cookie(&fiber.Cookie{Name: "gp_legacy_access", Value: "", Path: "/api", Domain: h.cfg.CookieDomain, MaxAge: -1, HTTPOnly: true, Secure: h.cfg.CookieSecure, SameSite: "Lax"})
}

func (h *Handler) verifyTurnstile(token, ip string) error {
	if h.cfg.TurnstileSecretKey == "" {
		if h.cfg.TurnstileRequired {
			return fmt.Errorf("verifikasi anti-bot wajib dikonfigurasi")
		}
		return nil
	}
	if strings.TrimSpace(token) == "" {
		return fmt.Errorf("verifikasi anti-bot diperlukan")
	}
	form := url.Values{"secret": {h.cfg.TurnstileSecretKey}, "response": {token}, "remoteip": {ip}}
	req, err := http.NewRequest(http.MethodPost, "https://challenges.cloudflare.com/turnstile/v0/siteverify", strings.NewReader(form.Encode()))
	if err != nil {
		return fmt.Errorf("gagal menyiapkan verifikasi anti-bot")
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("gagal memverifikasi anti-bot")
	}
	defer resp.Body.Close()
	var result struct {
		Success bool `json:"success"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil || !result.Success {
		return fmt.Errorf("verifikasi anti-bot gagal")
	}
	return nil
}

type googleCredential struct {
	Subject       string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified string `json:"email_verified"`
	Audience      string `json:"aud"`
	Issuer        string `json:"iss"`
	Expires       string `json:"exp"`
}

func verifyGoogleCredential(credential, clientID string) (googleCredential, error) {
	endpoint := "https://oauth2.googleapis.com/tokeninfo?id_token=" + url.QueryEscape(credential)
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Get(endpoint)
	if err != nil {
		return googleCredential{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return googleCredential{}, fmt.Errorf("google returned %d", resp.StatusCode)
	}
	var payload googleCredential
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return googleCredential{}, err
	}
	if payload.Subject == "" || payload.Email == "" || payload.Audience != clientID || (payload.Issuer != "accounts.google.com" && payload.Issuer != "https://accounts.google.com") || payload.EmailVerified != "true" {
		return googleCredential{}, fmt.Errorf("claims google tidak sesuai")
	}
	exp, err := strconv.ParseInt(payload.Expires, 10, 64)
	if err != nil || exp <= time.Now().Unix() {
		return googleCredential{}, fmt.Errorf("token google expired")
	}
	return payload, nil
}

func (h *Handler) recordEvent(c *fiber.Ctx, event string, userID *uint, details map[string]any) {
	encoded := "{}"
	if details != nil {
		if raw, err := json.Marshal(details); err == nil {
			encoded = string(raw)
		}
	}
	_ = h.db.Create(&models.SecurityEvent{Event: event, UserID: userID, IPAddress: truncate(c.IP(), 45), UserAgent: truncate(c.Get(fiber.HeaderUserAgent), 255), RequestID: c.Get("X-Request-ID"), Details: encoded}).Error
}

func randomToken(bytes int) (string, error) {
	buffer := make([]byte, bytes)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}

func truncate(value string, max int) string {
	if len(value) <= max {
		return value
	}
	return value[:max]
}

func contains(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}
