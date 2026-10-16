package compat

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/httpx"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
)

// analyticsSummary is deliberately calculated from the same workday calendar
// and attendance statuses used by the existing report endpoints. It is a
// read-only report shape: no attendance rule or stored record is changed.
type analyticsSummary struct {
	TotalGuru             int            `json:"totalGuru"`
	TotalHariKerja        int            `json:"totalHariKerja"`
	Hadir                 int            `json:"hadir"`
	TepatWaktu            int            `json:"tepatWaktu"`
	Terlambat             int            `json:"terlambat"`
	Izin                  int            `json:"izin"`
	Sakit                 int            `json:"sakit"`
	Alfa                  int            `json:"alfa"`
	CheckoutLengkap       int            `json:"checkoutLengkap"`
	LupaCheckout          int            `json:"lupaCheckout"`
	PulangAwal            int            `json:"pulangAwal"`
	LemburHari            int            `json:"lemburHari"`
	LemburMenit           int            `json:"lemburMenit"`
	PersentaseKehadiran   float64        `json:"persentaseKehadiran"`
	PersentaseTepatWaktu  float64        `json:"persentaseTepatWaktu"`
	PersentaseCheckout    float64        `json:"persentaseCheckout"`
	RataRataMenitMasuk    *float64       `json:"rataRataMenitMasuk"`
	RataRataMenitPulang   *float64       `json:"rataRataMenitPulang"`
	DistribusiWaktuDatang map[string]int `json:"distribusiWaktuDatang"`
}

type analyticsDaily struct {
	Tanggal             string   `json:"tanggal"`
	Label               string   `json:"label"`
	TotalHariKerja      int      `json:"totalHariKerja"`
	Hadir               int      `json:"hadir"`
	TepatWaktu          int      `json:"tepatWaktu"`
	Terlambat           int      `json:"terlambat"`
	Izin                int      `json:"izin"`
	Sakit               int      `json:"sakit"`
	Alfa                int      `json:"alfa"`
	CheckoutLengkap     int      `json:"checkoutLengkap"`
	LupaCheckout        int      `json:"lupaCheckout"`
	PulangAwal          int      `json:"pulangAwal"`
	RataRataMenitMasuk  *float64 `json:"rataRataMenitMasuk"`
	RataRataMenitPulang *float64 `json:"rataRataMenitPulang"`
}

type analyticsTeacher struct {
	ID                   uint     `json:"id"`
	Nama                 string   `json:"nama"`
	Jabatan              string   `json:"jabatan"`
	TipeGuru             string   `json:"tipeGuru"`
	TotalHariKerja       int      `json:"totalHariKerja"`
	Hadir                int      `json:"hadir"`
	TepatWaktu           int      `json:"tepatWaktu"`
	Terlambat            int      `json:"terlambat"`
	Izin                 int      `json:"izin"`
	Sakit                int      `json:"sakit"`
	Alfa                 int      `json:"alfa"`
	CheckoutLengkap      int      `json:"checkoutLengkap"`
	LupaCheckout         int      `json:"lupaCheckout"`
	PulangAwal           int      `json:"pulangAwal"`
	LemburHari           int      `json:"lemburHari"`
	LemburMenit          int      `json:"lemburMenit"`
	PersentaseKehadiran  float64  `json:"persentaseKehadiran"`
	PersentaseTepatWaktu float64  `json:"persentaseTepatWaktu"`
	PersentasePulang     float64  `json:"persentasePulang"`
	RataRataMenitMasuk   *float64 `json:"rataRataMenitMasuk"`
	RataRataMenitPulang  *float64 `json:"rataRataMenitPulang"`
	Skor                 float64  `json:"skor"`
}

type analyticsDetails struct {
	TerlambatPiket []map[string]any `json:"terlambatPiket"`
	PulangAwal     []map[string]any `json:"pulangAwal"`
	IzinSakit      []map[string]any `json:"izinSakit"`
	LupaCheckout   []map[string]any `json:"lupaCheckout"`
}

type analyticsPeriodResult struct {
	Summary  analyticsSummary
	Daily    []analyticsDaily
	Teachers []analyticsTeacher
	Details  analyticsDetails
}

