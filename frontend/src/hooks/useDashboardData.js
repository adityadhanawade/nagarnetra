import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

const POLL_MS = 10000
const TRAFFIC_HOURS = 3

const empty = { buses: [], latest: [], issues: [], traffic: [], routeSpeeds: [] }

async function fetchAll() {
  const since = new Date(Date.now() - TRAFFIC_HOURS * 3600 * 1000).toISOString()
  const [buses, latest, issues, traffic, routeSpeeds] = await Promise.all([
    supabase.from('buses').select('*').order('id'),
    supabase.from('bus_latest').select('*'),
    supabase
      .from('detected_issues')
      .select('*')
      .eq('status', 'open')
      .order('detection_count', { ascending: false })
      .order('last_seen', { ascending: false })
      .limit(60),
    supabase
      .from('traffic_observations')
      .select('id,bus_id,lat,lng,vehicle_count,congestion,recorded_at')
      .gte('recorded_at', since)
      .order('recorded_at', { ascending: false })
      .limit(2000),
    supabase.from('route_speed_summary').select('*'),
  ])
  const failed = [buses, latest, issues, traffic, routeSpeeds].find((r) => r.error)
  if (failed) throw failed.error
  return {
    buses: buses.data,
    latest: latest.data,
    issues: issues.data,
    traffic: traffic.data,
    routeSpeeds: routeSpeeds.data,
  }
}

export function useDashboardData() {
  const [data, setData] = useState(empty)
  const [status, setStatus] = useState('loading')
  const [live, setLive] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)

  const load = useCallback(async () => {
    try {
      const next = await fetchAll()
      setData(next)
      setStatus('ready')
      setUpdatedAt(Date.now())
    } catch {
      setStatus((s) => (s === 'ready' ? s : 'error'))
    }
  }, [])

  useEffect(() => {
    // fetching on mount is a normal effect; the state update happens after the request resolves
    // oxlint-disable-next-line react/set-state-in-effect
    load()
    const timer = setInterval(() => {
      if (!document.hidden) load()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel('fleet-positions')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bus_positions' }, ({ new: row }) => {
        setData((d) => {
          const known = d.latest.some((b) => b.bus_id === row.bus_id)
          const bus = d.buses.find((b) => b.id === row.bus_id)
          const merged = { bus_id: row.bus_id, route_code: bus?.route_code, label: bus?.label, lat: row.lat, lng: row.lng, speed_kmh: row.speed_kmh, recorded_at: row.recorded_at }
          return { ...d, latest: known ? d.latest.map((b) => (b.bus_id === row.bus_id ? merged : b)) : [...d.latest, merged] }
        })
        setUpdatedAt(Date.now())
      })
      .subscribe((s) => setLive(s === 'SUBSCRIBED'))
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return { ...data, status, live, updatedAt, retry: load }
}
