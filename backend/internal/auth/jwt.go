package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/config"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
)

type Claims struct {
	UserID uint   `json:"uid"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

type JWTManager struct {
	secret    []byte
	issuer    string
	audience  string
	accessTTL time.Duration
}

func NewJWTManager(cfg config.Config) *JWTManager {
	return &JWTManager{
		secret:    []byte(cfg.JWTSecret),
		issuer:    cfg.JWTIssuer,
		audience:  cfg.JWTAudience,
		accessTTL: cfg.JWTAccessTTL,
	}
}

func (m *JWTManager) IssueAccess(user models.User) (string, time.Time, error) {
	now := time.Now().UTC()
	expiresAt := now.Add(m.accessTTL)
	claims := Claims{
		UserID: user.ID,
		Role:   user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    m.issuer,
			Subject:   fmt.Sprint(user.ID),
			Audience:  jwt.ClaimStrings{m.audience},
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ID:        fmt.Sprintf("access-%d", now.UnixNano()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(m.secret)
	return signed, expiresAt, err
}

func (m *JWTManager) ParseAccess(raw string) (*Claims, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, fmt.Errorf("token kosong")
	}
	parsed, err := jwt.ParseWithClaims(raw, &Claims{}, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("algoritma token tidak diizinkan")
		}
		return m.secret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := parsed.Claims.(*Claims)
	if !ok || !parsed.Valid {
		return nil, fmt.Errorf("token tidak valid")
	}
	if claims.Issuer != m.issuer || !hasAudience(claims.Audience, m.audience) || claims.UserID == 0 {
		return nil, fmt.Errorf("claims token tidak valid")
	}
	return claims, nil
}

func hasAudience(aud jwt.ClaimStrings, wanted string) bool {
	for _, value := range aud {
		if value == wanted {
			return true
		}
	}
	return false
}

func RequireAuth(manager *JWTManager) fiber.Handler {
	return func(c *fiber.Ctx) error {
		claims, err := parseBearerClaims(c, manager)
		if err != nil {
			return fiber.ErrUnauthorized
		}
		c.Locals("authClaims", claims)
		return c.Next()
	}
}

// RequireActiveUser validates the signed token and confirms that the account
// still exists, is not archived, and retains the role in the token. This
// prevents an access token from surviving an archive or role change until its
// normal expiry.
func RequireActiveUser(db *gorm.DB, manager *JWTManager) fiber.Handler {
	return func(c *fiber.Ctx) error {
		claims, err := parseBearerClaims(c, manager)
		if err != nil {
			return fiber.ErrUnauthorized
		}
		c.Locals("authClaims", claims)
		var user models.User
		if err := db.Select("id", "role", "archived_at").Where("id = ?", claims.UserID).First(&user).Error; err != nil {
			return fiber.ErrUnauthorized
		}
		if user.ArchivedAt != nil || user.Role != claims.Role {
			return fiber.ErrUnauthorized
		}
		return c.Next()
	}
}

func parseBearerClaims(c *fiber.Ctx, manager *JWTManager) (*Claims, error) {
	header := strings.TrimSpace(c.Get(fiber.HeaderAuthorization))
	if header != "" {
		if !strings.HasPrefix(strings.ToLower(header), "bearer ") {
			return nil, fiber.ErrUnauthorized
		}

		return manager.ParseAccess(strings.TrimSpace(header[7:]))
	}

	// Short-lived compatibility cookie for installed pre-migration PWAs. It is
	// HttpOnly, Secure in production, SameSite=Lax, and scoped to /api.
	return manager.ParseAccess(c.Cookies("gp_legacy_access"))
}

func RequireRoles(roles ...string) fiber.Handler {
	allowed := make(map[string]struct{}, len(roles))
	for _, role := range roles {
		allowed[role] = struct{}{}
	}
	return func(c *fiber.Ctx) error {
		claims, ok := c.Locals("authClaims").(*Claims)
		if !ok || claims == nil {
			return fiber.ErrUnauthorized
		}
		if _, ok := allowed[claims.Role]; !ok {
			return fiber.ErrForbidden
		}
		return c.Next()
	}
}

func HashRefreshToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
