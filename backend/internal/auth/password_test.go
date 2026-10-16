package auth

import "testing"

func TestComparePasswordSupportsPHPBcryptPrefixes(t *testing.T) {
	hash, err := HashPassword("password-aman-123")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	if err := ComparePassword(hash, "password-aman-123"); err != nil {
		t.Fatalf("compare generated hash: %v", err)
	}
	if err := ComparePassword(hash, "password-salah"); err == nil {
		t.Fatal("expected wrong password to fail")
	}
	phpStyle := "$2y$" + hash[len("$2a$"):]
	if err := ComparePassword(phpStyle, "password-aman-123"); err != nil {
		t.Fatalf("compare PHP hash: %v", err)
	}
}

func TestHashPasswordRejectsWeakPassword(t *testing.T) {
	if _, err := HashPassword("short"); err == nil {
		t.Fatal("expected weak password to fail")
	}
}
