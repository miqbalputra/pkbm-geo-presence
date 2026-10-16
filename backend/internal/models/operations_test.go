package models

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestHolidayJSONUsesDateOnlyForDateColumn(t *testing.T) {
	holiday := Holiday{Tanggal: time.Date(2026, time.August, 17, 0, 0, 0, 0, time.FixedZone("WIB", 7*60*60)), Nama: "Hari Kemerdekaan RI"}
	payload, err := json.Marshal(holiday)
	if err != nil {
		t.Fatal(err)
	}
	value := string(payload)
	if !strings.Contains(value, `"tanggal":"2026-08-17"`) {
		t.Fatalf("date-only tanggal missing from payload: %s", value)
	}
	if strings.Contains(value, "2026-08-17T") {
		t.Fatalf("timestamp leaked into date column payload: %s", value)
	}
}
