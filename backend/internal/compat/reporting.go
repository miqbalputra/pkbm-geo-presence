package compat

import (
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"

	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/httpx"
	"github.com/pkbm-tunas-ilmu/presensi-pkbm/backend/internal/models"
)

const maxReportRangeDays = 366

func validReportRange(start, end time.Time) bool {
	return !end.Before(start) && end.Sub(start) <= time.Duration(maxReportRangeDays-1)*24*time.Hour
}

func dateRange(start, end time.Time) []time.Time {
	result := []time.Time{}
	for date := start; !date.After(end); date = date.AddDate(0, 0, 1) {
		result = append(result, date)
	}
	return result
}

type workdayCalendar struct {
	holidays  map[string]models.Holiday
	optional  map[string]struct{}
	overrides map[string]models.WeekendOverride
	settings  map[string]string
}

// loadWorkdayCalendar collapses the per-user/per-day rule lookups used by
// reports into three bounded queries. The old implementation performed one
// holiday and one optional-workday query for every user/day combination.
func (h *Handler) loadWorkdayCalendar(start, end time.Time) (workdayCalendar, error) {
	return loadWorkdayCalendarFromDB(h.db, start, end)
}

func loadWorkdayCalendarFromDB(db *gorm.DB, start, end time.Time) (workdayCalendar, error) {
	calendar := workdayCalendar{holidays: map[string]models.Holiday{}, optional: map[string]struct{}{}, overrides: map[string]models.WeekendOverride{}}
	var holidays []models.Holiday
	endExclusive := end.AddDate(0, 0, 1).Format("2006-01-02")
	if err := db.Where("tanggal >= ? AND tanggal < ?", start.Format("2006-01-02"), endExclusive).Find(&holidays).Error; err != nil {
		return calendar, err
	}
	for _, holiday := range holidays {
		calendar.holidays[holiday.Tanggal.Format("2006-01-02")] = holiday
	}
	var optional []models.OptionalWorkday
	if err := db.Where("tanggal >= ? AND tanggal < ?", start.Format("2006-01-02"), endExclusive).Find(&optional).Error; err != nil {
		return calendar, err
	}
	for _, row := range optional {
		calendar.optional[row.Tanggal.Format("2006-01-02")] = struct{}{}
	}
	var overrides []models.WeekendOverride
	if err := db.Where("tanggal >= ? AND tanggal < ?", start.Format("2006-01-02"), endExclusive).Find(&overrides).Error; err != nil {
		return calendar, err
	}
	for _, row := range overrides {
		calendar.overrides[workdayOverrideKey(row.UserID, row.Tanggal)] = row
	}
	settings, err := settingsMap(db)
	if err != nil {
		return calendar, err
	}
	calendar.settings = settings
	return calendar, nil
}

func (calendar workdayCalendar) isWorkday(user models.User, date time.Time) (bool, bool) {
	dateString := date.Format("2006-01-02")
	if user.CreatedAt.Year() > 1 && dateString < user.CreatedAt.In(date.Location()).Format("2006-01-02") {
		return false, false
	}
	if _, ok := calendar.optional[dateString]; ok {
		return false, true
	}
	if date.Weekday() == time.Saturday || date.Weekday() == time.Sunday {
		if override, ok := calendar.overrides[workdayOverrideKey(user.ID, date)]; ok {
			return override.IsWorkday, false
		}
	}
	if holiday, ok := calendar.holidays[dateString]; ok {
		return holiday.IsWorkday, false
	}
	days, _ := parseWorkdayDays(calendar.settings["workday_days"])
	return containsDay(days, int(date.Weekday())), false
}

