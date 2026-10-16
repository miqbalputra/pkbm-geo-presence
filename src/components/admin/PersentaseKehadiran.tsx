import { Notice } from '../ui/page'
import { useState, useEffect, useRef } from 'react'
import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts'
import { Activity, UserCheck, FileText, UserX, Users } from 'lucide-react'
import { adminChartsAPI } from '../../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { ChartContainer, type ChartConfig } from '../ui/chart'
import { Progress } from '../ui/progress'
import { Skeleton } from '../ui/skeleton'

const chartConfig = {
  value: { label: 'Sudah Absen', color: 'var(--chart-2)' },
} satisfies ChartConfig

function PersentaseKehadiran() {
  const [stats, setStats] = useState({
    hadir: 0,
    izin: 0,
    sakit: 0,
    alfa: 0,
    belumAbsen: 0,
    total: 0,
    persentase: 0
  })
  const loadRequest = useRef(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  useEffect(() => () => { loadRequest.current++ }, [])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const requestId = ++loadRequest.current
    setLoadError(null)

    try {
      setLoading(true)
      const response = await adminChartsAPI.getOverview()
      if (requestId !== loadRequest.current) return

      setStats(response.data?.todayStats || {
        hadir: 0,
        izin: 0,
        sakit: 0,
        alfa: 0,
        belumAbsen: 0,
        total: 0,
        persentase: 0
      })
    } catch (error) {
      if (requestId !== loadRequest.current) return
      setLoadError('Data analitik belum dapat dimuat. Coba perbarui kembali.')

      console.error('Failed to load attendance stats:', error)
    } finally {
      if (requestId === loadRequest.current) setLoading(false)
    }
  }

  // API lama dapat mengembalikan nilai kosong ketika belum ada guru.
  // Semua nilai turunan dinormalisasi agar chart tidak menghasilkan NaN.
  const hadir = Number(stats.hadir) || 0
  const izin = Number(stats.izin) || 0
  const sakit = Number(stats.sakit) || 0
  const alfa = Number(stats.alfa) || 0
  const belumAbsen = Number(stats.belumAbsen) || 0
  const checkedIn = Math.max(0, hadir + izin + sakit)
  // Beberapa versi endpoint belum mengisi `total`, tetapi sudah mengirim
  // rincian status. Ambil nilai terbesar agar ringkasan tidak kehilangan data.
  const total = Math.max(
    Number(stats.total) || 0,
    checkedIn + alfa,
    checkedIn + belumAbsen,
    checkedIn
  )
  const percentage = total > 0
    ? Math.round((checkedIn / total) * 100)
    : 0
  const safePercentage = percentage

  // Data untuk RadialBarChart
  const chartData = [
    {
      name: 'Sudah Absen',
      value: safePercentage,
      fill: '#10b981' // Emerald green
    }
  ]

  if (loadError) return <Notice onRetry={() => loadData()}>{loadError}</Notice>

  if (loading) {
    return (
      <Card className="p-6">
        <Skeleton className="mb-4 h-6 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </Card>
    )
  }

  return (
    <Card className="p-0">
      {/* Header */}
      <CardHeader className="flex-row items-center gap-3 p-6">
        <div className="rounded-lg bg-emerald-100 p-2 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
          <Activity className="h-5 w-5" />
        </div>
        <div>
          <CardTitle className="text-lg">Persentase Kehadiran Hari Ini</CardTitle>
          <CardDescription>Ringkasan presensi hari ini</CardDescription>
        </div>
      </CardHeader>

      {/* Radial Progress Chart */}
      <CardContent className="px-6">
        <div className="relative">
          <ChartContainer config={chartConfig} className="min-h-[280px]">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="70%"
            outerRadius="90%"
            barSize={32}
            data={chartData}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              angleAxisId={0}
              tick={false}
            />
            <RadialBar
              background={{ fill: 'var(--muted)' }}
              dataKey="value"
              cornerRadius={10}
              fill="var(--color-value)"
            />
          </RadialBarChart>
          </ChartContainer>

        {/* Center Text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-5xl font-bold tracking-tight text-gray-800">
            {safePercentage}%
          </div>
          <div className="text-sm text-gray-500 mt-1">
            Sudah Absen
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {total > 0 ? `${checkedIn} dari ${total} guru` : 'Belum ada data guru'}
          </div>
        </div>
        </div>

      {/* Legend/Detail Stats */}
      <div className="mt-6 border-t border-border pt-6">
        <div className="grid grid-cols-2 gap-4">
          {/* Hadir */}
          <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg">
            <div className="p-2 bg-emerald-500 rounded-lg">
              <UserCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-600">Hadir</p>
              <p className="text-lg font-bold text-emerald-700">{stats.hadir}</p>
            </div>
          </div>

          {/* Izin */}
          <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg">
            <div className="p-2 bg-yellow-500 rounded-lg">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-600">Izin</p>
              <p className="text-lg font-bold text-yellow-700">{stats.izin}</p>
            </div>
          </div>

          {/* Sakit */}
          <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
            <div className="p-2 bg-red-500 rounded-lg">
              <UserX className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-600">Sakit</p>
              <p className="text-lg font-bold text-red-700">{stats.sakit}</p>
            </div>
          </div>

          {/* Alfa */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="p-2 bg-gray-500 rounded-lg">
              <Users className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-600">Alfa</p>
              <p className="text-lg font-bold text-gray-700">{stats.alfa ?? stats.belumAbsen}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar Alternative (Linear) */}
      <div className="mt-6">
        <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
          <span>Progress Hari Ini</span>
          <span className="font-semibold">{safePercentage}%</span>
        </div>
        <Progress value={safePercentage} className="bg-slate-200 [&>div]:bg-emerald-500" />
        <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>
      </CardContent>
    </Card>
  )
}

export default PersentaseKehadiran
