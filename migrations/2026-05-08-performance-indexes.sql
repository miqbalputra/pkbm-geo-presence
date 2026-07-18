-- Performance indexes for GeoPresensi.
-- Safe to run repeatedly on MySQL 8 because indexes are added only when missing.
-- Run this once against the production database after deploying the app.

DROP PROCEDURE IF EXISTS add_index_if_missing;

DELIMITER $$
CREATE PROCEDURE add_index_if_missing(
    IN table_name_value VARCHAR(64),
    IN index_name_value VARCHAR(64),
    IN ddl_value TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = table_name_value
          AND index_name = index_name_value
        LIMIT 1
    ) THEN
        SET @ddl = ddl_value;
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

CALL add_index_if_missing(
    'attendance_logs',
    'idx_attendance_tanggal_id',
    'ALTER TABLE attendance_logs ADD INDEX idx_attendance_tanggal_id (tanggal, id)'
);

CALL add_index_if_missing(
    'attendance_logs',
    'idx_attendance_tanggal_status',
    'ALTER TABLE attendance_logs ADD INDEX idx_attendance_tanggal_status (tanggal, status)'
);

CALL add_index_if_missing(
    'jadwal_piket',
    'idx_jadwal_hari_jam',
    'ALTER TABLE jadwal_piket ADD INDEX idx_jadwal_hari_jam (hari, jam_piket)'
);

CALL add_index_if_missing(
    'users',
    'idx_users_role_nama',
    'ALTER TABLE users ADD INDEX idx_users_role_nama (role, nama)'
);

CALL add_index_if_missing(
    'activity_logs',
    'idx_activity_waktu_id',
    'ALTER TABLE activity_logs ADD INDEX idx_activity_waktu_id (waktu, id)'
);

CALL add_index_if_missing(
    'webhook_logs',
    'idx_webhook_logs_created_at',
    'ALTER TABLE webhook_logs ADD INDEX idx_webhook_logs_created_at (created_at)'
);

DROP PROCEDURE IF EXISTS add_index_if_missing;
