import { useCallback, useMemo, useState } from 'react'
import { Broadcast, Bus, Gauge, TrafficSignal, Warning } from '@phosphor-icons/react'
import FleetMap from '../components/dashboard/FleetMap.jsx'
import PriorityList from '../components/dashboard/PriorityList.jsx'
import RouteDelays from '../components/dashboard/RouteDelays.jsx'
import StatTile from '../components/dashboard/StatTile.jsx'
import SiteHeader from '../components/SiteHeader.jsx'
import { useDashboardData } from '../hooks/useDashboardData.js'
import { useNow } from '../hooks/useNow.js'
import { CONGESTION, fleetStats, routeDelays } from '../lib/dashboard.js'
import { formatAgo } from '../lib/format.js'
import { outlineBtn } from '../lib/ui.js'

// Set VITE_DEMO_DATA=false in the production build once real buses report.
const DEMO_DATA = import.meta.env.VITE_DEMO_DATA !== 'false'
const card = 'rounded-xl border border-line bg-surface'

export default function Dashboard() {
  const data = useDashboardData()
  const now = useNow(true)
  const [selectedId, setSelectedId] = useState(null)
  const onSelect = useCallback((id) => setSelectedId(id), [])

  const loading = data.status === 'loading'
  const stats = useMemo(() => fleetStats({ ...data, now }), [data, now])
  const delays = useMemo(() => routeDelays(data.routeSpeeds), [data.routeSpeeds])
  const traffic = stats.trafficNow ? CONGESTION[stats.trafficNow.key] : null

  return (
    <>
      <SiteHeader />
      <main id="main" className="relative z-10 mx-auto max-w-7xl px-4 pb-16 pt-24 md:px-8">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Fleet Dashboard</h1>
            <p className="mt-1 text-fg-muted">What the buses are seeing across the city, right now.</p>
          </div>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            {DEMO_DATA && (
              <span className="rounded-xl border border-line-strong px-2 py-0.5 font-medium text-fg-muted">Demo data</span>
            )}
            <span className="inline-flex items-center gap-1.5 text-fg-muted">
              <Broadcast size={18} weight="bold" aria-hidden="true" />
              {data.live ? 'Live updates on' : 'Refreshing every 10 seconds'}
              {data.updatedAt && `, updated ${formatAgo(now - data.updatedAt)}`}
            </span>
          </p>
        </header>

        {data.status === 'error' && (
          <div role="alert" className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-err/40 bg-err-bg p-4">
            <p className="text-err">Could not reach the database. Check the connection and try again.</p>
            <button type="button" onClick={data.retry} className={`h-11 px-4 ${outlineBtn}`}>
              Try Again
            </button>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            icon={Bus}
            label="Buses Reporting"
            value={loading ? '-' : `${stats.reporting} of ${stats.totalBuses}`}
            detail="Sent a position in the last 2 minutes"
          />
          <StatTile
            icon={Warning}
            label="Open Road Issues"
            value={loading ? '-' : stats.openIssues}
            detail={stats.openIssues ? `Most seen: ${stats.mostSeen} bus passes` : 'None found yet'}
          />
          <StatTile
            icon={TrafficSignal}
            label="Traffic Now"
            value={traffic ? traffic.label : loading ? '-' : 'No data'}
            level={traffic?.level}
            detail={stats.trafficNow ? `About ${stats.trafficNow.vehicles} vehicles in view per bus` : 'No camera readings in 10 minutes'}
          />
          <StatTile
            icon={Gauge}
            label="Average Speed"
            value={stats.avgSpeed == null ? (loading ? '-' : 'No data') : `${stats.avgSpeed} km/h`}
            detail="Across buses reporting now"
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
          <section aria-labelledby="map-title" className={`${card} flex h-[36rem] flex-col pt-4 lg:h-[46rem]`}>
            <h2 id="map-title" className="px-4 pb-3 text-xl font-semibold">Live Fleet Map</h2>
            <FleetMap
              latest={data.latest}
              issues={data.issues}
              traffic={data.traffic}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          </section>

          <section aria-labelledby="priority-title" className={`${card} flex max-h-[40rem] flex-col pt-4 lg:h-[46rem] lg:max-h-none`}>
            <div className="px-4 pb-3">
              <h2 id="priority-title" className="text-xl font-semibold">Repair Priority</h2>
              <p className="mt-1 text-sm text-fg-muted">Ranked by how many bus passes saw each problem.</p>
            </div>
            <PriorityList issues={data.issues} selectedId={selectedId} onSelect={onSelect} now={now} loading={loading} />
          </section>
        </div>

        <section aria-labelledby="routes-title" className={`${card} mt-6 p-4 md:p-6`}>
          <h2 id="routes-title" className="text-xl font-semibold">Route Speed vs Usual</h2>
          <p className="mb-4 mt-1 text-sm text-fg-muted">
            Average bus speed in the last 15 minutes, as a share of each route’s usual speed over the past day.
          </p>
          <RouteDelays rows={delays} loading={loading} />
        </section>
      </main>
    </>
  )
}
