import routeData from '../data/routes.json'

export const ISSUE_LABEL = { pothole: 'Pothole', damaged_road: 'Damaged road', waterlogging: 'Waterlogging' }
export const ISSUE_SHAPE = { pothole: 'pothole', damaged_road: 'damage', waterlogging: 'water' }

// weight drives the heatmap; level picks the status icon and colour
export const CONGESTION = {
  free: { label: 'Free', weight: 0.15, level: 'ok' },
  moderate: { label: 'Moderate', weight: 0.4, level: 'warn' },
  heavy: { label: 'Heavy', weight: 0.75, level: 'err' },
  gridlock: { label: 'Gridlock', weight: 1, level: 'err' },
}

const ROUTE_LABEL = Object.fromEntries(routeData.map((r) => [r.id, r.label]))
const ROUTE_DETAIL = Object.fromEntries(routeData.map((r) => [r.id, r.name]))
export const routeName = (code) => ROUTE_LABEL[code] ?? code

const REPORTING_WINDOW_MS = 2 * 60 * 1000
const TRAFFIC_WINDOW_MS = 10 * 60 * 1000
const NEAR_ROUTE_M = 500 // farther than this from every route point counts as off the mapped routes
const ON_TIME_PCT = 90
const SLOWER_PCT = 70

const toRad = (deg) => (deg * Math.PI) / 180

function metres(a, b) {
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

export function nearestRoute(lat, lng) {
  let best = { label: 'an unmapped road', distance: Infinity }
  for (const route of routeData) {
    for (const point of route.points) {
      const d = metres([lat, lng], point)
      if (d < best.distance) best = { label: route.label, distance: d }
    }
  }
  return best.distance <= NEAR_ROUTE_M ? best.label : 'an unmapped road'
}

export function routeDelays(routeSpeeds) {
  return routeSpeeds
    .map((r) => {
      const hasNow = r.recent_reports > 0 && r.now_kmh != null && r.usual_kmh
      const pct = hasNow ? Math.round((r.now_kmh / r.usual_kmh) * 100) : null
      let status = 'No data'
      if (pct != null) status = pct >= ON_TIME_PCT ? 'On time' : pct >= SLOWER_PCT ? 'Slower' : 'Delayed'
      return {
        code: r.route_code,
        name: routeName(r.route_code),
        detail: ROUTE_DETAIL[r.route_code] ?? '',
        usual: r.usual_kmh == null ? null : Math.round(r.usual_kmh * 10) / 10,
        now: r.now_kmh == null ? null : Math.round(r.now_kmh * 10) / 10,
        pct,
        status,
      }
    })
    .sort((a, b) => (a.pct ?? 999) - (b.pct ?? 999))
}

export function fleetStats({ buses, latest, issues, traffic, now }) {
  const reporting = latest.filter((b) => now - new Date(b.recorded_at).getTime() < REPORTING_WINDOW_MS)
  const speeds = reporting.map((b) => b.speed_kmh).filter((s) => s != null)

  const recent = traffic.filter((t) => now - new Date(t.recorded_at).getTime() < TRAFFIC_WINDOW_MS)
  let trafficNow = null
  if (recent.length) {
    const weight = recent.reduce((sum, t) => sum + CONGESTION[t.congestion].weight, 0) / recent.length
    const key = weight < 0.3 ? 'free' : weight < 0.55 ? 'moderate' : weight < 0.85 ? 'heavy' : 'gridlock'
    trafficNow = { key, vehicles: Math.round(recent.reduce((sum, t) => sum + t.vehicle_count, 0) / recent.length) }
  }

  return {
    reporting: reporting.length,
    totalBuses: buses.length,
    openIssues: issues.length,
    mostSeen: issues.reduce((m, i) => Math.max(m, i.detection_count), 0),
    avgSpeed: speeds.length ? Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10 : null,
    trafficNow,
  }
}
