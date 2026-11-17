package models

import "time"

// Each correction stores its own before/after journal in the same transaction
// as attendance updates. Existing attendance and confirmed snapshots stay put.
type AttendanceCorrection struct {
	ID         string     `gorm:"column:id;primaryKey;size:36" json:"id"`
	CreatedBy  uint       `gorm:"column:created_by;not null" json:"created_by"`
	Reason     string     `gorm:"column:reason;type:text;not null" json:"reason"`
	StartDate  string     `gorm:"column:start_date;size:10;not null" json:"start_date"`
	EndDate    string     `gorm:"column:end_date;size:10;not null" json:"end_date"`
	Scope      string     `gorm:"column:scope;size:10;not null" json:"scope"`
	NormalTime string     `gorm:"column:normal_time;size:8;not null" json:"normal_time"`
	Changed    int        `gorm:"column:changed;not null" json:"changed"`
	Snapshot   string     `gorm:"column:snapshot;type:longtext;not null" json:"-"`
	CreatedAt  time.Time  `gorm:"column:created_at;autoCreateTime;index" json:"created_at"`
	UndoneAt   *time.Time `gorm:"column:undone_at" json:"undone_at"`
	UndoneBy   *uint      `gorm:"column:undone_by" json:"undone_by"`
}

func (AttendanceCorrection) TableName() string { return "attendance_corrections" }
