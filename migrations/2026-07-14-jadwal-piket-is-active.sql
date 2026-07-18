-- Migration: Add is_active column to jadwal_piket (if not exists).
-- This column already exists in the main schema dump (geogqpresence.sql),
-- but this migration ensures it is present on databases that were created
-- before the column was added. Safe to run repeatedly.
--
-- The is_active column allows admins to toggle a jadwal piket on/off
-- without deleting the data. Inactive jadwal (is_active = 0) are kept
-- in the table but excluded from attendance logic (jam masuk/pulang piket,
-- leaderboard piket map, guru home dashboard).

-- Add column if it does not exist yet (MySQL 8 compatible)
SET @dbname = DATABASE();
SET @tablename = 'jadwal_piket';
SET @colname = 'is_active';

SET @preparedStatement = (
    SELECT IF(
        (
            SELECT COUNT(*)
            FROM information_schema.columns
            WHERE table_schema = @dbname
              AND table_name = @tablename
              AND column_name = @colname
        ) = 0,
        'ALTER TABLE jadwal_piket ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER keterangan',
        'SELECT 1'
    )
);
PREPARE stmt FROM @preparedStatement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Ensure all existing rows default to active
UPDATE jadwal_piket SET is_active = 1 WHERE is_active IS NULL;