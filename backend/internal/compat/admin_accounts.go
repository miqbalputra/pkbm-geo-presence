package compat

import (
	"fmt"
	"net/mail"
	"regexp"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/auth"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/httpx"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
)

var legacyUsernamePattern = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)

func legacyAccountEmail(value string) (*string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	parsed, err := mail.ParseAddress(value)
	if err != nil || parsed.Address != value {
		return nil, fmt.Errorf("Format email tidak valid")
	}
	return &value, nil
}

func validateLegacyUsername(value string) error {
	if len(value) < 3 || len(value) > 50 || !legacyUsernamePattern.MatchString(value) {
		return fmt.Errorf("Username harus 3–50 karakter dan hanya berisi huruf, angka, titik, underscore, atau tanda hubung")
	}
	return nil
}

func (h *Handler) adminProfile(c *fiber.Ctx) error {
	claims, err := userClaims(c)
	if err != nil {
		return err
	}
	if c.Method() == fiber.MethodGet {
		var user models.User
		if err := h.db.Select("id, username, nama, email, role").First(&user, claims.UserID).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Data akun berhasil diambil", fiber.Map{"id": user.ID, "username": user.Username, "nama": user.Nama, "email": user.Email, "role": user.Role})
	}
	if c.Method() != fiber.MethodPost || c.Query("action") != "change_credentials" {
		return fiber.ErrMethodNotAllowed
	}
	body, err := readJSON(c)
	if err != nil {
		return invalid(c, err.Error())
	}
	oldPassword := stringValue(body, "passwordLama", "currentPassword")
	newUsername := stringValue(body, "usernameBaru", "newUsername")
	newPassword := stringValue(body, "passwordBaru", "newPassword")
	confirmation := stringValue(body, "konfirmasiBaru", "confirmPassword")
	if oldPassword == "" || newUsername == "" && newPassword == "" {
		return invalid(c, "Password saat ini dan minimal satu perubahan kredensial harus diisi")
	}
	var user models.User
	if err := h.db.First(&user, claims.UserID).Error; err != nil {
		return err
	}
	if err := auth.ComparePassword(user.Password, oldPassword); err != nil {
		return httpx.Error(c, fiber.StatusUnauthorized, "PASSWORD_INVALID", "Password saat ini tidak sesuai")
	}
	updates := map[string]any{}
	if newUsername != "" && newUsername != user.Username {
		if err := validateLegacyUsername(newUsername); err != nil {
			return invalid(c, err.Error())
		}
		var count int64
		if err := h.db.Model(&models.User{}).Where("username = ? AND id <> ?", newUsername, user.ID).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return invalid(c, "Username sudah digunakan")
		}
		updates["username"] = newUsername
	}
	if newPassword != "" {
		if newPassword != confirmation {
			return invalid(c, "Konfirmasi password baru tidak cocok")
		}
		if err := validatePasswordStrength(newPassword); err != nil {
			return invalid(c, err.Error())
		}
		hash, err := auth.HashPassword(newPassword)
		if err != nil {
			return invalid(c, err.Error())
		}
		updates["password"] = hash
	}
	if len(updates) == 0 {
		return invalid(c, "Tidak ada perubahan kredensial")
	}
	if err := h.db.Model(&user).Updates(updates).Error; err != nil {
		return err
	}
	_ = h.db.Model(&models.RefreshToken{}).Where("user_id = ? AND revoked_at IS NULL", user.ID).Update("revoked_at", time.Now().UTC()).Error
	return httpx.Success(c, "Kredensial akun berhasil diperbarui. Silakan masuk kembali.", nil)
}

func validatePasswordStrength(value string) error {
	if len(value) < 8 {
		return fmt.Errorf("Password minimal 8 karakter")
	}
	return nil
}

