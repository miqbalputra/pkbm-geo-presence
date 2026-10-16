import { Notice } from '../ui/page'
import { useState, useEffect, useRef } from 'react'
import {
  ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid,
  Legend, Line
} from 'recharts'
import { LogOut, Clock, Calendar, Info, Users, GitCompare, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { adminChartsAPI } from '../../services/api'
import { Card } from '../ui/card'
import { ChartContainer, ChartTooltip, type ChartConfig } from '../ui/chart'
import { Skeleton } from '../ui/skeleton'

const checkoutChartConfig = {
  normal: { label: 'Normal', color: 'var(--chart-2)' },
  early: { label: 'Pulang Awal', color: 'var(--chart-3)' },
  forgotten: { label: 'Lupa Pulang', color: 'var(--chart-4)' },
  avgMinutes: { label: 'Rata-rata Pulang', color: 'var(--chart-1)' },
  'Lupa Pulang A': { label: 'Lupa Pulang (A)', color: 'var(--chart-1)' },
  'Lupa Pulang B': { label: 'Lupa Pulang (B)', color: 'var(--chart-5)' },
} satisfies ChartConfig

// ─── Helpers ────────────────────────────────────────────────────────────────

const toDateStr = (d) => d.toISOString().split('T')[0]

const addDays = (dateStr, n) => {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

const formatLabel = (dateStr) => {
  const d = new Date(dateStr)
  const days = ['Min','Sen','Sel','Rab','Kam','Jum','Sab']
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth()+1}`
}

const minutesToTime = (mins) => {
  if (mins === null) return '-'
  const h = Math.floor(mins / 60)
  const m = Math.floor(mins % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

// ─── Custom Tooltips ─────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm min-w-[200px]">
      <p className="font-semibold text-gray-700 mb-2">{formatLabel(label)}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }}/>
            <span className="text-gray-600">{p.name}</span>
          </div>
          <span className="font-bold text-gray-800">
            {p.dataKey === 'avgMinutes' ? minutesToTime(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

const CompareTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm min-w-[200px]">
      <p className="font-semibold text-gray-700 mb-2">Hari ke-{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: p.fill || p.color }}/>
            <span className="text-gray-600">{p.name}</span>
          </div>
          <span className="font-bold text-gray-800">{p.value}%</span>
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

function TrenJamPulang() {
  const todayStr = toDateStr(new Date())
  const [mode, setMode] = useState('trend') // 'trend' | 'compare'

  // Periode A
  const [periodeA, setPeriodeA] = useState({ start: addDays(todayStr, -13), end: todayStr })
  // Periode B (mode compare)
  const [periodeB, setPeriodeB] = useState({ start: addDays(todayStr, -27), end: addDays(todayStr, -14) })

  const [selectedGuru, setSelectedGuru] = useState('all')
  const [dataGuru, setDataGuru] = useState([])
  const loadRequest = useRef(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  useEffect(() => () => { loadRequest.current++ }, [])
  const [loading, setLoading] = useState(true)

  // Chart data
  const [chartData, setChartData] = useState([])
  const [compareData, setCompareData] = useState([])
  const [statsA, setStatsA] = useState<any>({ normal: 0, early: 0, forgotten: 0, avgMins: null, pctForgotten: '0.0' })
  const [statsB, setStatsB] = useState<any>({ normal: 0, early: 0, forgotten: 0, avgMins: null, pctForgotten: '0.0' })
  const [earlyReasons, setEarlyReasons] = useState([])

  useEffect(() => { loadData() }, [periodeA, periodeB, selectedGuru])

  const loadData = async () => {
    const requestId = ++loadRequest.current
    setLoadError(null)

    try {
      setLoading(true)
      const response = await adminChartsAPI.getCheckout({
        startA: periodeA.start,
        endA: periodeA.end,
        startB: periodeB.start,
        endB: periodeB.end,
        userId: selectedGuru
      })
      if (requestId !== loadRequest.current) return

      const data = response.data || {}
      setDataGuru(data.guru || [])
      setChartData(data.periodA?.rows || [])
      setStatsA(data.periodA?.summary || { normal: 0, early: 0, forgotten: 0, avgMins: null, pctForgotten: '0.0' })
      setEarlyReasons(data.periodA?.reasons || [])
      setStatsB(data.periodB?.summary || { normal: 0, early: 0, forgotten: 0, avgMins: null, pctForgotten: '0.0' })
      setCompareData(data.compare || [])
    } catch (e) {
      if (requestId !== loadRequest.current) return
      setLoadError('Data analitik belum dapat dimuat. Coba perbarui kembali.')

      console.error('TrenJamPulang: gagal muat data', e)
    } finally {
      if (requestId === loadRequest.current) setLoading(false)
    }
  }

  // Delta forgotten
  const delta = parseFloat(statsA.pctForgotten) - parseFloat(statsB.pctForgotten)
  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus
  const deltaColor = delta > 0 ? 'text-red-600' : delta < 0 ? 'text-emerald-600' : 'text-gray-500'
  const deltaBg = delta > 0 ? 'bg-red-50 border-red-200' : delta < 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'
  const deltaLabel = delta > 0 ? `Lupa Checkout Naik ${Math.abs(delta).toFixed(1)}%` : delta < 0 ? `Lupa Checkout Turun ${Math.abs(delta).toFixed(1)}%` : 'Stagnan'

  if (loadError) return <Notice onRetry={() => loadData()}>{loadError}</Notice>

  if (loading) return (
    <Card className="col-span-full p-6">
      <Skeleton className="mb-4 h-6 w-1/3" />
      <Skeleton className="h-72 w-full" />
    </Card>
  )

  return (
    <Card className="col-span-full gap-0 p-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-xl">
            <LogOut className="w-5 h-5 text-indigo-600"/>
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-800">Tren Presensi Pulang</h2>
            <p className="text-xs text-gray-500">Analisis checkout & keteraturan jam pulang</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Guru Filter */}
          <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-xl border border-gray-200">
            <div className="pl-3 py-1"><Users className="w-4 h-4 text-gray-400"/></div>
            <select aria-label="Filter guru" value={selectedGuru} onChange={e => setSelectedGuru(e.target.value)}
              className="bg-transparent text-xs font-semibold text-gray-700 py-1.5 pr-3 outline-none min-w-[120px]">
              <option value="all">Semua Guru</option>
              {dataGuru.map(g => (<option key={g.id} value={g.id}>{g.nama}</option>))}
            </select>
          </div>

          {/* Mode Toggle */}
          <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1">
            <button onClick={() => setMode('trend')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                mode === 'trend' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <Clock className="w-3.5 h-3.5"/> Tren
            </button>
            <button onClick={() => setMode('compare')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                mode === 'compare' ? 'bg-white shadow text-purple-700' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <GitCompare className="w-3.5 h-3.5"/> Bandingkan
            </button>
          </div>
        </div>
      </div>

      {/* ── Period Controls ─────────────────────────────────────────────── */}
      <div className={`grid gap-3 mb-6 ${mode === 'compare' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
        <div className={`flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-xl border ${mode === 'compare' ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
          <Calendar className="w-4 h-4 text-gray-500"/>
          <span className="text-xs font-semibold text-gray-700">{mode === 'compare' ? 'Periode A' : 'Periode'}</span>
          <input aria-label="Tanggal awal periode A" type="date" value={periodeA.start} max={periodeA.end} onChange={e => setPeriodeA(p => ({ ...p, start: e.target.value }))} className="text-xs px-2 py-1 border border-gray-300 rounded-lg bg-white outline-none"/>
          <span className="text-xs text-gray-400">s/d</span>
          <input aria-label="Tanggal akhir periode A" type="date" value={periodeA.end} min={periodeA.start} max={todayStr} onChange={e => setPeriodeA(p => ({ ...p, end: e.target.value }))} className="text-xs px-2 py-1 border border-gray-300 rounded-lg bg-white outline-none"/>
        </div>

        {mode === 'compare' && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-xl border border-purple-200 bg-purple-50">
            <Calendar className="w-4 h-4 text-purple-500"/>
            <span className="text-xs font-semibold text-purple-700">Periode B</span>
            <input aria-label="Tanggal awal periode B" type="date" value={periodeB.start} max={periodeB.end} onChange={e => setPeriodeB(p => ({ ...p, start: e.target.value }))} className="text-xs px-2 py-1 border border-gray-300 rounded-lg bg-white outline-none"/>
            <span className="text-xs text-gray-400">s/d</span>
            <input aria-label="Tanggal akhir periode B" type="date" value={periodeB.end} min={periodeB.start} max={todayStr} onChange={e => setPeriodeB(p => ({ ...p, end: e.target.value }))} className="text-xs px-2 py-1 border border-gray-300 rounded-lg bg-white outline-none"/>
          </div>
        )}
      </div>

      {/* ── Mode: TREND ─────────────────────────────────────────────────── */}
      {mode === 'trend' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
              <p className="text-xs text-emerald-600 font-black uppercase tracking-wider">Normal</p>
              <p className="text-2xl font-black text-emerald-800">{statsA.normal}</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-3 border border-orange-100">
              <p className="text-xs text-orange-600 font-black uppercase tracking-wider">Pulang Awal</p>
              <p className="text-2xl font-black text-orange-800">{statsA.early}</p>
            </div>
            <div className="bg-rose-50 rounded-xl p-3 border border-rose-100">
              <p className="text-xs text-rose-600 font-black uppercase tracking-wider">Lupa Checkout</p>
              <p className="text-2xl font-black text-rose-800">{statsA.forgotten}</p>
            </div>
            <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
              <p className="text-xs text-indigo-600 font-black uppercase tracking-wider">Rata-rata Pulang</p>
              <p className="text-2xl font-black text-indigo-800">{minutesToTime(statsA.avgMins)}</p>
            </div>
          </div>

          <ChartContainer config={checkoutChartConfig} className="mb-8 h-80">
              <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gNormal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                  <linearGradient id="gEarly" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="tanggal" tickFormatter={formatLabel} style={{ fontSize: 10 }} stroke="#9ca3af"/>
                <YAxis yAxisId="left" allowDecimals={false} style={{ fontSize: 10 }} stroke="#9ca3af" label={{ value: 'Jumlah', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }}/>
                <YAxis yAxisId="right" orientation="right" domain={[0, 1440]} tickFormatter={minutesToTime} style={{ fontSize: 10 }} stroke="#6366f1" label={{ value: 'Jam Pulang', angle: 90, position: 'insideRight', style: { fontSize: 10 } }}/>
                <ChartTooltip content={<CustomTooltip/>}/>
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }}/>
                <Area yAxisId="left" type="monotone" dataKey="normal" name="Normal" stroke="#10b981" fill="url(#gNormal)" dot={{ r: 3 }}/>
                <Area yAxisId="left" type="monotone" dataKey="early" name="Izin Awal" stroke="#f59e0b" fill="url(#gEarly)" dot={{ r: 3 }}/>
                <Bar yAxisId="left" dataKey="forgotten" name="Lupa Pulang" fill="#f43f5e" radius={[4,4,0,0]} opacity={0.7}/>
                <Line yAxisId="right" type="monotone" dataKey="avgMinutes" name="Waktu Rata-rata" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, fill: '#6366f1' }}/>
              </ComposedChart>
          </ChartContainer>
        </>
      )}

      {/* ── Mode: COMPARE ───────────────────────────────────────────────── */}
      {mode === 'compare' && (
        <>
          <div className={`flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl border mb-6 ${deltaBg}`}>
            <div className={`flex items-center gap-2 ${deltaColor}`}><DeltaIcon className="w-6 h-6"/><span className="text-lg font-bold">{deltaLabel}</span></div>
            <div className="flex-1 text-sm text-gray-600 text-center sm:text-left">
              Persentase lupa checkout periode A <strong className="text-blue-700">{statsA.pctForgotten}%</strong> vs periode B <strong className="text-purple-700">{statsB.pctForgotten}%</strong>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="border border-blue-200 rounded-xl p-3 bg-blue-50">
              <p className="text-xs font-bold text-blue-700 mb-1">Periode A</p>
              <div className="flex justify-between text-xs mt-2"><span className="text-gray-500">Lupa Pulang:</span><span className="font-bold text-rose-600">{statsA.forgotten}</span></div>
              <div className="flex justify-between text-xs"><span className="text-gray-500">Avg Pulang:</span><span className="font-bold text-blue-600">{minutesToTime(statsA.avgMins)}</span></div>
            </div>
            <div className="border border-purple-200 rounded-xl p-3 bg-purple-50">
              <p className="text-xs font-bold text-purple-700 mb-1">Periode B</p>
              <div className="flex justify-between text-xs mt-2"><span className="text-gray-500">Lupa Pulang:</span><span className="font-bold text-rose-600">{statsB.forgotten}</span></div>
              <div className="flex justify-between text-xs"><span className="text-gray-500">Avg Pulang:</span><span className="font-bold text-purple-600">{minutesToTime(statsB.avgMins)}</span></div>
            </div>
          </div>

          <ChartContainer config={checkoutChartConfig} className="mb-6 h-64">
              <ComposedChart data={compareData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="day" style={{ fontSize: 10 }} stroke="#9ca3af"/>
                <YAxis tickFormatter={v => `${v}%`} style={{ fontSize: 10 }} stroke="#9ca3af"/>
                <ChartTooltip content={<CompareTooltip/>}/>
                <Legend wrapperStyle={{ fontSize: 11 }}/>
                <Bar dataKey="Lupa Pulang A" name="Lupa Pulang (A)" fill="#3b82f6" radius={[3,3,0,0]}/>
                <Bar dataKey="Lupa Pulang B" name="Lupa Pulang (B)" fill="#a855f7" radius={[3,3,0,0]}/>
              </ComposedChart>
          </ChartContainer>
        </>
      )}

      {/* Alasan Pulang Awal List */}
      <div className="border-t border-gray-100 pt-6">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-4 h-4 text-indigo-500"/>
          <h3 className="font-bold text-gray-800 text-sm">Detail Alasan Pulang Awal (Piket)</h3>
        </div>
        <div className="overflow-x-auto">
          {earlyReasons.length > 0 ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-gray-50 text-left uppercase tracking-wider">
                  <th className="py-2">Nama Guru</th><th className="py-2">Tanggal</th><th className="text-center py-2">Jam</th><th className="py-2">Alasan Izin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {earlyReasons.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="py-2.5 font-bold text-gray-700">{r.nama}</td>
                    <td className="py-2.5 text-gray-500">{r.tanggal}</td>
                    <td className="py-2.5 text-center"><span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-bold">{r.jam}</span></td>
                    <td className="py-2.5 text-gray-600 italic">"{r.alasan}"</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-6 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-xs"><p>Tidak ada data izin pulang awal dalam periode ini</p></div>
          )}
        </div>
      </div>
    </Card>
  )
}

export default TrenJamPulang