func (h *Handler) isWorkday(user models.User, date time.Time) (bool, bool, error) {
	dateString := date.Format("2006-01-02")
	if user.CreatedAt.Year() > 1 && dateString < user.CreatedAt.In(date.Location()).Format("2006-01-02") {
		return false, false, nil
	}
	var holiday models.Holiday
	holidayQuery := h.db.
		Where("tanggal >= ? AND tanggal < ?", date, date.AddDate(0, 0, 1)).
		First(&holiday)
	if holidayQuery.Error != nil && !errors.Is(holidayQuery.Error, gorm.ErrRecordNotFound) {
		return false, false, holidayQuery.Error
	}
	var optional models.OptionalWorkday
	optionalQuery := h.db.Where("tanggal = ?", dateString).First(&optional)
	isOptional := optionalQuery.Error == nil
	if isOptional {
		return false, true, nil
	}
	if date.Weekday() == time.Saturday || date.Weekday() == time.Sunday {
		var override models.WeekendOverride
		overrideQuery := h.db.Where("user_id = ? AND tanggal = ?", user.ID, dateString).First(&override)
		if overrideQuery.Error == nil {
			return override.IsWorkday, false, nil
		}
		if overrideQuery.Error != nil && !errors.Is(overrideQuery.Error, gorm.ErrRecordNotFound) {
			return false, false, overrideQuery.Error
		}
	}
	if holidayQuery.Error == nil {
		return holiday.IsWorkday, false, nil
	}
	settings, err := settingsMap(h.db)
	if err != nil {
		return false, false, err
	}
	days, _ := parseWorkdayDays(settings["workday_days"])
	return containsDay(days, int(date.Weekday())), false, nil
}

func parseWorkdayDays(value string) ([]int, bool) {
	if strings.TrimSpace(value) == "" {
		return []int{6}, true
	}
	seen := map[int]bool{}
	days := []int{}
	for _, part := range strings.FieldsFunc(value, func(r rune) bool { return r == ',' || r == ' ' || r == '\t' || r == '\n' }) {
		day, err := strconv.Atoi(part)
		if err != nil || day < 0 || day > 6 {
			return nil, false
		}
		if !seen[day] {
			seen[day] = true
			days = append(days, day)
		}
	}
	if len(days) == 0 {
		return []int{6}, true
	}
	sort.Ints(days)
	return days, true
}

func normalizeCSVNumbers(value string, min, max int) string {
	seen := map[int]bool{}
	values := []int{}
	for _, part := range strings.FieldsFunc(value, func(r rune) bool { return r == ',' || r == ' ' || r == '\t' || r == '\n' }) {
		n, err := strconv.Atoi(part)
		if err == nil && n >= min && n <= max && !seen[n] {
			seen[n] = true
			values = append(values, n)
		}
	}
	sort.Ints(values)
	parts := make([]string, 0, len(values))
	for _, n := range values {
		parts = append(parts, strconv.Itoa(n))
	}
	return strings.Join(parts, ",")
}

func containsDay(days []int, wanted int) bool {
	for _, day := range days {
		if day == wanted {
			return true
		}
	}
	return false
}

func workdayOverrideKey(userID uint, date time.Time) string {
	return fmt.Sprintf("%d:%s", userID, date.Format("2006-01-02"))
}

