package models

import "time"

type AttendanceRevisionRequest struct {
	ID                 uint       `gorm:"column:id;primaryKey" json:"id"`
	UserID             uint       `gorm:"column:user_id;not null;index:idx_attendance_revision_user_created,priority:1" json:"user_id"`
	AttendanceID       *uint      `gorm:"column:attendance_id;index:idx_attendance_revision_attendance_status,priority:1" json:"attendance_id,omitempty"`
	Tanggal            time.Time  `gorm:"column:tanggal;type:date;not null" json:"tanggal"`
	OriginalStatus     string     `gorm:"column:original_status;size:30;not null" json:"original_status"`
	OriginalJamMasuk   *string    `gorm:"column:original_jam_masuk;type:time" json:"original_jam_masuk,omitempty"`
	OriginalJamHadir   *string    `gorm:"column:original_jam_hadir;type:time" json:"original_jam_hadir,omitempty"`
	OriginalJamPulang  *string    `gorm:"column:original_jam_pulang;type:time" json:"original_jam_pulang,omitempty"`
	OriginalKeterangan *string    `gorm:"column:original_keterangan;type:text" json:"original_keterangan,omitempty"`
	ProposedStatus     string     `gorm:"column:proposed_status;size:30;not null" json:"proposed_status"`
	ProposedJamMasuk   *string    `gorm:"column:proposed_jam_masuk;type:time" json:"proposed_jam_masuk,omitempty"`
	ProposedJamPulang  *string    `gorm:"column:proposed_jam_pulang;type:time" json:"proposed_jam_pulang,omitempty"`
	ProposedKeterangan *string    `gorm:"column:proposed_keterangan;type:text" json:"proposed_keterangan,omitempty"`
	Alasan             string     `gorm:"column:alasan;type:text;not null" json:"alasan"`
	Status             string     `gorm:"column:status;size:20;not null;index:idx_attendance_revision_status_created,priority:1" json:"status"`
	AdminNote          *string    `gorm:"column:admin_note;type:text" json:"admin_note,omitempty"`
	ReviewedBy         *uint      `gorm:"column:reviewed_by" json:"reviewed_by,omitempty"`
	ReviewedAt         *time.Time `gorm:"column:reviewed_at" json:"reviewed_at,omitempty"`
	CreatedAt          time.Time  `gorm:"column:created_at;autoCreateTime;index:idx_attendance_revision_user_created,priority:2" json:"created_at"`
	UpdatedAt          time.Time  `gorm:"column:updated_at;autoUpdateTime" json:"updated_at"`
	NamaGuru           string     `gorm:"-" json:"nama_guru,omitempty"`
	IsPokjar           bool       `gorm:"-" json:"-"`
}

func (AttendanceRevisionRequest) TableName() string { return "attendance_revision_requests" }
