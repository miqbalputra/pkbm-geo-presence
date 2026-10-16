package auth

import (
	"fmt"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

func ComparePassword(hash, password string) error {
	// PHP password_hash may use the $2y$ prefix. Go's bcrypt verifier accepts
	// the same bcrypt format after normalizing the equivalent compatibility prefix.
	if strings.HasPrefix(hash, "$2y$") {
		hash = "$2a$" + strings.TrimPrefix(hash, "$2y$")
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}

func HashPassword(password string) (string, error) {
	if len(password) < 8 {
		return "", fmt.Errorf("password minimal 8 karakter")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(hash), err
}
