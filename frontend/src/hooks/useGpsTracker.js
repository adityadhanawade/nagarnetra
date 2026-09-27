import { useEffect, useRef, useState } from 'react'
import { postJson } from '../lib/api.js'

const SEND_EVERY_MS = 5000

const initial = {
  state: 'idle',
  accuracy: null,
  speedKmh: null,
  sentCount: 0,
  failCount: 0,
  lastSentAt: null,
}

export function useGpsTracker(active, busId) {
  const [gps, setGps] = useState(initial)
  const positionRef = useRef(null)

  useEffect(() => {
    if (!active) return
    if (!('geolocation' in navigator)) {
      // a new shift starts from a clean slate
      // oxlint-disable-next-line react/set-state-in-effect
      setGps({ ...initial, state: 'unsupported' })
      return
    }

    let latest = null
    positionRef.current = null
    // oxlint-disable-next-line react/set-state-in-effect
    setGps({ ...initial, state: 'searching' })

    // watchPosition only fires when the phone moves, so a bus stopped at a signal would go silent.
    // Send the latest known fix on a timer instead.
    function sendLatest() {
      if (!latest) return
      const { lat, lng, speedKmh, heading } = latest
      const body = { bus_id: busId, lat, lng }
      if (speedKmh != null) body.speed_kmh = speedKmh
      if (heading != null && !Number.isNaN(heading)) body.heading = heading

      postJson('/api/location', body)
        .then(() => setGps((g) => ({ ...g, sentCount: g.sentCount + 1, lastSentAt: Date.now() })))
        .catch(() => setGps((g) => ({ ...g, failCount: g.failCount + 1 })))
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy, speed, heading } = pos.coords
        const speedKmh = speed == null ? null : Math.max(0, speed * 3.6)
        const firstFix = latest === null
        latest = { lat, lng, speedKmh, heading }
        positionRef.current = { lat, lng, accuracy }
        setGps((g) => ({ ...g, state: 'locked', accuracy, speedKmh }))
        if (firstFix) sendLatest()
      },
      (err) => setGps((g) => ({ ...g, state: err.code === 1 ? 'denied' : 'error' })),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    )
    const timer = setInterval(sendLatest, SEND_EVERY_MS)

    return () => {
      navigator.geolocation.clearWatch(watchId)
      clearInterval(timer)
    }
  }, [active, busId])

  return { gps, positionRef }
}
