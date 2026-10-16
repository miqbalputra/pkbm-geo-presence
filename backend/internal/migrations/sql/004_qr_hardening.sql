-- QR nonce compatibility is applied by ensureLegacyUserColumns after the
-- versioned migrations. MySQL 8.4 does not support IF NOT EXISTS for
-- ALTER TABLE ... ADD COLUMN, and the compatibility path must also handle
-- legacy databases where this column may already exist.
SELECT 1;
