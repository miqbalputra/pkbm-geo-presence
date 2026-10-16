import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { adminAnalyticsAPI } from '../services/api'
import type { AdminAnalyticsData, AdminAnalyticsFilters } from '../types/adminAnalytics'

export function useAdminAnalytics(filters: AdminAnalyticsFilters) {
  const [data, setData] = useState<AdminAnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const requestVersion = useRef(0)
  const key = useMemo(() => JSON.stringify({
    startDate: filters.startDate,
    endDate: filters.endDate,
    tipeGuru: filters.tipeGuru || '',
    userId: filters.userId ? String(filters.userId) : '',
  }), [filters.endDate, filters.startDate, filters.tipeGuru, filters.userId])

  useEffect(() => {
    const controller = new AbortController()
    const version = ++requestVersion.current
    setLoading(true)
    setError('')

    adminAnalyticsAPI.get(JSON.parse(key), controller.signal)
      .then((response) => {
        if (controller.signal.aborted || version !== requestVersion.current) return
        setData(response.data as AdminAnalyticsData)
      })
      .catch((requestError) => {
        if (controller.signal.aborted || version !== requestVersion.current) return
        setError(requestError?.message || 'Analitik belum dapat dimuat. Silakan coba lagi.')
      })
      .finally(() => {
        if (!controller.signal.aborted && version === requestVersion.current) setLoading(false)
      })

    return () => controller.abort()
  }, [key, revision])

  const retry = useCallback(() => setRevision((value) => value + 1), [])
  return { data, loading, error, retry }
}