func (h *Handler) adminSummary(c *fiber.Ctx) error {
	period := c.Query("period", "today")
	now := time.Now().In(appLocation(h))
	start := now
	end := now
	switch period {
	case "yesterday":
		start, end = now.AddDate(0, 0, -1), now.AddDate(0, 0, -1)
	case "7days":
		start = now.AddDate(0, 0, -6)
	case "14days":
		start = now.AddDate(0, 0, -13)
	case "30days":
		start = now.AddDate(0, 0, -29)
	case "today":
	default:
		return invalid(c, "Period tidak valid")
	}
	start = dateOnly(start)
	end = dateOnly(end)
	calendar, err := h.loadWorkdayCalendar(start, end)
	if err != nil {
		return err
	}
	var users []models.User
	if err := h.db.Where("role = ? AND archived_at IS NULL", "guru").Find(&users).Error; err != nil {
		return err
	}
	var logs []models.AttendanceLog
	if err := h.db.Where("tanggal BETWEEN ? AND ?", start.Format("2006-01-02"), end.Format("2006-01-02")).Order("tanggal DESC, id DESC").Find(&logs).Error; err != nil {
		return err
	}
	stats := map[string]int{"hadir": 0, "izin": 0, "sakit": 0, "alfa": 0}
	byUserDate := map[string]models.AttendanceLog{}
	for _, log := range logs {
		byUserDate[fmt.Sprintf("%d:%s", log.UserID, log.Tanggal.Format("2006-01-02"))] = log
	}
	expected := 0
	for _, user := range users {
		for _, date := range dateRange(start, end) {
			workday, _ := calendar.isWorkday(user, date)
			if !workday {
				continue
			}
			expected++
			log, ok := byUserDate[fmt.Sprintf("%d:%s", user.ID, date.Format("2006-01-02"))]
			if !ok {
				continue
			}
			switch {
			case contains([]string{"hadir", "hadir_terlambat", "hadir_izin_terlambat"}, log.Status):
				stats["hadir"]++
			case log.Status == "izin":
				stats["izin"]++
			case log.Status == "sakit":
				stats["sakit"]++
			}
		}
	}
	stats["alfa"] = maxInt(expected-stats["hadir"]-stats["izin"]-stats["sakit"], 0)
	missing := []map[string]any{}
	todayString := now.Format("2006-01-02")
	for _, user := range users {
		workday, _ := calendar.isWorkday(user, dateOnly(now))
		if !workday {
			continue
		}
		if _, ok := byUserDate[fmt.Sprintf("%d:%s", user.ID, todayString)]; !ok {
			missing = append(missing, mapUser(user))
		}
	}
	dataLogs := make([]map[string]any, 0, len(logs))
	for _, log := range logs {
		dataLogs = append(dataLogs, mapAttendance(log))
	}
	return httpx.Success(c, "Ringkasan dashboard berhasil diambil", fiber.Map{"period": period, "startDate": start.Format("2006-01-02"), "endDate": end.Format("2006-01-02"), "totalGuru": len(users), "totalHariAktif": workingDayCount(users, start, end, calendar), "stats": stats, "belumPresensiHariIni": missing, "logs": dataLogs})
}

func workingDayCount(users []models.User, start, end time.Time, calendar workdayCalendar) int {
	count := 0
	for _, date := range dateRange(start, end) {
		for _, user := range users {
			if ok, _ := calendar.isWorkday(user, date); ok {
				count++
				break
			}
		}
	}
	return count
}

func (h *Handler) adminCharts(c *fiber.Ctx) error {
	chart := c.Query("chart", "overview")
	if chart == "overview" {
		return h.overviewChart(c)
	}
	if chart == "leaderboard" {
		return h.leaderboardChart(c)
	}
	if chart == "checkout" {
		return h.checkoutChart(c)
	}
	if chart == "complete_stats" {
		return h.completeStatsChart(c)
	}
	return invalid(c, "Chart tidak valid")
}

func (h *Handler) overviewChart(c *fiber.Ctx) error {
	now := dateOnly(time.Now().In(appLocation(h)))
	start := now.AddDate(0, 0, -6)
	calendar, err := h.loadWorkdayCalendar(start, now)
	if err != nil {
		return err
	}
	var users []models.User
	if err := h.db.Where("role = ? AND archived_at IS NULL", "guru").Find(&users).Error; err != nil {
		return err
	}
	var logs []models.AttendanceLog
	if err := h.db.Where("tanggal BETWEEN ? AND ?", start.Format("2006-01-02"), now.Format("2006-01-02")).Find(&logs).Error; err != nil {
		return err
	}
	logsByDateUser := map[string]models.AttendanceLog{}
	for _, log := range logs {
		logsByDateUser[fmt.Sprintf("%s:%d", log.Tanggal.Format("2006-01-02"), log.UserID)] = log
	}
	trend := []map[string]any{}
	for _, date := range dateRange(start, now) {
		hadir, tidak := 0, 0
		for _, user := range users {
			workday, _ := calendar.isWorkday(user, date)
			if !workday {
				continue
			}
			log, ok := logsByDateUser[fmt.Sprintf("%s:%d", date.Format("2006-01-02"), user.ID)]
			if !ok {
				tidak++
			} else if contains([]string{"hadir", "hadir_terlambat", "hadir_izin_terlambat"}, log.Status) {
				hadir++
			} else {
				tidak++
			}
		}
		trend = append(trend, map[string]any{"tanggal": dayLabel(date), "date": date.Format("2006-01-02"), "hadir": hadir, "tidakHadir": tidak})
	}
	stats := map[string]int{"hadir": 0, "izin": 0, "sakit": 0, "alfa": 0}
	for _, log := range logs {
		if log.Tanggal.Format("2006-01-02") != now.Format("2006-01-02") {
			continue
		}
		if contains([]string{"hadir", "hadir_terlambat", "hadir_izin_terlambat"}, log.Status) {
			stats["hadir"]++
		} else if log.Status == "izin" {
			stats["izin"]++
		} else if log.Status == "sakit" {
			stats["sakit"]++
		}
	}
	stats["alfa"] = maxInt(len(users)-stats["hadir"]-stats["izin"]-stats["sakit"], 0)
	return httpx.Success(c, "Chart overview berhasil diambil", fiber.Map{"trend7Days": trend, "todayStats": stats, "totalGuru": len(users)})
}

