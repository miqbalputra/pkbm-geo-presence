import { useState, useEffect } from 'react'
import { RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis } from 'recharts'
import { Activity, UserCheck, FileText, UserX, Users } from 'lucide-react'
import { adminChartsAPI } from '../../services/api'

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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const response = await adminChartsAPI.getOverview()
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
      console.error('Failed to load attendance stats:', error)
    } finally {
      setLoading(false)
    }
  }

  // Data untuk RadialBarChart
  const chartData = [
    {
      name: 'Sudah Absen',
      value: stats.persentase,
      fill: '#10b981' // Emerald green
    }
  ]

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-2/3 mb-4"></div>
          <div className="h-64 bg-gray-100 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-emerald-100 rounded-lg">
          <Activity className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Persentase Kehadiran Hari Ini</h2>
          <p className="text-sm text-gray-500">Progress Presensi Real-time</p>
        </div>
      </div>

      {/* Radial Progress Chart */}
      <div className="relative">
        <ResponsiveContainer width="100%" height={280}>
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
              background={{ fill: '#e5e7eb' }}
              dataKey="value"
              cornerRadius={10}
              fill="#10b981"
            />
          </RadialBarChart>
        </ResponsiveContainer>

        {/* Center Text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-5xl font-bold text-gray-800">
            {stats.persentase}%
          </div>
          <div className="text-sm text-gray-500 mt-1">
            Sudah Absen
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {stats.total - stats.belumAbsen} dari {stats.total} guru
          </div>
        </div>
      </div>

      {/* Legend/Detail Stats */}
      <div className="mt-6 pt-6 border-t border-gray-200">
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
          <span className="font-semibold">{stats.persentase}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div className="flex h-full">
            {/* Hadir */}
            {stats.hadir > 0 && (
              <div
                className="bg-emerald-500 transition-all duration-500"
                style={{ width: `${(stats.hadir / stats.total) * 100}%` }}
                title={`Hadir: ${stats.hadir}`}
              />
            )}
            {/* Izin */}
            {stats.izin > 0 && (
              <div
                className="bg-yellow-500 transition-all duration-500"
                style={{ width: `${(stats.izin / stats.total) * 100}%` }}
                title={`Izin: ${stats.izin}`}
              />
            )}
            {/* Sakit */}
            {stats.sakit > 0 && (
              <div
                className="bg-red-500 transition-all duration-500"
                style={{ width: `${(stats.sakit / stats.total) * 100}%` }}
                title={`Sakit: ${stats.sakit}`}
              />
            )}
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  )
}

export default PersentaseKehadiran
