package compat

import "testing"

func TestVisibleSettingsHidesPrivateQRValuesForNonAdmin(t *testing.T) {
	settings := map[string]string{
		"qr_secret":       "private",
		"qr_active_nonce": "nonce",
		"qr_expires_at":   "expiry",
		"radius_gps":      "100",
	}

	visible := visibleSettings(settings, "guru")
	for _, key := range []string{"qr_secret", "qr_active_nonce", "qr_expires_at"} {
		if _, ok := visible[key]; ok {
			t.Fatalf("private setting %q leaked to non-admin response", key)
		}
	}
	if visible["radius_gps"] != "100" {
		t.Fatalf("expected non-private setting to remain visible")
	}
	if visibleSettings(settings, "admin")["qr_secret"] != "private" {
		t.Fatalf("admin should retain access to QR secret setting")
	}
}
