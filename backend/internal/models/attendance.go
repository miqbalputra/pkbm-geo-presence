package models

import "time"

type AttendanceLog struct {
	ID                      uint      `gorm:"column:id;primaryKey" json:"id"`
	UserID                  uint      `gorm:"column:user_id;index" json:"user_id"`
	Nama                    string    `gorm:"column:nama" json:"nama"`
	Tanggal                 time.Time `gorm:"column:tanggal;type:date;index" json:"tanggal"`
	Status                  string    `gorm:"column:status" json:"status"`
	JamMasuk                *string   `gorm:"column:jam_masuk" json:"jam_masuk,omitempty"`
	JamPulang               *string   `gorm:"column:jam_pulang" json:"jam_pulang,omitempty"`
	JamHadir                *string   `gorm:"column:jam_hadir" json:"jam_hadir,omitempty"`
	JamIzin                 *string   `gorm:"column:jam_izin" json:"jam_izin,omitempty"`
	JamSakit                *string   `gorm:"column:jam_sakit" json:"jam_sakit,omitempty"`
	Keterangan              *string   `gorm:"column:keterangan" json:"keterangan,omitempty"`
	Latitude                *float64  `gorm:"column:latitude;type:decimal(10,8)" json:"latitude,omitempty"`
	Longitude               *float64  `gorm:"column:longitude;type:decimal(11,8)" json:"longitude,omitempty"`
	CheckinAccuracyMeters   *float64  `gorm:"column:checkin_accuracy_meters;type:decimal(8,2)" json:"checkin_accuracy_meters,omitempty"`
	CheckoutLatitude        *float64  `gorm:"column:checkout_latitude;type:decimal(10,8)" json:"checkout_latitude,omitempty"`
	CheckoutLongitude       *float64  `gorm:"column:checkout_longitude;type:decimal(11,8)" json:"checkout_longitude,omitempty"`
	CheckoutAccuracyMeters  *float64  `gorm:"column:checkout_accuracy_meters;type:decimal(8,2)" json:"checkout_accuracy_meters,omitempty"`
	CheckoutDistanceMeters  *int      `gorm:"column:checkout_distance_meters" json:"checkout_distance_meters,omitempty"`
	CheckoutLocationVerdict *string   `gorm:"column:checkout_location_verdict" json:"checkout_location_verdict,omitempty"`
	Metode                  string    `gorm:"column:metode" json:"metode"`
	LokasiPulang            *string   `gorm:"column:lokasi_pulang" json:"lokasi_pulang,omitempty"`
	QRNonce                 *string   `gorm:"column:qr_nonce" json:"-"`
	CreatedAt               time.Time `gorm:"column:created_at" json:"created_at"`
	UpdatedAt               time.Time `gorm:"column:updated_at" json:"updated_at"`
}

func (AttendanceLog) TableName() string { return "attendance_logs" }

func (a AttendanceLog) Public() map[string]any {
	return map[string]any{
		"id":                        a.ID,
		"user_id":                   a.UserID,
		"userId":                    a.UserID,
		"nama":                      a.Nama,
		"tanggal":                   formatDate(a.Tanggal),
		"status":                    a.Status,
		"jam_masuk":                 a.JamMasuk,
		"jamMasuk":                  a.JamMasuk,
		"jam_pulang":                a.JamPulang,
		"jamPulang":                 a.JamPulang,
		"jam_hadir":                 a.JamHadir,
		"jamHadir":                  a.JamHadir,
		"jam_izin":                  a.JamIzin,
		"jamIzin":                   a.JamIzin,
		"jam_sakit":                 a.JamSakit,
		"jamSakit":                  a.JamSakit,
		"keterangan":                a.Keterangan,
		"latitude":                  a.Latitude,
		"longitude":                 a.Longitude,
		"checkin_accuracy_meters":   a.CheckinAccuracyMeters,
		"checkout_latitude":         a.CheckoutLatitude,
		"checkout_longitude":        a.CheckoutLongitude,
		"checkout_accuracy_meters":  a.CheckoutAccuracyMeters,
		"checkout_distance_meters":  a.CheckoutDistanceMeters,
		"checkout_location_verdict": a.CheckoutLocationVerdict,
		"metode":                    a.Metode,
		"lokasi_pulang":             a.LokasiPulang,
		"lokasiPulang":              a.LokasiPulang,
		"created_at":                a.CreatedAt,
		"updated_at":                a.UpdatedAt,
	}
}

// AttendanceEvent is the append-only audit record for check-in/out actions.
// It intentionally coexists with attendance_logs, the daily summary row.
type AttendanceEvent struct {
	ID              uint      `gorm:"column:id;primaryKey" json:"id"`
	AttendanceID    *uint     `gorm:"column:attendance_id;index" json:"attendance_id,omitempty"`
	UserID          uint      `gorm:"column:user_id;index" json:"user_id"`
	EventType       string    `gorm:"column:event_type" json:"event_type"`
	Method          string    `gorm:"column:method" json:"method"`
	RequestID       *string   `gorm:"column:request_id" json:"request_id,omitempty"`
	Latitude        *float64  `gorm:"column:latitude" json:"latitude,omitempty"`
	Longitude       *float64  `gorm:"column:longitude" json:"longitude,omitempty"`
	AccuracyMeters  *float64  `gorm:"column:accuracy_meters" json:"accuracy_meters,omitempty"`
	DistanceMeters  *int      `gorm:"column:distance_meters" json:"distance_meters,omitempty"`
	LocationVerdict string    `gorm:"column:location_verdict" json:"location_verdict"`
	Reason          *string   `gorm:"column:reason" json:"reason,omitempty"`
	ActorUserID     *uint     `gorm:"column:actor_user_id" json:"actor_user_id,omitempty"`
	OccurredAt      time.Time `gorm:"column:occurred_at" json:"occurred_at"`
	CreatedAt       time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

func (AttendanceEvent) TableName() string { return "attendance_events" }

func formatDate(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.Format("2006-01-02")
}

type ActivityLog struct {
	ID uint `gorm:"column:id;primaryKey" json:"id"`
	// Waktu must be populated by GORM when callers omit it. Without this tag,
	// MySQL strict mode can reject the zero timestamp and roll back an
	// otherwise valid attendance write when its audit log is created.
	Waktu     time.Time `gorm:"column:waktu;autoCreateTime;index" json:"waktu"`
	User      string    `gorm:"column:user" json:"user"`
	Aktivitas string    `gorm:"column:aktivitas" json:"aktivitas"`
	Status    string    `gorm:"column:status" json:"status"`
}

func (ActivityLog) TableName() string { return "activity_logs" }

type LocationTrack struct {
	ID             uint      `gorm:"column:id;primaryKey" json:"id"`
	UserID         uint      `gorm:"column:user_id;index" json:"user_id"`
	AttendanceID   *uint     `gorm:"column:attendance_id;index" json:"attendance_id,omitempty"`
	Tanggal        time.Time `gorm:"column:tanggal;type:date;index" json:"tanggal"`
	Latitude       float64   `gorm:"column:latitude" json:"latitude"`
	Longitude      float64   `gorm:"column:longitude" json:"longitude"`
	AccuracyMeters *float64  `gorm:"column:accuracy_meters" json:"accuracy_meters,omitempty"`
	Source         string    `gorm:"column:source" json:"source"`
	UserAgent      string    `gorm:"column:user_agent" json:"user_agent"`
	RecordedAt     time.Time `gorm:"column:recorded_at" json:"recorded_at"`
}

func (LocationTrack) TableName() string { return "location_tracks" }
