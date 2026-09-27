import { describe, expect, it } from 'vitest'
import { fleetStats, nearestRoute, routeDelays } from './dashboard.js'

describe('routeDelays', () => {
  const row = (over) => ({ route_code: 'R2A', recent_reports: 3, now_kmh: 20, usual_kmh: 20, ...over })

  it('labels speed against usual', () => {
    const out = routeDelays([row({ now_kmh: 19 }), row({ route_code: 'R100', now_kmh: 15 }), row({ route_code: 'R175', now_kmh: 8 })])
    expect(out.map((r) => r.status)).toEqual(['Delayed', 'Slower', 'On time'])
  })

  it('says No data when nobody reported recently', () => {
    expect(routeDelays([row({ recent_reports: 0 })])[0].status).toBe('No data')
  })
})

describe('fleetStats', () => {
  const now = Date.now()
  const ago = (ms) => new Date(now - ms).toISOString()

  it('counts only buses that reported in the last 2 minutes', () => {
    const s = fleetStats({
      buses: [{}, {}],
      latest: [{ recorded_at: ago(30_000), speed_kmh: 20 }, { recorded_at: ago(600_000), speed_kmh: 40 }],
      issues: [],
      traffic: [],
      now,
    })
    expect(s.reporting).toBe(1)
    expect(s.avgSpeed).toBe(20)
    expect(s.trafficNow).toBeNull()
  })

  it('rates traffic from recent readings and ignores old ones', () => {
    const s = fleetStats({
      buses: [],
      latest: [],
      issues: [],
      traffic: [
        { recorded_at: ago(60_000), congestion: 'gridlock', vehicle_count: 20 },
        { recorded_at: ago(3_600_000), congestion: 'free', vehicle_count: 0 },
      ],
      now,
    })
    expect(s.trafficNow).toEqual({ key: 'gridlock', vehicles: 20 })
  })
})

describe('nearestRoute', () => {
  it('falls back for a point far from every route', () => {
    expect(nearestRoute(0, 0)).toBe('an unmapped road')
  })
})