func (h *Handler) analyticsReport(c *fiber.Ctx) error {
	startValue, endValue := strings.TrimSpace(c.Query("start_date")), strings.TrimSpace(c.Query("end_date"))
	if startValue == "" || endValue == "" {
		return invalid(c, "start_date dan end_date wajib diisi")
	}
	location := appLocation(h)
	start, errStart := parseDate(startValue, location)
	end, errEnd := parseDate(endValue, location)
	if errStart != nil || errEnd != nil || !validReportRange(start, end) {
		return invalid(c, "Rentang laporan maksimal 366 hari dan tanggal akhir harus setelah tanggal awal")
	}
	todayDate := dateOnly(time.Now().In(location))
	if start.After(todayDate) || end.After(todayDate) {
		return invalid(c, "Rentang laporan tidak boleh menggunakan tanggal masa depan")
	}

	tipeGuru := strings.TrimSpace(c.Query("tipe_guru"))
	if len(tipeGuru) > 100 {
		return invalid(c, "tipe_guru tidak valid")
	}
	userIDValue := strings.TrimSpace(c.Query("user_id"))
	var userID uint
	if userIDValue != "" {
		parsed, err := queryUint(c, "user_id")
		if err != nil || parsed == 0 {
			return invalid(c, "user_id tidak valid")
		}
		userID = parsed
	}

	usersQuery := h.db.Where("role = ? AND archived_at IS NULL", "guru")
	if tipeGuru != "" {
		usersQuery = usersQuery.Where("tipe_guru = ?", tipeGuru)
	}
	if userID != 0 {
		usersQuery = usersQuery.Where("id = ?", userID)
	}
	var users []models.User
	if err := usersQuery.Order("nama ASC").Find(&users).Error; err != nil {
		return err
	}
	if userID != 0 && len(users) == 0 {
		return httpx.Error(c, fiber.StatusNotFound, "NOT_FOUND", "Guru tidak ditemukan atau tidak sesuai dengan filter")
	}
	var filterUsers []models.User
	if err := h.db.Select("id", "nama", "tipe_guru").Where("role = ? AND archived_at IS NULL", "guru").Order("nama ASC").Find(&filterUsers).Error; err != nil {
		return err
	}
	filterTeachers := make([]fiber.Map, 0, len(filterUsers))
	filterTypeSet := map[string]struct{}{}
	for _, user := range filterUsers {
		filterTeachers = append(filterTeachers, fiber.Map{"id": user.ID, "nama": user.Nama, "tipeGuru": user.TipeGuru})
		if user.TipeGuru != "" {
			filterTypeSet[user.TipeGuru] = struct{}{}
		}
	}
	filterTypes := make([]string, 0, len(filterTypeSet))
	for value := range filterTypeSet {
		filterTypes = append(filterTypes, value)
	}
	sort.Strings(filterTypes)

	days := int(end.Sub(start).Hours()/24) + 1
	comparisonEnd := start.AddDate(0, 0, -1)
	comparisonStart := comparisonEnd.AddDate(0, 0, -(days - 1))

	current, err := h.analyticsPeriod(users, start, end, todayDate)
	if err != nil {
		return err
	}
	comparison, err := h.analyticsPeriod(users, comparisonStart, comparisonEnd, todayDate)
	if err != nil {
		return err
	}
	today, err := h.analyticsPeriod(users, todayDate, todayDate, todayDate)
	if err != nil {
		return err
	}

	return httpx.Success(c, "Analitik presensi berhasil diambil", fiber.Map{
		"period": fiber.Map{
			"startDate": start.Format("2006-01-02"), "endDate": end.Format("2006-01-02"), "totalHari": days,
		},
		"filters":       fiber.Map{"tipeGuru": tipeGuru, "userId": userID},
		"filterOptions": fiber.Map{"tipeGuru": filterTypes, "guru": filterTeachers},
		"summary":       current.Summary,
		"daily":         current.Daily,
		"teachers":      current.Teachers,
		"details":       current.Details,
		"today":         today.Summary,
		"comparison": fiber.Map{
			"startDate": comparisonStart.Format("2006-01-02"), "endDate": comparisonEnd.Format("2006-01-02"),
			"available": comparison.Summary.TotalHariKerja > 0, "summary": comparison.Summary,
		},
	})
}

