import { useEffect, useRef, useState } from 'react'
import { postForm } from '../lib/api.js'

const FRAME_EVERY_MS = 4000
const MAX_FRAME_WIDTH = 960

const initial = {
  state: 'idle',
  waitingForGps: false,
  sentCount: 0,
  failCount: 0,
  lastSentAt: null,
}

export function useCameraCapture(active, busId, positionRef) {
  const videoRef = useRef(null)
  const [cam, setCam] = useState(initial)

  useEffect(() => {
    if (!active) return
    if (!navigator.mediaDevices?.getUserMedia) {
      // a new shift starts from a clean slate
      // oxlint-disable-next-line react/set-state-in-effect
      setCam({ ...initial, state: 'unsupported' })
      return
    }

    let stream = null
    let timer = null
    let cancelled = false
    let inFlight = false
    setCam({ ...initial, state: 'starting' })

    function captureFrame() {
      const video = videoRef.current
      const pos = positionRef.current
      if (!video || video.videoWidth === 0 || inFlight) return
      if (!pos) {
        setCam((c) => ({ ...c, waitingForGps: true }))
        return
      }

      const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(video.videoWidth * scale)
      canvas.height = Math.round(video.videoHeight * scale)
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)

      canvas.toBlob(
        (blob) => {
          if (!blob) return
          inFlight = true
          const form = new FormData()
          form.append('bus_id', busId)
          form.append('lat', String(pos.lat))
          form.append('lng', String(pos.lng))
          form.append('image', blob, 'frame.jpg')
          postForm('/api/detect-frame', form)
            .then((result) =>
              setCam((c) => ({
                ...c,
                waitingForGps: false,
                sentCount: c.sentCount + 1,
                lastSentAt: Date.now(),
                lastResult: { vehicles: result.vehicles.count, congestion: result.congestion },
              })),
            )
            .catch(() => setCam((c) => ({ ...c, failCount: c.failCount + 1 })))
            .finally(() => {
              inFlight = false
            })
        },
        'image/jpeg',
        0.7,
      )
    }

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        const video = videoRef.current
        video.srcObject = s
        video.play().catch(() => {})
        setCam((c) => ({ ...c, state: 'live' }))
        timer = setInterval(captureFrame, FRAME_EVERY_MS)
      })
      .catch((err) => setCam((c) => ({ ...c, state: err.name === 'NotAllowedError' ? 'denied' : 'error' })))

    return () => {
      cancelled = true
      clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [active, busId, positionRef])

  return { cam, videoRef }
}
