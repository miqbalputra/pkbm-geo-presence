package compat

import (
	"github.com/gofiber/fiber/v2"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/httpx"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
)

func (h *Handler) optionalWorkdays(c *fiber.Ctx) error {
	switch c.Method() {
	case fiber.MethodGet:
		query := h.db.Order("tanggal ASC")
		if value := c.Query("start_date"); value != "" {
			query = query.Where("tanggal >= ?", value)
		}
		if value := c.Query("end_date"); value != "" {
			query = query.Where("tanggal <= ?", value)
		}
		var rows []models.OptionalWorkday
		if err := query.Find(&rows).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Data hari kerja opsional berhasil diambil", rows)
	case fiber.MethodPost:
		body, err := readJSON(c)
		if err != nil {
			return invalid(c, err.Error())
		}
		date, err := parseDate(stringValue(body, "tanggal"), appLocation(h))
		if err != nil {
			return invalid(c, "Format tanggal tidak valid")
		}
		row := models.OptionalWorkday{Tanggal: date, Nama: stringValue(body, "nama"), Keterangan: pointerString(stringValue(body, "keterangan"))}
		if row.Nama == "" {
			return invalid(c, "Nama hari kerja opsional harus diisi")
		}
		if err := h.db.Create(&row).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Hari kerja opsional berhasil ditambahkan", row)
	case fiber.MethodPut:
		body, err := readJSON(c)
		if err != nil {
			return invalid(c, err.Error())
		}
		id, err := uintValue(body, "id")
		if err != nil {
			return invalid(c, "ID hari kerja opsional harus diisi")
		}
		updates := map[string]any{"nama": stringValue(body, "nama"), "keterangan": stringValue(body, "keterangan")}
		if value := stringValue(body, "tanggal"); value != "" {
			date, err := parseDate(value, appLocation(h))
			if err != nil {
				return invalid(c, "Format tanggal tidak valid")
			}
			updates["tanggal"] = date.Format("2006-01-02")
		}
		if err := h.db.Model(&models.OptionalWorkday{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Hari kerja opsional berhasil diupdate", nil)
	case fiber.MethodDelete:
		id, err := queryUint(c, "id")
		if err != nil {
			return invalid(c, "ID hari kerja opsional harus diisi")
		}
		if err := h.db.Delete(&models.OptionalWorkday{}, id).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Hari kerja opsional berhasil dihapus", nil)
	default:
		return fiber.ErrMethodNotAllowed
	}
}

func (h *Handler) weekendOverrides(c *fiber.Ctx) error {
	switch c.Method() {
	case fiber.MethodGet:
		query := h.db.Order("tanggal ASC, user_id ASC")
		if value := c.Query("user_id"); value != "" {
			id, err := parseUint(value)
			if err != nil {
				return invalid(c, "user_id tidak valid")
			}
			query = query.Where("user_id = ?", id)
		}
		var rows []models.WeekendOverride
		if err := query.Find(&rows).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Data override weekend berhasil diambil", rows)
	case fiber.MethodPost, fiber.MethodPut:
		body, err := readJSON(c)
		if err != nil {
			return invalid(c, err.Error())
		}
		userID, err := uintValue(body, "user_id", "userId")
		if err != nil {
			return invalid(c, "user_id harus diisi")
		}
		date, err := parseDate(stringValue(body, "tanggal"), appLocation(h))
		if err != nil {
			return invalid(c, "Format tanggal tidak valid")
		}
		if c.Method() == fiber.MethodPut {
			id, err := uintValue(body, "id")
			if err != nil {
				return invalid(c, "ID override harus diisi")
			}
			if err := h.db.Model(&models.WeekendOverride{}).Where("id = ?", id).Updates(map[string]any{"user_id": userID, "tanggal": date.Format("2006-01-02"), "is_workday": boolValue(body, "is_workday", "isWorkday"), "keterangan": stringValue(body, "keterangan")}).Error; err != nil {
				return err
			}
			return httpx.Success(c, "Override weekend berhasil diupdate", nil)
		}
		row := models.WeekendOverride{UserID: userID, Tanggal: date, IsWorkday: boolValue(body, "is_workday", "isWorkday"), Keterangan: pointerString(stringValue(body, "keterangan"))}
		if err := h.db.Create(&row).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Override weekend berhasil ditambahkan", row)
	case fiber.MethodDelete:
		id, err := queryUint(c, "id")
		if err != nil {
			body, bodyErr := readJSON(c)
			if bodyErr != nil {
				return invalid(c, "ID override harus diisi")
			}
			id, err = uintValue(body, "id")
			if err != nil {
				return invalid(c, "ID override harus diisi")
			}
		}
		if err := h.db.Delete(&models.WeekendOverride{}, id).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Override weekend berhasil dihapus", nil)
	default:
		return fiber.ErrMethodNotAllowed
	}
}

func (h *Handler) pengaturanHarian(c *fiber.Ctx) error {
	switch c.Method() {
	case fiber.MethodGet:
		var rows []models.PengaturanHarian
		if err := h.db.Order("tanggal DESC").Find(&rows).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Pengaturan harian berhasil diambil", rows)
	case fiber.MethodPost:
		body, err := readJSON(c)
		if err != nil {
			return invalid(c, err.Error())
		}
		date, err := parseDate(stringValue(body, "tanggal"), appLocation(h))
		if err != nil {
			return invalid(c, "Format tanggal tidak valid")
		}
		row := models.PengaturanHarian{Tanggal: date, JamPulangKhusus: pointerString(normalizeTime(stringValue(body, "jam_pulang_khusus", "jamPulangKhusus"))), JamPulangKhususAktif: boolValue(body, "jam_pulang_khusus_aktif", "jamPulangKhususAktif"), JamPulangPiketKhusus: pointerString(normalizeTime(stringValue(body, "jam_pulang_piket_khusus", "jamPulangPiketKhusus"))), JamPulangPiketAktif: boolValue(body, "jam_pulang_piket_khusus_aktif", "jamPulangPiketKhususAktif"), Keterangan: pointerString(stringValue(body, "keterangan")), UpdatedBy: pointerString(stringValue(body, "updated_by", "updatedBy"))}
		if row.JamPulangKhusus != nil && !validTime(*row.JamPulangKhusus) || row.JamPulangPiketKhusus != nil && !validTime(*row.JamPulangPiketKhusus) {
			return invalid(c, "Format jam pulang tidak valid")
		}
		if err := h.db.Save(&row).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Pengaturan harian berhasil disimpan", row)
	case fiber.MethodDelete:
		value := c.Query("tanggal")
		if value == "" {
			return invalid(c, "Tanggal harus diisi")
		}
		date, err := parseDate(value, appLocation(h))
		if err != nil {
			return invalid(c, "Format tanggal tidak valid")
		}
		if err := h.db.Delete(&models.PengaturanHarian{}, "tanggal = ?", date.Format("2006-01-02")).Error; err != nil {
			return err
		}
		return httpx.Success(c, "Pengaturan harian berhasil dihapus", nil)
	default:
		return fiber.ErrMethodNotAllowed
	}
}