func (h *Handler) analyticsPeriod(users []models.User, start, end, todayDate time.Time) (analyticsPeriodResult, error) {
	calendar, err := h.loadWorkdayCalendar(start, end)
	if err != nil {
		return analyticsPeriodResult{}, err
	}
	logs, err := h.analyticsLogs(users, start, end)
	if err != nil {
		return analyticsPeriodResult{}, err
	}
	var schedules []models.JadwalPiket
	if err := h.db.Where("is_active = ?", true).Find(&schedules).Error; err != nil {
		return analyticsPeriodResult{}, err
	}
	piketByUserDay := map[string]string{}
	for _, schedule := range schedules {
		piketByUserDay[fmt.Sprintf("%d:%s", schedule.UserID, schedule.Hari)] = clockValue(schedule.JamPulangPiket)
	}

	logsByUserDate := map[string]models.AttendanceLog{}
	for _, log := range logs {
		logsByUserDate[analyticsUserDateKey(log.UserID, log.Tanggal)] = log
	}

	result := analyticsPeriodResult{
		Summary:  analyticsSummary{TotalGuru: len(users), DistribusiWaktuDatang: analyticsArrivalBuckets()},
		Daily:    make([]analyticsDaily, 0, len(dateRange(start, end))),
		Teachers: make([]analyticsTeacher, 0, len(users)),
		Details:  analyticsDetails{TerlambatPiket: []map[string]any{}, PulangAwal: []map[string]any{}, IzinSakit: []map[string]any{}, LupaCheckout: []map[string]any{}},
	}
	dailyByDate := map[string]*analyticsDaily{}
	for _, date := range dateRange(start, end) {
		row := analyticsDaily{Tanggal: date.Format("2006-01-02"), Label: dayLabel(date)}
		result.Daily = append(result.Daily, row)
		dailyByDate[row.Tanggal] = &result.Daily[len(result.Daily)-1]
	}

	checkInMinutes, checkOutMinutes := 0, 0
	checkInCount, checkOutCount := 0, 0
	workdayByUserDate := map[string]bool{}
	for _, user := range users {
		teacher := analyticsTeacher{ID: user.ID, Nama: user.Nama, TipeGuru: user.TipeGuru}
		if user.Jabatan != nil {
			teacher.Jabatan = *user.Jabatan
		}
		teacherCheckInMinutes, teacherCheckOutMinutes := 0, 0
		teacherCheckInCount, teacherCheckOutCount := 0, 0
		for _, date := range dateRange(start, end) {
			workday, _ := calendar.isWorkday(user, date)
			if !workday {
				continue
			}
			key := analyticsUserDateKey(user.ID, date)
			workdayByUserDate[key] = true
			daily := dailyByDate[date.Format("2006-01-02")]
			teacher.TotalHariKerja++
			result.Summary.TotalHariKerja++
			daily.TotalHariKerja++
			log, found := logsByUserDate[key]
			if !found {
				teacher.Alfa++
				result.Summary.Alfa++
				daily.Alfa++
				continue
			}

			isHadir := analyticsIsPresent(log.Status)
			isLate := analyticsIsLate(log.Status)
			switch {
			case isHadir:
				teacher.Hadir++
				result.Summary.Hadir++
				daily.Hadir++
				if isLate {
					teacher.Terlambat++
					result.Summary.Terlambat++
					daily.Terlambat++
					if _, isPiket := piketByUserDay[fmt.Sprintf("%d:%s", user.ID, dayName(date.Weekday()))]; isPiket {
						result.Details.TerlambatPiket = append(result.Details.TerlambatPiket, mapAttendance(log))
					}
				} else {
					teacher.TepatWaktu++
					result.Summary.TepatWaktu++
					daily.TepatWaktu++
				}
				if minutes, ok := parseClockMinutes(clockValue(log.JamMasuk)); ok {
					checkInMinutes += minutes
					checkInCount++
					teacherCheckInMinutes += minutes
					teacherCheckInCount++
					analyticsAddArrivalBucket(result.Summary.DistribusiWaktuDatang, minutes)
				}
				if isMissingCheckout(log) {
					if date.Before(todayDate) {
						teacher.LupaCheckout++
						result.Summary.LupaCheckout++
						daily.LupaCheckout++
						result.Details.LupaCheckout = append(result.Details.LupaCheckout, mapAttendance(log))
					}
				} else {
					teacher.CheckoutLengkap++
					result.Summary.CheckoutLengkap++
					daily.CheckoutLengkap++
					if minutes, ok := parseClockMinutes(clockValue(log.JamPulang)); ok {
						checkOutMinutes += minutes
						checkOutCount++
						teacherCheckOutMinutes += minutes
						teacherCheckOutCount++
					}
				}
				if hasApprovedEarlyCheckout(log) {
					teacher.PulangAwal++
					result.Summary.PulangAwal++
					daily.PulangAwal++
					result.Details.PulangAwal = append(result.Details.PulangAwal, mapAttendance(log))
				}
				if minutes, ok := overtimeMinutes(log, date, piketByUserDay); ok {
					teacher.LemburHari++
					teacher.LemburMenit += minutes
					result.Summary.LemburHari++
					result.Summary.LemburMenit += minutes
				}
			case log.Status == "izin":
				teacher.Izin++
				result.Summary.Izin++
				daily.Izin++
				result.Details.IzinSakit = append(result.Details.IzinSakit, mapAttendance(log))
			case log.Status == "sakit":
				teacher.Sakit++
				result.Summary.Sakit++
				daily.Sakit++
				result.Details.IzinSakit = append(result.Details.IzinSakit, mapAttendance(log))
			default:
				teacher.Alfa++
				result.Summary.Alfa++
				daily.Alfa++
			}
		}
		analyticsSetTeacherRates(&teacher, teacherCheckInMinutes, teacherCheckInCount, teacherCheckOutMinutes, teacherCheckOutCount)
		result.Teachers = append(result.Teachers, teacher)
	}
	analyticsSetSummaryRates(&result.Summary, checkInMinutes, checkInCount, checkOutMinutes, checkOutCount)
	for index := range result.Daily {
		date := result.Daily[index].Tanggal
		analyticsSetDailyAverages(&result.Daily[index], logsByUserDate, workdayByUserDate, users, date)
	}
	sort.Slice(result.Teachers, func(i, j int) bool {
		if result.Teachers[i].Skor == result.Teachers[j].Skor {
			return result.Teachers[i].Nama < result.Teachers[j].Nama
		}
		return result.Teachers[i].Skor > result.Teachers[j].Skor
	})
	return result, nil
}

