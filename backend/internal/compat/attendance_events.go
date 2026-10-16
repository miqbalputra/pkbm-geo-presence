package compat

import (
	"log"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/auth"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
)

func attendanceEventType(status string) string {
	switch status {
	case "izin":
		return "izin"
	case "sakit":
		return "sakit"
	default:
		return "check_in"
	}
}

func writeAttendanceEvent(h *Handler, attendance models.AttendanceLog, claims *auth.Claims, body map[string]any, eventType string, occurredAt time.Time, verdict string) {
	method := strings.TrimSpace(attendance.Metode)
	if method != "button" && method != "qr_scan" && method != "manual" {
		method = "manual"
	}
	var requestID *string
	if raw := stringValue(body, "request_id", "requestId"); raw != "" {
		if parsed, err := uuid.Parse(raw); err == nil {
			canonical := parsed.String()
			requestID = &canonical
		}
	}
	lat, hasLat := floatValue(body, "latitude")
	lon, hasLon := floatValue(body, "longitude")
	accuracy, hasAccuracy := floatValue(body, "accuracy", "accuracy_meters")
	var actorID *uint
	if claims != nil && claims.UserID > 0 {
		actor := claims.UserID
		actorID = &actor
	}
	var attendanceID *uint
	if attendance.ID > 0 {
		id := attendance.ID
		attendanceID = &id
	}
	event := models.AttendanceEvent{
		AttendanceID:    attendanceID,
		UserID:          attendance.UserID,
		EventType:       eventType,
		Method:          method,
		RequestID:       requestID,
		Latitude:        pointerFloat(lat, hasLat),
		Longitude:       pointerFloat(lon, hasLon),
		AccuracyMeters:  pointerFloat(accuracy, hasAccuracy),
		LocationVerdict: verdict,
		Reason:          pointerString(stringValue(body, "keterangan")),
		ActorUserID:     actorID,
		OccurredAt:      occurredAt,
	}
	if err := h.db.Create(&event).Error; err != nil {
		// Attendance remains authoritative if an older deployment has not yet
		// created the append-only event table; log the gap for reconciliation.
		log.Printf("attendance event write failed for attendance %d: %v", attendance.ID, err)
	}
}