func (h *Handler) kepalaSekolahAccount(c *fiber.Ctx) error {
	claims, err := userClaims(c)
	if err != nil {
		return err
	}
	if c.Method() == fiber.MethodGet {
		var user models.User
		query := h.db.Select("id, username, nama, email, role").Where("role = ?", "kepala_sekolah").Order("id ASC").First(&user)
		if query.Error != nil && query.Error != gorm.ErrRecordNotFound {
			return query.Error
		}
		if query.Error == gorm.ErrRecordNotFound {
			return httpx.Success(c, "Belum ada akun Kepala Sekolah", nil)
		}
		return httpx.Success(c, "Data akun Kepala Sekolah berhasil diambil", fiber.Map{"id": user.ID, "username": user.Username, "nama": user.Nama, "email": user.Email, "role": user.Role})
	}
	if c.Method() != fiber.MethodPost || c.Query("action") != "save" {
		return fiber.ErrMethodNotAllowed
	}
	body, err := readJSON(c)
	if err != nil {
		return invalid(c, err.Error())
	}
	oldPassword := stringValue(body, "passwordLama", "currentPassword")
	username := stringValue(body, "username")
	name := stringValue(body, "nama")
	if oldPassword == "" || username == "" || name == "" {
		return invalid(c, "Password Admin, username, dan nama Kepala Sekolah harus diisi")
	}
	var admin models.User
	if err := h.db.Where("id = ? AND role = ?", claims.UserID, "admin").First(&admin).Error; err != nil {
		return fiber.ErrForbidden
	}
	if err := auth.ComparePassword(admin.Password, oldPassword); err != nil {
		return httpx.Error(c, fiber.StatusUnauthorized, "PASSWORD_INVALID", "Password Admin saat ini tidak sesuai")
	}
	if err := validateLegacyUsername(username); err != nil {
		return invalid(c, err.Error())
	}
	email, err := legacyAccountEmail(stringValue(body, "email"))
	if err != nil {
		return invalid(c, err.Error())
	}
	var account models.User
	query := h.db.Where("role = ?", "kepala_sekolah").Order("id ASC").First(&account)
	creating := query.Error == gorm.ErrRecordNotFound
	if query.Error != nil && !creating {
		return query.Error
	}
	var duplicate int64
	if err := h.db.Model(&models.User{}).Where("username = ? AND id <> ?", username, account.ID).Count(&duplicate).Error; err != nil {
		return err
	}
	if duplicate > 0 {
		return invalid(c, "Username sudah digunakan. Pilih username lain.")
	}
	newPassword := stringValue(body, "passwordBaru", "newPassword")
	confirmation := stringValue(body, "konfirmasiBaru", "confirmPassword")
	if creating && newPassword == "" {
		return invalid(c, "Password awal Kepala Sekolah wajib diisi")
	}
	updates := map[string]any{"username": username, "nama": name, "email": email}
	if newPassword != "" {
		if newPassword != confirmation {
			return invalid(c, "Konfirmasi password tidak cocok")
		}
		if err := validatePasswordStrength(newPassword); err != nil {
			return invalid(c, err.Error())
		}
		hash, err := auth.HashPassword(newPassword)
		if err != nil {
			return invalid(c, err.Error())
		}
		updates["password"] = hash
	}
	if creating {
		account = models.User{
			Username: username,
			Nama:     name,
			Email:    email,
			Password: updates["password"].(string),
			Role:     "kepala_sekolah",
			TipeGuru: "full_time",
		}
		if err := h.db.Create(&account).Error; err != nil {
			return err
		}
	} else {
		if err := h.db.Model(&account).Updates(updates).Error; err != nil {
			return err
		}
		if _, changedPassword := updates["password"]; changedPassword {
			_ = h.db.Model(&models.RefreshToken{}).Where("user_id = ? AND revoked_at IS NULL", account.ID).Update("revoked_at", time.Now().UTC()).Error
		}
		account.Username, account.Nama, account.Email = username, name, email
	}
	return httpx.Success(c, "Akun Kepala Sekolah berhasil disimpan", fiber.Map{"id": account.ID, "username": account.Username, "nama": account.Nama, "email": account.Email, "role": account.Role})
}