func (h *Handler) analyticsLogs(users []models.User, start, end time.Time) ([]models.AttendanceLog, error) {
	if len(users) == 0 {
		return []models.AttendanceLog{}, nil
	}
	ids := make([]uint, 0, len(users))
	for _, user := range users {
		ids = append(ids, user.ID)
	}
	var logs []models.AttendanceLog
	// Use an exclusive end date so DATE columns are handled consistently by
	// MySQL and SQLite test deployments; a timestamp representation must not
	// silently drop records on the final selected day.
	err := h.db.Where("user_id IN ? AND tanggal >= ? AND tanggal < ?", ids, start.Format("2006-01-02"), end.AddDate(0, 0, 1).Format("2006-01-02")).Order("tanggal ASC, id ASC").Find(&logs).Error
	return logs, err
}

func analyticsUserDateKey(userID uint, date time.Time) string {
	return fmt.Sprintf("%d:%s", userID, date.Format("2006-01-02"))
}

func analyticsIsPresent(status string) bool {
	return status == "hadir" || status == "hadir_terlambat" || status == "hadir_izin_terlambat"
}

func analyticsIsLate(status string) bool {
	return status == "hadir_terlambat" || status == "hadir_izin_terlambat"
}

func hasApprovedEarlyCheckout(log models.AttendanceLog) bool {
	return log.Keterangan != nil && strings.Contains(*log.Keterangan, "Izin Pulang Awal Piket")
}

