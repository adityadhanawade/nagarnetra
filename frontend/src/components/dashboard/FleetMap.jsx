import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import routeData from '../../data/routes.json'
import { CONGESTION, ISSUE_LABEL, ISSUE_SHAPE, nearestRoute } from '../../lib/dashboard.js'

const HEAT_GRADIENT = { 0.15: '#d9d8f5', 0.4: '#a5a3e8', 0.7: '#5e5bd0', 1: '#2a2790' }
const LAYER_OPTIONS = [
  { key: 'buses', label: 'Buses' },
  { key: 'issues', label: 'Road issues' },
  { key: 'heat', label: 'Traffic heat' },
]

const busIcon = L.divIcon({
  className: 'map-marker',
  html: '<span class="map-dot map-dot--bus"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

function issueIcon(issue, selected) {
  const size = Math.round(14 + Math.min(issue.detection_count, 15) * 1.2)
  const shape = ISSUE_SHAPE[issue.type]
  return L.divIcon({
    className: `map-marker${selected ? ' issue-selected' : ''}`,
    html: `<span class="issue-dot issue-dot--${shape}"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

export default function FleetMap({ latest, issues, traffic, selectedId, onSelect }) {
  const mapEl = useRef(null)
  const parts = useRef({})
  const previousSelected = useRef(null)
  const [layers, setLayers] = useState({ buses: true, issues: true, heat: true })

  useEffect(() => {
    let cancelled = false
    const map = L.map(mapEl.current, { zoomControl: true, attributionControl: false })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
    const bounds = L.latLngBounds(routeData.flatMap((r) => r.points))
    routeData.forEach((r) => L.polyline(r.points, { color: '#3f3cbb', weight: 3, opacity: 0.3 }).addTo(map))
    map.fitBounds(bounds, { padding: [24, 24], animate: false })

    const busGroup = L.layerGroup().addTo(map)
    const issueGroup = L.layerGroup().addTo(map)
    parts.current = { map, busGroup, issueGroup, busMarkers: new Map(), heat: null, heatPoints: [], heatOn: true }

    window.L = L
    import('leaflet.heat').then(() => {
      if (cancelled) return
      const heat = L.heatLayer(parts.current.heatPoints, { radius: 30, blur: 24, max: 1, minOpacity: 0.25, gradient: HEAT_GRADIENT })
      parts.current.heat = heat
      if (parts.current.heatOn) heat.addTo(map)
    })

    let fitted = false
    const resizer = new ResizeObserver(() => {
      map.invalidateSize()
      if (!fitted && mapEl.current.clientHeight > 0) {
        fitted = true
        map.fitBounds(bounds, { padding: [24, 24], animate: false })
      }
    })
    resizer.observe(mapEl.current)

    return () => {
      cancelled = true
      resizer.disconnect()
      // leaflet.heat schedules a redraw on the next frame; cancel it or it fires on a removed map
      const heat = parts.current.heat
      if (heat) {
        heat.remove()
        L.Util.cancelAnimFrame(heat._frame)
      }
      map.remove()
      parts.current = {}
    }
  }, [])

  useEffect(() => {
    const { busGroup, busMarkers } = parts.current
    if (!busGroup) return
    const seen = new Set()
    latest.forEach((bus) => {
      seen.add(bus.bus_id)
      const at = [bus.lat, bus.lng]
      const marker = busMarkers.get(bus.bus_id)
      if (marker) {
        marker.setLatLng(at)
      } else {
        const created = L.marker(at, { icon: busIcon, keyboard: false })
        created.bindTooltip(bus.bus_id, { permanent: true, direction: 'right', offset: [10, 0], className: 'bus-label' })
        created.addTo(busGroup)
        busMarkers.set(bus.bus_id, created)
      }
    })
    for (const [id, marker] of busMarkers) {
      if (!seen.has(id)) {
        busGroup.removeLayer(marker)
        busMarkers.delete(id)
      }
    }
  }, [latest])

  useEffect(() => {
    const { issueGroup } = parts.current
    if (!issueGroup) return
    issueGroup.clearLayers()
    issues.forEach((issue) => {
      const marker = L.marker([issue.lat, issue.lng], { icon: issueIcon(issue, issue.id === selectedId), keyboard: false })
      marker.bindTooltip(
        `${ISSUE_LABEL[issue.type]}, seen ${issue.detection_count} ${issue.detection_count === 1 ? 'time' : 'times'}<br>Near ${nearestRoute(issue.lat, issue.lng)}`,
        { direction: 'top', offset: [0, -6] },
      )
      marker.on('click', () => onSelect(issue.id))
      marker.addTo(issueGroup)
    })
  }, [issues, selectedId, onSelect])

  useEffect(() => {
    const points = traffic.map((t) => [t.lat, t.lng, CONGESTION[t.congestion].weight])
    parts.current.heatPoints = points
    parts.current.heat?.setLatLngs(points)
  }, [traffic])

  useEffect(() => {
    const { map, busGroup, issueGroup, heat } = parts.current
    if (!map) return
    const toggle = (layer, on) => {
      if (!layer) return
      if (on && !map.hasLayer(layer)) layer.addTo(map)
      if (!on && map.hasLayer(layer)) map.removeLayer(layer)
    }
    toggle(busGroup, layers.buses)
    toggle(issueGroup, layers.issues)
    parts.current.heatOn = layers.heat
    toggle(heat, layers.heat)
  }, [layers])

  useEffect(() => {
    if (selectedId == null || selectedId === previousSelected.current) return
    previousSelected.current = selectedId
    const issue = issues.find((i) => i.id === selectedId)
    if (!issue || !parts.current.map) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    parts.current.map.flyTo([issue.lat, issue.lng], 16, { animate: !reduceMotion, duration: 0.8 })
  }, [selectedId, issues])

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 pb-3" role="group" aria-label="Map layers">
        {LAYER_OPTIONS.map(({ key, label }) => (
          <label key={key} className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={layers[key]}
              onChange={(e) => setLayers((l) => ({ ...l, [key]: e.target.checked }))}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            {label}
          </label>
        ))}
      </div>

      <div ref={mapEl} role="region" aria-label="Fleet map" className="map-preview min-h-80 w-full flex-1" />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm text-fg-muted">
        <span className="inline-flex items-center gap-2">
          <span className="map-dot map-dot--bus inline-block h-3.5 w-3.5" aria-hidden="true" />
          Bus
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="issue-dot issue-dot--pothole inline-block h-3.5 w-3.5" aria-hidden="true" />
          Pothole
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="issue-dot issue-dot--damage inline-block h-3.5 w-3.5" aria-hidden="true" />
          Damaged road
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="issue-dot issue-dot--water inline-block h-3.5 w-3.5" aria-hidden="true" />
          Waterlogging
        </span>
        <span className="inline-flex items-center gap-2">
          Traffic
          <span className="heat-bar inline-block h-2.5 w-20 rounded-xl" aria-hidden="true" />
          Free to gridlock
        </span>
      </div>
      <p className="border-t border-line px-4 py-2 text-xs text-fg-muted">
        Map data ©{' '}
        <a className="underline" href="https://www.openstreetmap.org/copyright">
          OpenStreetMap
        </a>{' '}
        contributors. Larger markers were seen by more bus passes.
      </p>
    </div>
  )
}
