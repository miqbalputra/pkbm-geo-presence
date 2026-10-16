package models

import "time"

type BackupJob struct {
	ID             string     `gorm:"column:id;primaryKey;size:36" json:"id"`
	Kind           string     `gorm:"column:kind;size:16;not null;index" json:"kind"`
	Status         string     `gorm:"column:status;size:16;not null;index" json:"status"`
	Source         string     `gorm:"column:source;size:16;not null" json:"source"`
	RequestedBy    *uint      `gorm:"column:requested_by;index" json:"requested_by,omitempty"`
	IdempotencyKey *string    `gorm:"column:idempotency_key;size:255;uniqueIndex" json:"-"`
	FileName       *string    `gorm:"column:file_name;size:255" json:"file_name,omitempty"`
	FilePath       *string    `gorm:"column:file_path;size:1024" json:"-"`
	FileSize       int64      `gorm:"column:file_size" json:"file_size"`
	SHA256         *string    `gorm:"column:sha256;size:64" json:"sha256,omitempty"`
	ManifestJSON   *string    `gorm:"column:manifest_json;type:json" json:"manifest,omitempty"`
	ErrorCode      *string    `gorm:"column:error_code;size:80" json:"error_code,omitempty"`
	ErrorMessage   *string    `gorm:"column:error_message;type:text" json:"error_message,omitempty"`
	RequestedAt    time.Time  `gorm:"column:requested_at;index" json:"requested_at"`
	StartedAt      *time.Time `gorm:"column:started_at" json:"started_at,omitempty"`
	FinishedAt     *time.Time `gorm:"column:finished_at" json:"finished_at,omitempty"`
	ExpiresAt      time.Time  `gorm:"column:expires_at;index" json:"expires_at"`
	CreatedAt      time.Time  `gorm:"column:created_at" json:"created_at"`
	UpdatedAt      time.Time  `gorm:"column:updated_at" json:"updated_at"`
}

func (BackupJob) TableName() string { return "backup_jobs" }

type BackupRestoreJob struct {
	ID               string     `gorm:"column:id;primaryKey;size:36" json:"id"`
	BackupJobID      string     `gorm:"column:backup_job_id;size:36;index;not null" json:"backup_job_id"`
	Status           string     `gorm:"column:status;size:20;not null;index" json:"status"`
	RequestedBy      uint       `gorm:"column:requested_by;index;not null" json:"requested_by"`
	PreRestoreBackup *string    `gorm:"column:pre_restore_backup_id;size:36" json:"pre_restore_backup_id,omitempty"`
	Confirmation     string     `gorm:"column:confirmation_phrase;size:255;not null" json:"-"`
	ErrorCode        *string    `gorm:"column:error_code;size:80" json:"error_code,omitempty"`
	ErrorMessage     *string    `gorm:"column:error_message;type:text" json:"error_message,omitempty"`
	StartedAt        *time.Time `gorm:"column:started_at" json:"started_at,omitempty"`
	FinishedAt       *time.Time `gorm:"column:finished_at" json:"finished_at,omitempty"`
	CreatedAt        time.Time  `gorm:"column:created_at" json:"created_at"`
	UpdatedAt        time.Time  `gorm:"column:updated_at" json:"updated_at"`
}

func (BackupRestoreJob) TableName() string { return "backup_restore_jobs" }

type MaintenanceState struct {
	ID           uint      `gorm:"column:id;primaryKey" json:"id"`
	Enabled      bool      `gorm:"column:enabled" json:"enabled"`
	Reason       string    `gorm:"column:reason;size:255" json:"reason"`
	RestoreJobID *string   `gorm:"column:restore_job_id;size:36" json:"restore_job_id,omitempty"`
	UpdatedAt    time.Time `gorm:"column:updated_at" json:"updated_at"`
}

func (MaintenanceState) TableName() string { return "maintenance_state" }

type BackupUpload struct {
	ID             string    `gorm:"column:id;primaryKey;size:36" json:"id"`
	FileName       string    `gorm:"column:file_name;size:255;not null" json:"file_name"`
	FilePath       string    `gorm:"column:file_path;size:1024;not null" json:"-"`
	ExpectedSize   int64     `gorm:"column:expected_size;not null" json:"expected_size"`
	ReceivedSize   int64     `gorm:"column:received_size;not null" json:"received_size"`
	ExpectedSHA256 *string   `gorm:"column:expected_sha256;size:64" json:"expected_sha256,omitempty"`
	Status         string    `gorm:"column:status;size:16;not null;index" json:"status"`
	RequestedBy    uint      `gorm:"column:requested_by;index;not null" json:"requested_by"`
	ExpiresAt      time.Time `gorm:"column:expires_at;index" json:"expires_at"`
	CreatedAt      time.Time `gorm:"column:created_at" json:"created_at"`
	UpdatedAt      time.Time `gorm:"column:updated_at" json:"updated_at"`
}

func (BackupUpload) TableName() string { return "backup_uploads" }
