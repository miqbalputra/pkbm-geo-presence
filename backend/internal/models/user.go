package models

import "time"

type User struct {
	ID              uint       `gorm:"column:id;primaryKey" json:"id"`
	IDGuru          *string    `gorm:"column:id_guru" json:"idGuru,omitempty"`
	Username        string     `gorm:"column:username" json:"username"`
	Password        string     `gorm:"column:password" json:"-"`
	Role            string     `gorm:"column:role" json:"role"`
	Nama            string     `gorm:"column:nama" json:"nama"`
	JenisKelamin    *string    `gorm:"column:jenis_kelamin" json:"jenisKelamin,omitempty"`
	Alamat          *string    `gorm:"column:alamat" json:"alamat,omitempty"`
	NoHP            *string    `gorm:"column:no_hp" json:"noHP,omitempty"`
	Jabatan         *string    `gorm:"column:jabatan" json:"jabatan,omitempty"`
	Email           *string    `gorm:"column:email" json:"email,omitempty"`
	GoogleID        *string    `gorm:"column:google_id" json:"-"`
	TanggalBertugas *time.Time `gorm:"column:tanggal_bertugas;type:date" json:"tanggalBertugas,omitempty"`
	TanggalLahir    *time.Time `gorm:"column:tanggal_lahir;type:date" json:"tanggalLahir,omitempty"`
	ArchivedAt      *time.Time `gorm:"column:archived_at" json:"archivedAt,omitempty"`
	ArchiveReason   *string    `gorm:"column:archive_reason" json:"archiveReason,omitempty"`
	TipeGuru        string     `gorm:"column:tipe_guru" json:"tipeGuru"`
	PiketGroup      *string    `gorm:"column:piket_group" json:"piketGroup,omitempty"`
	Pokjar          *string    `gorm:"column:pokjar" json:"pokjar,omitempty"`
	TandaTangan     *string    `gorm:"column:tanda_tangan;type:text" json:"tandaTangan,omitempty"`
	CreatedAt       time.Time  `gorm:"column:created_at" json:"createdAt"`
	UpdatedAt       time.Time  `gorm:"column:updated_at" json:"updatedAt"`
}

func (User) TableName() string { return "users" }

func (u User) Public() map[string]any {
	return map[string]any{
		"id":              u.ID,
		"user_id":         u.ID,
		"idGuru":          u.IDGuru,
		"username":        u.Username,
		"role":            u.Role,
		"nama":            u.Nama,
		"jenisKelamin":    u.JenisKelamin,
		"alamat":          u.Alamat,
		"noHP":            u.NoHP,
		"jabatan":         u.Jabatan,
		"email":           u.Email,
		"tanggalBertugas": u.TanggalBertugas,
		"tanggalLahir":    u.TanggalLahir,
		"tipeGuru":        u.TipeGuru,
		"piketGroup":      u.PiketGroup,
		"piket_group":     u.PiketGroup,
		"pokjar":          u.Pokjar,
		"tandaTangan":     u.TandaTangan,
		"tanda_tangan":    u.TandaTangan,
	}
}
