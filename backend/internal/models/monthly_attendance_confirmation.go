package models

import "time"

// MonthlyAttendanceConfirmation records a teacher's acknowledgement of the
// preceding payroll period. Snapshot stores the report as it appeared at the
// moment of confirmation; attendance data itself remains editable by admin.
type MonthlyAttendanceConfirmation struct {
	ID                    uint       `gorm:"column:id;primaryKey" json:"id"`
	UserID                uint       `gorm:"column:user_id;not null;uniqueIndex:uq_monthly_confirmation_user_period" json:"userId"`
	PeriodStart           time.Time  `gorm:"column:period_start;type:date;not null;uniqueIndex:uq_monthly_confirmation_user_period" json:"periodStart"`
	PeriodEnd             time.Time  `gorm:"column:period_end;type:date;not null" json:"periodEnd"`
	Status                string     `gorm:"column:status;size:32;not null" json:"status"`
	ConfirmedAt           *time.Time `gorm:"column:confirmed_at" json:"confirmedAt,omitempty"`
	ConfirmedByAdminID    *uint      `gorm:"column:confirmed_by_admin_id" json:"confirmedByAdminId,omitempty"`
	CorrectionRequestedAt *time.Time `gorm:"column:correction_requested_at" json:"correctionRequestedAt,omitempty"`
	Snapshot              *string    `gorm:"column:snapshot;type:longtext" json:"-"`
	CreatedAt             time.Time  `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
	UpdatedAt             time.Time  `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
}

func (MonthlyAttendanceConfirmation) TableName() string { return "monthly_attendance_confirmations" }