func analyticsArrivalBuckets() map[string]int {
	return map[string]int{"Sebelum 07.00": 0, "07.00–07.29": 0, "07.30–07.59": 0, "08.00 atau setelahnya": 0}
}

func analyticsAddArrivalBucket(buckets map[string]int, minutes int) {
	switch {
	case minutes < 7*60:
		buckets["Sebelum 07.00"]++
	case minutes < 7*60+30:
		buckets["07.00–07.29"]++
	case minutes < 8*60:
		buckets["07.30–07.59"]++
	default:
		buckets["08.00 atau setelahnya"]++
	}
}

func analyticsSetSummaryRates(summary *analyticsSummary, checkInMinutes, checkInCount, checkOutMinutes, checkOutCount int) {
	if summary.TotalHariKerja > 0 {
		summary.PersentaseKehadiran = float64(summary.Hadir) / float64(summary.TotalHariKerja) * 100
	}
	if summary.Hadir > 0 {
		summary.PersentaseTepatWaktu = float64(summary.TepatWaktu) / float64(summary.Hadir) * 100
	}
	checkoutEligible := summary.CheckoutLengkap + summary.LupaCheckout
	if checkoutEligible > 0 {
		summary.PersentaseCheckout = float64(summary.CheckoutLengkap) / float64(checkoutEligible) * 100
	}
	if checkInCount > 0 {
		average := float64(checkInMinutes) / float64(checkInCount)
		summary.RataRataMenitMasuk = &average
	}
	if checkOutCount > 0 {
		average := float64(checkOutMinutes) / float64(checkOutCount)
		summary.RataRataMenitPulang = &average
	}
}

func analyticsSetTeacherRates(teacher *analyticsTeacher, checkInMinutes, checkInCount, checkOutMinutes, checkOutCount int) {
	if teacher.TotalHariKerja > 0 {
		teacher.PersentaseKehadiran = float64(teacher.Hadir) / float64(teacher.TotalHariKerja) * 100
	}
	if teacher.Hadir > 0 {
		teacher.PersentaseTepatWaktu = float64(teacher.TepatWaktu) / float64(teacher.Hadir) * 100
		// Preserve the established leaderboard formula: a checkout missing on a
		// previous date is the only checkout deduction, then the score is capped.
		teacher.PersentasePulang = float64(maxInt(teacher.Hadir-teacher.LupaCheckout, 0)) / float64(teacher.Hadir) * 100
	}
	if checkInCount > 0 {
		average := float64(checkInMinutes) / float64(checkInCount)
		teacher.RataRataMenitMasuk = &average
	}
	if checkOutCount > 0 {
		average := float64(checkOutMinutes) / float64(checkOutCount)
		teacher.RataRataMenitPulang = &average
	}
	teacher.Skor = mathMin((teacher.PersentaseKehadiran*0.5)+(teacher.PersentaseTepatWaktu*0.25)+(teacher.PersentasePulang*0.25)+(float64(teacher.LemburMenit)/60), 100)
}

func analyticsSetDailyAverages(daily *analyticsDaily, logsByUserDate map[string]models.AttendanceLog, workdayByUserDate map[string]bool, users []models.User, date string) {
	checkInMinutes, checkInCount, checkOutMinutes, checkOutCount := 0, 0, 0, 0
	for _, user := range users {
		key := fmt.Sprintf("%d:%s", user.ID, date)
		log, ok := logsByUserDate[key]
		if !workdayByUserDate[key] || !ok || !analyticsIsPresent(log.Status) {
			continue
		}
		if minutes, ok := parseClockMinutes(clockValue(log.JamMasuk)); ok {
			checkInMinutes += minutes
			checkInCount++
		}
		if !isMissingCheckout(log) {
			if minutes, ok := parseClockMinutes(clockValue(log.JamPulang)); ok {
				checkOutMinutes += minutes
				checkOutCount++
			}
		}
	}
	if checkInCount > 0 {
		average := float64(checkInMinutes) / float64(checkInCount)
		daily.RataRataMenitMasuk = &average
	}
	if checkOutCount > 0 {
		average := float64(checkOutMinutes) / float64(checkOutCount)
		daily.RataRataMenitPulang = &average
	}
}