func (h *Handler) leaderboardChart(c *fiber.Ctx) error {
	start, end := periodDates(c.Query("period", "month"), c.Query("start_date"), c.Query("end_date"), h)
	if !validReportRange(start, end) {
		return invalid(c, "Rentang laporan maksimal 366 hari dan tanggal akhir harus setelah tanggal awal")
	}
	calendar, err := h.loadWorkdayCalendar(start, end)
	if err != nil {
		return err
	}
	var users []models.User
	if err := h.db.Where("role = ? AND archived_at IS NULL", "guru").Find(&users).Error; err != nil {
		return err
	}
	var logs []models.AttendanceLog
	if err := h.db.Where("tanggal BETWEEN ? AND ?", start.Format("2006-01-02"), end.Format("2006-01-02")).Find(&logs).Error; err != nil {
		return err
	}
	logsByUserDate := map[string]models.AttendanceLog{}
	for _, log := range logs {
		logsByUserDate[fmt.Sprintf("%d:%s", log.UserID, log.Tanggal.Format("2006-01-02"))] = log
	}
	var schedules []models.JadwalPiket
	if err := h.db.Where("is_active = ?", true).Find(&schedules).Error; err != nil {
		return err
	}
	piketByUserDay := map[string]string{}
	for _, schedule := range schedules {
		piketByUserDay[fmt.Sprintf("%d:%s", schedule.UserID, schedule.Hari)] = clockValue(schedule.JamPulangPiket)
	}

	rows := []map[string]any{}
	for _, user := range users {
		workdays := 0
		hadir, tepatWaktu, terlambat, izin, sakit, lupaPulang := 0, 0, 0, 0, 0, 0
		lemburHari, lemburMenit, records := 0, 0, 0
		for _, date := range dateRange(start, end) {
			ok, _ := calendar.isWorkday(user, date)
			if !ok {
				continue
			}
			workdays++
			log, ok := logsByUserDate[fmt.Sprintf("%d:%s", user.ID, date.Format("2006-01-02"))]
			if !ok {
				continue
			}
			records++
			switch {
			case log.Status == "hadir":
				hadir++
				tepatWaktu++
			case contains([]string{"hadir_terlambat", "hadir_izin_terlambat"}, log.Status):
				hadir++
				terlambat++
			case log.Status == "izin":
				izin++
			case log.Status == "sakit":
				sakit++
			}
			if contains([]string{"hadir", "hadir_terlambat", "hadir_izin_terlambat"}, log.Status) {
				if date.Before(dateOnly(time.Now().In(appLocation(h)))) && isMissingCheckout(log) {
					lupaPulang++
				}
				if minutes, ok := overtimeMinutes(log, date, piketByUserDay); ok {
					lemburHari++
					lemburMenit += minutes
				}
			}
		}
		persentaseKehadiran := 0.0
		if workdays > 0 {
			persentaseKehadiran = float64(hadir) / float64(workdays) * 100
		}
		persentaseTepatWaktu := 0.0
		if hadir > 0 {
			persentaseTepatWaktu = float64(tepatWaktu) / float64(hadir) * 100
		}
		totalPulangLengkap := maxInt(hadir-lupaPulang, 0)
		persentasePulang := 0.0
		if hadir > 0 {
			persentasePulang = float64(totalPulangLengkap) / float64(hadir) * 100
		}
		skorDasar := (persentaseKehadiran * 0.5) + (persentaseTepatWaktu * 0.25) + (persentasePulang * 0.25)
		lemburBonus := float64(lemburMenit) / 60
		skor := mathMin(skorDasar+lemburBonus, 100)
		rows = append(rows, map[string]any{
			"id": user.ID, "nama": user.Nama, "jabatan": user.Jabatan,
			"totalHadir": hadir, "tepatWaktu": tepatWaktu, "terlambat": terlambat,
			"izin": izin, "sakit": sakit, "lupaPulang": lupaPulang,
			"lemburHari": lemburHari, "lemburMenit": lemburMenit, "lemburBonus": fmt.Sprintf("%.1f", lemburBonus),
			"totalPulangLengkap": totalPulangLengkap, "persentasePulang": fmt.Sprintf("%.1f", persentasePulang),
			"tidakPresensi": maxInt(workdays-records, 0), "totalHariAktif": workdays,
			"persentaseKehadiran": fmt.Sprintf("%.1f", persentaseKehadiran), "persentaseTepatWaktu": fmt.Sprintf("%.1f", persentaseTepatWaktu),
			"skor": fmt.Sprintf("%.1f", skor),
		})
	}
	sort.Slice(rows, func(i, j int) bool {
		return parseFloat(rows[i]["skor"]) > parseFloat(rows[j]["skor"])
	})
	return httpx.Success(c, "Leaderboard berhasil diambil", fiber.Map{
		"period": c.Query("period", "month"), "startDate": start.Format("2006-01-02"), "endDate": end.Format("2006-01-02"),
		"totalHariAktif": workingDayCount(users, start, end, calendar), "items": rows,
	})
}

