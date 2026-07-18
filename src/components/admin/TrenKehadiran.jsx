import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp } from 'lucide-react'
import { adminChartsAPI } from '../../services/api'

// Custom Tooltip
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-4 rounded-lg shadow-lg border border-gray-200">
        <p className="font-semibold text-gray-800 mb-2">{label}</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
            <span className="text-sm text-gray-600">Hadir:</span>
            <span className="font-semibold text-emerald-700">{payload[0].value} orang</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-rose-500"></div>
            <span className="text-sm text-gray-600">Tidak Hadir:</span>
            <span className="font-semibold text-rose-700">{payload[1].value} orang</span>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-gray-200">
          <span className="text-xs text-gray-500">Total: {payload[0].value + payload[1].value} guru</span>
        </div>
      </div>
    )
  }
  return null
}

function TrenKehadiran() {
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ avgHadir: 0, avgTidakHadir: 0 })

  useEffect(() => {
    loadTrenData()
  }, [])

  const loadTrenData = async () => {
    try {
      setLoading(true)
      
      const response = await adminChartsAPI.getOverview()
      const chartArray = response.data?.trend7Days || []
      setChartData(chartArray)
      
      // Calculate average (hanya hari yang ada data)
      const daysWithData = chartArray.filter(day => day.hadir > 0 || day.tidakHadir > 0)
      const totalDays = daysWithData.length > 0 ? daysWithData.length : 7
      
      const totalHadir = chartArray.reduce((sum, day) => sum + day.hadir, 0)
      const totalTidakHadir = chartArray.reduce((sum, day) => sum + day.tidakHadir, 0)
      
      setStats({
        avgHadir: totalDays > 0 ? Math.round(totalHadir / totalDays) : 0,
        avgTidakHadir: totalDays > 0 ? Math.round(totalTidakHadir / totalDays) : 0
      })
      
    } catch (error) {
      console.error('Failed to load trend data:', error)
      // Set empty data on error
      setChartData([])
      setStats({ avgHadir: 0, avgTidakHadir: 0 })
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-64 bg-gray-100 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <TrendingUp className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Tren Kehadiran</h2>
            <p className="text-sm text-gray-500">7 Hari Terakhir</p>
          </div>
        </div>
        
        {/* Stats Summary */}
        <div className="flex gap-4">
          <div className="text-right">
            <p className="text-xs text-gray-500">Rata-rata Hadir</p>
            <p className="text-lg font-bold text-emerald-600">{stats.avgHadir}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Rata-rata Tidak Hadir</p>
            <p className="text-lg font-bold text-rose-600">{stats.avgTidakHadir}</p>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="w-full h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <defs>
              {/* Gradient untuk Hadir */}
              <linearGradient id="colorHadir" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
              {/* Gradient untuk Tidak Hadir */}
              <linearGradient id="colorTidakHadir" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
              </linearGradient>
            </defs>
            
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            
            <XAxis 
              dataKey="tanggal" 
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            
            <YAxis 
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
              allowDecimals={false}
              label={{ value: 'Jumlah Guru', angle: -90, position: 'insideLeft', style: { fontSize: '12px', fill: '#6b7280' } }}
            />
            
            <Tooltip content={<CustomTooltip />} />
            
            {/* Area Hadir */}
            <Area 
              type="monotone" 
              dataKey="hadir" 
              stroke="#10b981" 
              strokeWidth={2}
              fill="url(#colorHadir)" 
              name="Hadir"
            />
            
            {/* Area Tidak Hadir */}
            <Area 
              type="monotone" 
              dataKey="tidakHadir" 
              stroke="#f43f5e" 
              strokeWidth={2}
              fill="url(#colorTidakHadir)" 
              name="Tidak Hadir"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-emerald-500"></div>
          <span className="text-sm text-gray-600">Hadir</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-rose-500"></div>
          <span className="text-sm text-gray-600">Tidak Hadir (Izin/Sakit)</span>
        </div>
      </div>
    </div>
  )
}

export default TrenKehadiran
