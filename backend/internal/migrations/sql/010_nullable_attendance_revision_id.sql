-- A revision request may correct an Alfa day that has no attendance_logs row yet.
-- Existing attendance IDs and links are preserved.
ALTER TABLE `attendance_revision_requests` MODIFY COLUMN `attendance_id` int DEFAULT NULL;
