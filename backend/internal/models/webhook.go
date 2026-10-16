package models

import "time"

type WebhookConfig struct {
	ID           uint      `gorm:"column:id;primaryKey" json:"id"`
	Enabled      bool      `gorm:"column:enabled" json:"enabled"`
	N8NWebhookURL string   `gorm:"column:n8n_webhook_url" json:"n8n_webhook_url"`
	AdminPhone   string    `gorm:"column:admin_phone" json:"admin_phone"`
	CreatedAt    time.Time `gorm:"column:created_at" json:"created_at"`
	UpdatedAt    time.Time `gorm:"column:updated_at" json:"updated_at"`
}

func (WebhookConfig) TableName() string { return "webhook_config" }

type WebhookLog struct {
	ID           uint      `gorm:"column:id;primaryKey" json:"id"`
	ReminderType string    `gorm:"column:reminder_type" json:"reminder_type"`
	TotalGuru    int       `gorm:"column:total_guru" json:"total_guru"`
	Status       string    `gorm:"column:status" json:"status"`
	Response     string    `gorm:"column:response" json:"response"`
	CreatedAt    time.Time `gorm:"column:created_at" json:"created_at"`
}

func (WebhookLog) TableName() string { return "webhook_logs" }
