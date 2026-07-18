import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { activityAPI } from '../../services/api'

function LogAktivitas() {
  const [allLogs, setAllLogs] = useState([])
  const [filteredLogs, setFilteredLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [filterPeriod, setFilterPeriod] = useState('7') // Default 7 hari
  const logsPerPage = 50

  useEffect(() => {
    loadLogs()
    
    // Auto refresh setiap 30 detik
    const interval = setInterval(loadLogs, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    filterLogsByPeriod()
    setCurrentPage(1) // Reset ke halaman 1 saat filter berubah
  }, [filterPeriod, allLogs])

  const loadLogs = async () => {
    try {
      setLoading(true)
      const response = await activityAPI.getAll()
      console.log('Activity logs:', response.data)
      setAllLogs(response.data || [])
    } catch (error) {
      console.error('Failed to load activity logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterLogsByPeriod = () => {
    if (filterPeriod === 'all') {
      setFilteredLogs(allLogs)
      return
    }

    const days = parseInt(filterPeriod)
    const now = new Date()
    const cutoffDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000))

    const filtered = allLogs.filter(log => {
      // Parse waktu dari format "dd-mm-yyyy HH:MM:SS"
      const [datePart] = log.waktu.split(' ')
      const [day, month, year] = datePart.split('-')
      const logDate = new Date(year, month - 1, day)
      
      return logDate >= cutoffDate
    })

    setFilteredLogs(filtered)
  }

  // Pagination logic
  const indexOfLastLog = currentPage * logsPerPage
  const indexOfFirstLog = indexOfLastLog - logsPerPage
  const currentLogs = filteredLogs.slice(indexOfFirstLog, indexOfLastLog)
  const totalPages = Math.ceil(filteredLogs.length / logsPerPage)

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1)
    }
  }

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">Log Aktivitas</h1>
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Memuat log aktivitas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Log Aktivitas</h1>
        <button
          onClick={loadLogs}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Filter Periode */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Tampilkan:</label>
          <select
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="1">Hari Ini</option>
            <option value="7">7 Hari Terakhir</option>
            <option value="30">30 Hari Terakhir</option>
            <option value="all">Semua Log</option>
          </select>
          <span className="text-sm text-gray-600">
            Total: <span className="font-semibold">{filteredLogs.length}</span> log
          </span>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Waktu</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Aktivitas</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {currentLogs.length > 0 ? currentLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {log.waktu}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.user}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{log.aktivitas}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold
                      ${log.status.toLowerCase().includes('sukses') || log.status.toLowerCase().includes('hadir') 
                        ? 'bg-green-100 text-green-800' 
                        : log.status.toLowerCase().includes('izin') 
                        ? 'bg-yellow-100 text-yellow-800'
                        : log.status.toLowerCase().includes('sakit')
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                      }
                    `}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                    {filterPeriod === '1' ? 'Tidak ada log hari ini' : 
                     filterPeriod === '7' ? 'Tidak ada log 7 hari terakhir' :
                     filterPeriod === '30' ? 'Tidak ada log 30 hari terakhir' :
                     'Belum ada log aktivitas'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
            <div className="text-sm text-gray-700">
              Menampilkan <span className="font-semibold">{indexOfFirstLog + 1}</span> - <span className="font-semibold">{Math.min(indexOfLastLog, filteredLogs.length)}</span> dari <span className="font-semibold">{filteredLogs.length}</span> log
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={goToPreviousPage}
                disabled={currentPage === 1}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <span className="text-sm text-gray-700">
                Halaman <span className="font-semibold">{currentPage}</span> dari <span className="font-semibold">{totalPages}</span>
              </span>
              <button
                onClick={goToNextPage}
                disabled={currentPage === totalPages}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default LogAktivitas
