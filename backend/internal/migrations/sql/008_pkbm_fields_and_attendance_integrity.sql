-- PKBM Tunas Ilmu compatibility fields and immutable attendance event ledger.
-- Existing IDs and rows are preserved; missing columns are added by the
-- idempotent ensureLegacyUserColumns() step after the numbered migrations.
CREATE TABLE IF NOT EXISTS `attendance_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `attendance_id` INT DEFAULT NULL,
  `user_id` INT NOT NULL,
  `event_type` VARCHAR(30) NOT NULL,
  `method` VARCHAR(30) NOT NULL DEFAULT 'button',
  `request_id` CHAR(36) DEFAULT NULL,
  `latitude` DECIMAL(10,8) DEFAULT NULL,
  `longitude` DECIMAL(11,8) DEFAULT NULL,
  `accuracy_meters` DECIMAL(8,2) DEFAULT NULL,
  `distance_meters` INT DEFAULT NULL,
  `location_verdict` VARCHAR(30) NOT NULL DEFAULT 'not_required',
  `reason` VARCHAR(500) DEFAULT NULL,
  `actor_user_id` INT DEFAULT NULL,
  `occurred_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attendance_events_request` (`user_id`,`request_id`),
  KEY `idx_attendance_events_attendance` (`attendance_id`,`id`),
  KEY `idx_attendance_events_user_time` (`user_id`,`occurred_at`),
  CONSTRAINT `fk_attendance_events_attendance` FOREIGN KEY (`attendance_id`) REFERENCES `attendance_logs` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_attendance_events_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_attendance_events_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
