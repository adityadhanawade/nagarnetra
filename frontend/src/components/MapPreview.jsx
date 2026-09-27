import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { useReducedMotion } from 'motion/react'
import routeData from '../data/routes.json'

const EARTH_RADIUS_M = 6371000
const toRad = (deg) => (deg * Math.PI) / 180

function distance(a, b) {
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

const ROUTES = routeData.map((route) => {
  const cumulative = [0]
  for (let i = 1; i < route.points.length; i++) {
    cumulative.push(cumulative[i - 1] + distance(route.points[i - 1], route.points[i]))
  }
  return { ...route, cumulative, total: cumulative[cumulative.length - 1] }
})

const TOTAL_ISSUES = ROUTES.reduce((n, r) => n + r.pins.length, 0)
const LAP_SECONDS = { R2A: 30, R100: 44, R175: 30 }
const START_AT = { R2A: 0.05, R100: 0.4, R175: 0.6 }

function pointAt(route, progress) {
  const target = progress * route.total
  let lo = 0
  let hi = route.cumulative.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (route.cumulative[mid] <= target) lo = mid
    else hi = mid
  }
  const span = route.cumulative[hi] - route.cumulative[lo] || 1
  const f = (target - route.cumulative[lo]) / span
  const a = route.points[lo]
  const b = route.points[hi]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
}

function dotIcon(kind) {
  return L.divIcon({
    className: 'map-marker',
    html: `<span class="map-dot map-dot--${kind}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

export default function MapPreview() {
  const mapRef = useRef(null)
  const reduce = useReducedMotion()
  const [found, setFound] = useState(0)

  useEffect(() => {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
    })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
    const bounds = L.latLngBounds(ROUTES.flatMap((r) => r.points))
    const fit = () => {
      map.invalidateSize()
      map.fitBounds(bounds, { padding: [28, 28], animate: false })
    }
    fit()
    ROUTES.forEach((r) => L.polyline(r.points, { color: accent, weight: 4, opacity: 0.6 }).addTo(map))

    const buses = ROUTES.map((route) => {
      const progress = START_AT[route.id]
      return {
        route,
        progress,
        marker: L.marker(pointAt(route, progress), { icon: dotIcon('bus'), interactive: false, keyboard: false }).addTo(map),
        pins: route.pins.map((at) => ({
          at,
          shown: false,
          marker: L.marker(pointAt(route, at), { icon: dotIcon('issue'), interactive: false, keyboard: false }),
        })),
      }
    })

    const showPin = (pin) => {
      pin.shown = true
      pin.marker.addTo(map)
    }
    const hidePin = (pin) => {
      pin.shown = false
      pin.marker.remove()
    }
    const countShown = () => buses.reduce((n, b) => n + b.pins.filter((p) => p.shown).length, 0)

    buses.forEach((b) => b.pins.forEach((pin) => (reduce || pin.at <= b.progress ? showPin(pin) : null)))
    setFound(countShown())

    let frame = 0
    let last = performance.now()
    let onScreen = true

    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      if (onScreen && !document.hidden) {
        buses.forEach((b) => {
          const next = b.progress + dt / LAP_SECONDS[b.route.id]
          if (next >= 1) b.pins.forEach(hidePin)
          b.progress = next % 1
          b.marker.setLatLng(pointAt(b.route, b.progress))
          b.pins.forEach((pin) => {
            if (!pin.shown && b.progress >= pin.at) showPin(pin)
          })
        })
        setFound(countShown())
      }
      frame = requestAnimationFrame(tick)
    }

    const watcher = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
    })
    const resizer = new ResizeObserver(fit)
    watcher.observe(mapRef.current)
    resizer.observe(mapRef.current)
    if (!reduce) frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      watcher.disconnect()
      resizer.disconnect()
      map.remove()
    }
  }, [reduce])

  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm font-medium">Sample routes in Pune</p>
        <span className="rounded-xl border border-line-strong px-2 py-0.5 text-xs font-medium text-fg-muted">
          Sample data
        </span>
      </div>
      <div ref={mapRef} aria-hidden="true" className="map-preview h-72 w-full sm:h-80 lg:h-[26rem]" />
      <figcaption className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 text-sm">
        <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-fg-muted">
          <span className="inline-flex items-center gap-2">
            <span className="map-dot map-dot--bus inline-block h-3.5 w-3.5" aria-hidden="true" />
            Bus
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="map-dot map-dot--issue inline-block h-3.5 w-3.5" aria-hidden="true" />
            Road damage found
          </span>
        </p>
        <p className="font-mono text-fg">
          {ROUTES.length} buses, {found} of {TOTAL_ISSUES} issues found
        </p>
      </figcaption>
      <p className="border-t border-line px-4 py-2 text-xs text-fg-muted">
        Map data ©{' '}
        <a className="underline" href="https://www.openstreetmap.org/copyright">
          OpenStreetMap
        </a>{' '}
        contributors
      </p>
    </figure>
  )
}
