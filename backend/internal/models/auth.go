package models

import "time"

type RefreshToken struct {
	ID         string     `gorm:"column:id;primaryKey;size:36"`
	UserID     uint       `gorm:"column:user_id;index;not null"`
	TokenHash  string     `gorm:"column:token_hash;uniqueIndex;size:64;not null"`
	ExpiresAt  time.Time  `gorm:"column:expires_at;index;not null"`
	RevokedAt  *time.Time `gorm:"column:revoked_at;index"`
	LastUsedAt *time.Time `gorm:"column:last_used_at"`
	UserAgent  string     `gorm:"column:user_agent;size:255"`
	IPAddress  string     `gorm:"column:ip_address;size:45"`
	CreatedAt  time.Time  `gorm:"column:created_at"`
}

func (RefreshToken) TableName() string { return "jwt_refresh_tokens" }

type SecurityEvent struct {
	ID        uint      `gorm:"column:id;primaryKey"`
	Event     string    `gorm:"column:event;size:100;index;not null"`
	UserID    *uint     `gorm:"column:user_id;index"`
	IPAddress string    `gorm:"column:ip_address;size:45"`
	UserAgent string    `gorm:"column:user_agent;size:255"`
	RequestID string    `gorm:"column:request_id;size:100"`
	Details   string    `gorm:"column:details;type:json"`
	CreatedAt time.Time `gorm:"column:created_at;index"`
}

func (SecurityEvent) TableName() string { return "security_events" }
