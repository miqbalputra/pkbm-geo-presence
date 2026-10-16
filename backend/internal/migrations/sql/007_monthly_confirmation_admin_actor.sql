-- Idempotent compatibility step. ensureLegacyUserColumns adds the optional
-- admin actor column, index, and foreign key only when they are missing.
SELECT 1;
