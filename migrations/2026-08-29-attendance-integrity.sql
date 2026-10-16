-- Attendance integrity, audit trail, and read-performance indexes.
-- Run once on MySQL 8 before deploying the application changes.

CREATE TABLE IF NOT EXISTS attendance_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  attendance_id INT NULL,
  user_id INT NOT NULL,
  event_type ENUM('check_in','check_out','izin','sakit','admin_adjustment') NOT NULL,
  method ENUM('button','qr_scan','manual') NOT NULL DEFAULT 'button',
  request_id CHAR(36) NULL,
  latitude DECIMAL(10,8) NULL,
  longitude DECIMAL(11,8) NULL,
  accuracy_meters DECIMAL(8,2) NULL,
  distance_meters INT NULL,
  location_verdict ENUM('inside','outside','not_required','testing') NOT NULL DEFAULT 'not_required',
  reason VARCHAR(500) NULL,
  actor_user_id INT NULL,
  occurred_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attendance_events_request (user_id, request_id),
  KEY idx_attendance_events_attendance (attendance_id, id),
  KEY idx_attendance_events_user_time (user_id, occurred_at),
  CONSTRAINT fk_attendance_events_attendance FOREIGN KEY (attendance_id) REFERENCES attendance_logs(id) ON DELETE SET NULL,
  CONSTRAINT fk_attendance_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_events_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS checkin_accuracy_meters DECIMAL(8,2) NULL AFTER longitude,
  ADD COLUMN IF NOT EXISTS checkout_latitude DECIMAL(10,8) NULL AFTER checkin_accuracy_meters,
  ADD COLUMN IF NOT EXISTS checkout_longitude DECIMAL(11,8) NULL AFTER checkout_latitude,
  ADD COLUMN IF NOT EXISTS checkout_accuracy_meters DECIMAL(8,2) NULL AFTER checkout_longitude,
  ADD COLUMN IF NOT EXISTS checkout_distance_meters INT NULL AFTER checkout_accuracy_meters,
  ADD COLUMN IF NOT EXISTS checkout_location_verdict ENUM('inside','outside','testing') NULL AFTER checkout_distance_meters;

DROP PROCEDURE IF EXISTS add_integrity_index_if_missing;
DELIMITER $$
CREATE PROCEDURE add_integrity_index_if_missing(IN table_name_value VARCHAR(64), IN index_name_value VARCHAR(64), IN ddl_value TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = table_name_value AND index_name = index_name_value
  ) THEN
    SET @ddl = ddl_value;
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;
CALL add_integrity_index_if_missing('attendance_logs', 'idx_attendance_date_user_status', 'ALTER TABLE attendance_logs ADD INDEX idx_attendance_date_user_status (tanggal, user_id, status)');
CALL add_integrity_index_if_missing('users', 'idx_users_role_archived_name', 'ALTER TABLE users ADD INDEX idx_users_role_archived_name (role, archived_at, nama)');
DROP PROCEDURE IF EXISTS add_integrity_index_if_missing;
