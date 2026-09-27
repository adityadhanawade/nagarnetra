import { useEffect, useState } from 'react'
import StarsBackground from '../components/StarsBackground.jsx'
import { getDeviceKey, setDeviceKey } from '../lib/api.js'
import { Link } from 'react-router-dom'
import { Bus, CloudArrowUp, DeviceMobile, MapPin, Camera } from '@phosphor-icons/react'
import StatusCard from '../components/StatusCard.jsx'
import { useBuses } from '../hooks/useBuses.js'
import { useCameraCapture } from '../hooks/useCameraCapture.js'
import { useGpsTracker } from '../hooks/useGpsTracker.js'
import { useNow } from '../hooks/useNow.js'
import { useWakeLock } from '../hooks/useWakeLock.js'
import { formatAgo, formatCount, formatDuration } from '../lib/format.js'
import { dangerBtn, outlineBtn, primaryBtn } from '../lib/ui.js'

const BUS_KEY = 'nagarnetra.busId'
const STALE_UPLOAD_MS = 20000
const WEAK_GPS_METRES = 50


function readSavedBus() {
  try {
    return localStorage.getItem(BUS_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveBus(id) {
  try {
    localStorage.setItem(BUS_KEY, id)
  } catch {
    /* storage can be blocked; the choice just is not remembered */
  }
}

function describeGps(gps) {
  switch (gps.state) {
    case 'searching':
      return { level: 'warn', value: 'Searching', detail: 'Waiting for a location fix…' }
    case 'locked': {
      const parts = [`Accuracy ${Math.round(gps.accuracy)} m`]
      if (gps.speedKmh != null) parts.push(`${Math.round(gps.speedKmh)} km/h`)
      const weak = gps.accuracy > WEAK_GPS_METRES
      return { level: weak ? 'warn' : 'ok', value: weak ? 'Weak signal' : 'Locked', detail: parts.join(', ') }
    }
    case 'denied':
      return { level: 'err', value: 'Blocked', detail: 'Allow location for this site in browser settings' }
    case 'unsupported':
      return { level: 'err', value: 'Unsupported', detail: 'This browser cannot read location' }
    case 'error':
      return { level: 'err', value: 'Unavailable', detail: 'Location could not be read' }
    default:
      return { level: 'warn', value: 'Starting', detail: 'Preparing…' }
  }
}

function describeLastFrame(cam) {
  if (!cam.lastResult) return `${formatCount(cam.sentCount)} ${cam.sentCount === 1 ? 'frame' : 'frames'} sent`
  const { vehicles, congestion } = cam.lastResult
  return `${formatCount(vehicles)} ${vehicles === 1 ? 'vehicle' : 'vehicles'} in view, ${congestion} traffic`
}

function describeCamera(cam) {
  switch (cam.state) {
    case 'live':
      return cam.waitingForGps
        ? { level: 'warn', value: 'Waiting for GPS', detail: 'Frames are held until location is found' }
        : { level: 'ok', value: 'Live', detail: describeLastFrame(cam) }
    case 'denied':
      return { level: 'err', value: 'Blocked', detail: 'Allow camera for this site in browser settings' }
    case 'unsupported':
      return { level: 'err', value: 'Unsupported', detail: 'Open this page in Chrome or Safari over HTTPS' }
    case 'error':
      return { level: 'err', value: 'Unavailable', detail: 'No usable camera found' }
    default:
      return { level: 'warn', value: 'Starting', detail: 'Opening the camera…' }
  }
}

function describeUploads(gps, cam, now) {
  const lastOk = Math.max(gps.lastSentAt ?? 0, cam.lastSentAt ?? 0)
  const failed = gps.failCount + cam.failCount
  if (!lastOk) return { level: 'warn', value: 'Waiting', detail: 'Nothing sent yet' }
  const age = now - lastOk
  const failNote = failed ? `, ${formatCount(failed)} failed` : ''
  if (age > STALE_UPLOAD_MS) {
    return { level: 'err', value: 'No connection', detail: `Last sent ${formatAgo(age)}${failNote}` }
  }
  return { level: 'ok', value: 'Sending', detail: `Last sent ${formatAgo(age)}${failNote}` }
}

function describeScreen(wake) {
  return wake === 'on'
    ? { level: 'ok', value: 'Stays on', detail: 'Screen will not sleep' }
    : { level: 'warn', value: 'May sleep', detail: 'Turn off auto-lock in phone settings' }
}

function BusPicker({ busId, onChange }) {
  const { status, buses, retry } = useBuses()

  useEffect(() => {
    if (status === 'ready' && busId && !buses.some((b) => b.id === busId)) onChange('')
  }, [status, buses, busId, onChange])

  if (status === 'loading') {
    return (
      <div
        role="status"
        aria-label="Loading buses…"
        className="h-14 animate-pulse rounded-xl bg-line motion-reduce:animate-none"
      />
    )
  }
  if (status === 'error') {
    return (
      <div role="alert" className="rounded-xl border border-err/40 bg-err-bg p-4">
        <p className="text-err">Could not load the bus list. Check the connection and try again.</p>
        <button type="button" onClick={retry} className={`mt-3 h-12 px-5 ${outlineBtn}`}>
          Try Again
        </button>
      </div>
    )
  }
  return (
    <select
      id="bus"
      name="bus"
      autoComplete="off"
      value={busId}
      onChange={(e) => onChange(e.target.value)}
      className="h-14 w-full rounded-xl border border-line-strong bg-surface px-4 text-lg text-fg [&_option]:bg-surface [&_option]:text-fg"
    >
      <option value="">Choose a bus</option>
      {buses.map((b) => (
        <option key={b.id} value={b.id}>
          {b.label ?? b.id}
        </option>
      ))}
    </select>
  )
}

export default function Capture() {
  const [busId, setBusId] = useState(readSavedBus)
  const [deviceCode, setDeviceCode] = useState(getDeviceKey)
  const [active, setActive] = useState(false)
  const [startedAt, setStartedAt] = useState(null)
  const [confirmingEnd, setConfirmingEnd] = useState(false)

  const now = useNow(active)
  const { gps, positionRef } = useGpsTracker(active, busId)
  const { cam, videoRef } = useCameraCapture(active, busId, positionRef)
  const wake = useWakeLock(active)

  useEffect(() => {
    if (!active) return
    const guard = (e) => e.preventDefault()
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [active])

  function startShift() {
    saveBus(busId)
    setStartedAt(Date.now())
    setActive(true)
  }

  function endShift() {
    setActive(false)
    setConfirmingEnd(false)
  }

  const cards = [
    { key: 'gps', icon: MapPin, label: 'Location', ...describeGps(gps) },
    { key: 'cam', icon: Camera, label: 'Camera', ...describeCamera(cam) },
    { key: 'up', icon: CloudArrowUp, label: 'Uploads', ...describeUploads(gps, cam, now) },
    { key: 'screen', icon: DeviceMobile, label: 'Screen', ...describeScreen(wake) },
  ]
  const hasError = cards.some((c) => c.level === 'err')
  const hasWarn = cards.some((c) => c.level === 'warn')
  const overall = hasError
    ? { text: 'Needs attention', style: 'border-err/40 bg-err-bg text-err' }
    : hasWarn
      ? { text: 'Check status below', style: 'border-warn/40 bg-warn-bg text-warn' }
      : { text: 'Running normally', style: 'border-ok/40 bg-ok-bg text-ok' }

  return (
    <main id="main" className={`relative z-10 min-h-dvh text-fg ${active ? 'bg-bg' : ''}`}>
      {!active && <StarsBackground className="fixed inset-0 -z-10" />}
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-4 py-6 md:py-10">
        <header>
          <Link to="/" className="inline-flex items-center gap-2 rounded-xl py-1 font-semibold hover:underline">
            <Bus size={26} weight="bold" className="text-accent" aria-hidden="true" />
            <span translate="no">NagarNetra</span>
            <span className="font-normal text-fg-muted">Bus device</span>
          </Link>
        </header>

        {!active ? (
          <section className="flex flex-col gap-6">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-balance">Start Shift</h1>
              <p className="mt-2 max-w-[65ch] text-fg-muted">
                Pick the bus this phone is mounted in, then tap Start. Keep this page open until the shift ends.
              </p>
            </div>

            <div>
              <label htmlFor="bus" className="mb-2 block text-sm font-medium">
                Bus
              </label>
              <BusPicker busId={busId} onChange={setBusId} />
              <p className="mt-2 min-h-5 text-sm text-fg-muted">{busId ? '' : 'Choose a bus to continue.'}</p>
            </div>

            <div>
              <label htmlFor="device-code" className="mb-2 block text-sm font-medium">
                Device Code
              </label>
              <input
                id="device-code"
                name="device-code"
                spellCheck={false}
                type="password"
                autoComplete="off"
                value={deviceCode}
                onChange={(e) => {
                  setDeviceCode(e.target.value)
                  setDeviceKey(e.target.value)
                }}
                className="h-12 w-full rounded-xl border border-line-strong bg-surface px-3"
              />
              <p className="mt-2 text-sm text-fg-muted">Given by your depot. Leave empty on a local test.</p>
            </div>

            <div className="rounded-xl border border-line bg-surface p-4 text-fg-muted">
              <p className="text-sm">
                Your browser will ask for location and camera access. Both are needed. Location and camera frames are
                used only to report road conditions for this bus.
              </p>
            </div>

            <button
              type="button"
              disabled={!busId}
              onClick={startShift}
              className={`h-16 w-full text-xl disabled:cursor-not-allowed disabled:bg-line disabled:text-fg-muted disabled:hover:brightness-100 ${primaryBtn}`}
            >
              Start Shift
            </button>
          </section>
        ) : (
          <section className="flex flex-col gap-4">
            <h1 className="sr-only">Shift Running</h1>
            <div className={`rounded-xl border p-4 ${overall.style}`}>
              <p aria-live="polite" className="text-sm font-medium">
                {overall.text}
              </p>
              <p className="mt-1 font-mono text-4xl font-medium tracking-tight text-fg">
                {formatDuration(now - startedAt)}
              </p>
              <p className="mt-1 truncate text-sm text-fg-muted">{busId}</p>
            </div>

            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
              <video
                ref={videoRef}
                muted
                playsInline
                aria-label="Live camera preview"
                className="h-full w-full object-cover"
              />
              {cam.state !== 'live' && (
                <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-white">
                  {cam.state === 'starting' ? 'Opening the camera…' : 'Camera is not available'}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {cards.map(({ key, ...card }) => (
                <StatusCard key={key} {...card} />
              ))}
            </div>

            {!confirmingEnd ? (
              <button
                type="button"
                onClick={() => setConfirmingEnd(true)}
                className={`h-14 w-full ${outlineBtn}`}
              >
                End Shift
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setConfirmingEnd(false)} className={`h-14 ${primaryBtn}`}>
                  Keep Running
                </button>
                <button type="button" onClick={endShift} className={`h-14 ${dangerBtn}`}>
                  End Shift Now
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  )
}