func (h *Handler) checkoutChart(c *fiber.Ctx) error {
	startA, endA := c.Query("startA"), c.Query("endA")
	startB, endB := c.Query("startB"), c.Query("endB")
	if startA == "" || endA == "" {
		return invalid(c, "Periode A wajib diisi")
	}
	if startB == "" || endB == "" {
		startB, endB = startA, endA
	}
	startADate, endADate, err := parseReportRange(startA, endA, appLocation(h))
	if err != nil || !validReportRange(startADate, endADate) {
		return invalid(c, "Rentang periode A maksimal 366 hari dan harus valid")
	}
	startBDate, endBDate, err := parseReportRange(startB, endB, appLocation(h))
	if err != nil || !validReportRange(startBDate, endBDate) {
		return invalid(c, "Rentang periode B maksimal 366 hari dan harus valid")
	}
	a, err := h.checkoutPeriod(startA, endA)
	if err != nil {
		return err
	}
	b, err := h.checkoutPeriod(startB, endB)
	if err != nil {
		return err
	}
	return httpx.Success(c, "Analisis checkout berhasil diambil", fiber.Map{"periodA": a, "periodB": b, "compare": []any{}, "guru": []any{}})
}

func (h *Handler) checkoutPeriod(start, end string) (map[string]any, error) {
	var rows []models.AttendanceLog
	if err := h.db.Select("tanggal, status, jam_pulang").Where("tanggal BETWEEN ? AND ?", start, end).Order("tanggal ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	rowsByDate := map[string][]models.AttendanceLog{}
	for _, log := range rows {
		key := log.Tanggal.Format("2006-01-02")
		rowsByDate[key] = append(rowsByDate[key], log)
	}
	result := []map[string]any{}
	normal, early, forgotten := 0, 0, 0
	for _, date := range dateRange(parseDateLoose(start), parseDateLoose(end)) {
		row := map[string]any{"tanggal": date.Format("2006-01-02"), "normal": 0, "early": 0, "forgotten": 0, "avgMinutes": nil}
		for _, log := range rowsByDate[row["tanggal"].(string)] {
			if !strings.HasPrefix(log.Status, "hadir") {
				continue
			}
			if log.JamPulang == nil || *log.JamPulang == "" || *log.JamPulang == "-" {
				if date.Before(dateOnly(time.Now().In(time.Local))) {
					row["forgotten"] = row["forgotten"].(int) + 1
					forgotten++
				}
			} else {
				row["normal"] = row["normal"].(int) + 1
				normal++
			}
		}
		result = append(result, row)
	}
	total := normal + early + forgotten
	pct := "0.0"
	if total > 0 {
		pct = fmt.Sprintf("%.1f", float64(forgotten)/float64(total)*100)
	}
	return map[string]any{"rows": result, "reasons": []any{}, "summary": map[string]any{"normal": normal, "early": early, "forgotten": forgotten, "avgMins": nil, "pctForgotten": pct}}, nil
}

func (h *Handler) completeStatsChart(c *fiber.Ctx) error {
	days := c.QueryInt("days", 30)
	if days < 1 || days > 365 {
		days = 30
	}
	now := dateOnly(time.Now().In(appLocation(h)))
	start := now.AddDate(0, 0, -(days - 1))
	var logs []models.AttendanceLog
	if err := h.db.Where("tanggal BETWEEN ? AND ?", start.Format("2006-01-02"), now.Format("2006-01-02")).Order("tanggal DESC, id DESC").Find(&logs).Error; err != nil {
		return err
	}
	var users []models.User
	if err := h.db.Where("role = ? AND archived_at IS NULL", "guru").Order("nama ASC").Find(&users).Error; err != nil {
		return err
	}
	var schedules []models.JadwalPiket
	if err := h.db.Where("is_active = ?", true).Find(&schedules).Error; err != nil {
		return err
	}
	piketByUserDay := map[string]string{}
	for _, schedule := range schedules {
		piketByUserDay[fmt.Sprintf("%d:%s", schedule.UserID, schedule.Hari)] = clockValue(schedule.JamPulangPiket)
	}

	statsByGuru := map[uint]map[string]any{}
	for _, user := range users {
		statsByGuru[user.ID] = map[string]any{"id": user.ID, "nama": user.Nama, "total": 0, "terlambat": 0, "persentase": "0.0"}
	}
	checkIns, lateLogs := 0, 0
	latePiket := []map[string]any{}
	earlyCheckouts := []map[string]any{}
	izinSakit := []map[string]any{}
	forgotten := []map[string]any{}
	for _, log := range logs {
		isHadir := contains([]string{"hadir", "hadir_terlambat", "hadir_izin_terlambat"}, log.Status)
		isLate := contains([]string{"hadir_terlambat", "hadir_izin_terlambat"}, log.Status)
		if isHadir {
			checkIns++
			if stat, ok := statsByGuru[log.UserID]; ok {
				stat["total"] = stat["total"].(int) + 1
				if isLate {
					stat["terlambat"] = stat["terlambat"].(int) + 1
				}
			}
		}
		if isLate {
			lateLogs++
			if _, ok := piketByUserDay[fmt.Sprintf("%d:%s", log.UserID, dayName(log.Tanggal.Weekday()))]; ok {
				latePiket = append(latePiket, mapAttendance(log))
			}
		}
		if log.Keterangan != nil && strings.Contains(*log.Keterangan, "Izin Pulang Awal Piket") {
			earlyCheckouts = append(earlyCheckouts, mapAttendance(log))
		}
		if log.Status == "izin" || log.Status == "sakit" {
			izinSakit = append(izinSakit, mapAttendance(log))
		}
		if isHadir && log.Tanggal.Before(now) && isMissingCheckout(log) {
			forgotten = append(forgotten, mapAttendance(log))
		}
	}
	statsPerGuru := make([]map[string]any, 0, len(statsByGuru))
	for _, stat := range statsByGuru {
		total, late := stat["total"].(int), stat["terlambat"].(int)
		pct := 0.0
		if total > 0 {
			pct = float64(late) / float64(total) * 100
		}
		stat["persentase"] = fmt.Sprintf("%.1f", pct)
		statsPerGuru = append(statsPerGuru, stat)
	}
	sort.Slice(statsPerGuru, func(i, j int) bool {
		return parseFloat(statsPerGuru[i]["persentase"]) > parseFloat(statsPerGuru[j]["persentase"])
	})
	totalLatePct := 0.0
	if checkIns > 0 {
		totalLatePct = float64(lateLogs) / float64(checkIns) * 100
	}
	return httpx.Success(c, "Statistik lengkap berhasil diambil", fiber.Map{
		"lateStats": fiber.Map{"totalLatePct": fmt.Sprintf("%.1f", totalLatePct), "statsPerGuru": statsPerGuru, "totalLate": lateLogs},
		"latePiket": latePiket, "earlyCheckouts": earlyCheckouts, "izinSakit": izinSakit, "forgotten": forgotten, "days": days,
	})
}

func isMissingCheckout(log models.AttendanceLog) bool {
	return log.JamPulang == nil || strings.TrimSpace(*log.JamPulang) == "" || *log.JamPulang == "-" || *log.JamPulang == "00:00:00"
}

func overtimeMinutes(log models.AttendanceLog, date time.Time, piketByUserDay map[string]string) (int, bool) {
	if log.JamPulang == nil || strings.TrimSpace(*log.JamPulang) == "" || *log.JamPulang == "-" || *log.JamPulang == "00:00:00" {
		return 0, false
	}
	if log.LokasiPulang != nil && *log.LokasiPulang != "" && *log.LokasiPulang != "sekolah" {
		return 0, false
	}
	normal := "13:00"
	if date.Weekday() == time.Friday {
		normal = "10:15"
	}
	if scheduled, ok := piketByUserDay[fmt.Sprintf("%d:%s", log.UserID, dayName(date.Weekday()))]; ok && scheduled != "" {
		normal = scheduled
	}
	pulang, ok := parseClockMinutes(*log.JamPulang)
	if !ok {
		return 0, false
	}
	base, _ := parseClockMinutes(normal)
	return pulang - base, pulang > base
}

func clockValue(value *string) string {
	if value == nil {
		return ""
	}
	valueText := strings.TrimSpace(*value)
	if len(valueText) >= 5 {
		return valueText[:5]
	}
	return valueText
}

func parseClockMinutes(value string) (int, bool) {
	parts := strings.Split(strings.TrimSpace(value), ":")
	if len(parts) < 2 {
		return 0, false
	}
	hour, errHour := strconv.Atoi(parts[0])
	minute, errMinute := strconv.Atoi(parts[1])
	if errHour != nil || errMinute != nil || hour < 0 || hour > 23 || minute < 0 || minute > 59 {
		return 0, false
	}
	return hour*60 + minute, true
}

func parseFloat(value any) float64 {
	parsed, _ := strconv.ParseFloat(fmt.Sprint(value), 64)
	return parsed
}

func mathMin(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func (h *Handler) teacherWorkdays(c *fiber.Ctx) error {
	claims, err := userClaims(c)
	if err != nil {
		return err
	}
	userID, err := queryUint(c, "user_id")
	if claims.Role == "guru" {
		userID = claims.UserID
	}
	if err != nil && claims.Role != "guru" {
		return invalid(c, "user_id harus diisi")
	}
	var user models.User
	if err := h.db.First(&user, userID).Error; err != nil {
		return httpx.Error(c, fiber.StatusNotFound, "NOT_FOUND", "User tidak ditemukan")
	}
	startValue := c.Query("start_date", time.Now().In(appLocation(h)).Format("2006-01-01"))
	endValue := c.Query("end_date", startValue)
	start, err := parseDate(startValue, appLocation(h))
	if err != nil {
		return invalid(c, "Format start_date tidak valid")
	}
	end, err := parseDate(endValue, appLocation(h))
	if err != nil || end.Before(start) {
		return invalid(c, "Rentang tanggal tidak valid")
	}
	if !validReportRange(start, end) {
		return invalid(c, "Rentang tanggal maksimal 366 hari")
	}
	calendar, err := h.loadWorkdayCalendar(start, end)
	if err != nil {
		return err
	}
	workdays, optional, nonWorkdays := []string{}, []string{}, []string{}
	breakdown := []map[string]any{}
	for _, date := range dateRange(start, end) {
		isWorkday, isOptional := calendar.isWorkday(user, date)
		item := map[string]any{"tanggal": date.Format("2006-01-02"), "day_of_week": int(date.Weekday()), "is_weekend": date.Weekday() == time.Saturday || date.Weekday() == time.Sunday, "is_workday": isWorkday, "is_optional": isOptional, "override": nil}
		breakdown = append(breakdown, item)
		if isWorkday {
			workdays = append(workdays, item["tanggal"].(string))
		} else if isOptional {
			optional = append(optional, item["tanggal"].(string))
		} else {
			nonWorkdays = append(nonWorkdays, item["tanggal"].(string))
		}
	}
	return httpx.Success(c, "Data hari kerja berhasil diambil", fiber.Map{"user_id": userID, "gender": user.JenisKelamin, "start_date": startValue, "end_date": endValue, "total_workdays": len(workdays), "workday_dates": workdays, "non_workday_dates": nonWorkdays, "optional_dates": optional, "optional_workdays": optional, "breakdown": breakdown})
}

func (h *Handler) teachersWorkdays(c *fiber.Ctx) error {
	startValue := c.Query("start_date", time.Now().In(appLocation(h)).Format("2006-01-01"))
	endValue := c.Query("end_date", startValue)
	start, err := parseDate(startValue, appLocation(h))
	if err != nil {
		return invalid(c, "Format start_date tidak valid")
	}
	end, err := parseDate(endValue, appLocation(h))
	if err != nil || end.Before(start) {
		return invalid(c, "Rentang tanggal tidak valid")
	}
	if !validReportRange(start, end) {
		return invalid(c, "Rentang tanggal maksimal 366 hari")
	}
	var users []models.User
	if err := h.db.Where("role = ? AND archived_at IS NULL", "guru").Find(&users).Error; err != nil {
		return err
	}
	calendar, err := h.loadWorkdayCalendar(start, end)
	if err != nil {
		return err
	}
	teachers := map[string]any{}
	for _, user := range users {
		// Reuse the same shape used by the singular endpoint.
		dates := []string{}
		for _, date := range dateRange(start, end) {
			if workday, _ := calendar.isWorkday(user, date); workday {
				dates = append(dates, date.Format("2006-01-02"))
			}
		}
		teachers[fmt.Sprint(user.ID)] = map[string]any{"user_id": user.ID, "workday_dates": dates, "total_workdays": len(dates)}
	}
	return httpx.Success(c, "Data hari kerja semua guru berhasil diambil", fiber.Map{"start_date": startValue, "end_date": endValue, "teachers": teachers, "optional_dates": []string{}})
}

func periodDates(period, startValue, endValue string, h *Handler) (time.Time, time.Time) {
	now := dateOnly(time.Now().In(appLocation(h)))
	if startValue != "" && endValue != "" {
		start, errStart := parseDate(startValue, appLocation(h))
		end, errEnd := parseDate(endValue, appLocation(h))
		if errStart == nil && errEnd == nil {
			if end.After(now) {
				end = now
			}
			if start.After(end) {
				start = end
			}
			return start, end
		}
	}
	switch period {
	case "7days":
		return now.AddDate(0, 0, -6), now
	case "14days":
		return now.AddDate(0, 0, -13), now
	case "30days", "month":
		return now.AddDate(0, 0, -29), now
	case "all":
		var row struct {
			Earliest *time.Time `gorm:"column:earliest"`
		}
		if err := h.db.Model(&models.AttendanceLog{}).Select("MIN(tanggal) AS earliest").Scan(&row).Error; err == nil && row.Earliest != nil && !row.Earliest.IsZero() {
			return dateOnly(*row.Earliest), now
		}
		return now, now
	default:
		return now, now
	}
}

func parseDateLoose(value string) time.Time {
	parsed, _ := time.Parse("2006-01-02", value)
	return parsed
}

func parseReportRange(start, end string, location *time.Location) (time.Time, time.Time, error) {
	startDate, err := parseDate(start, location)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	endDate, err := parseDate(end, location)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	return startDate, endDate, nil
}

func dateOnly(value time.Time) time.Time {
	y, m, d := value.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, value.Location())
}

func dayLabel(date time.Time) string {
	labels := []string{"Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"}
	return labels[int(date.Weekday())] + " " + fmt.Sprintf("%d/%d", date.Day(), int(date.Month()))
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
