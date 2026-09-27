import { useEffect, useState } from 'react'

const SUPPORTED = typeof navigator !== 'undefined' && 'wakeLock' in navigator

export function useWakeLock(active) {
  const [state, setState] = useState('off')

  useEffect(() => {
    if (!active || !SUPPORTED) return

    let lock = null
    let cancelled = false

    async function acquire() {
      try {
        lock = await navigator.wakeLock.request('screen')
        if (cancelled) {
          lock.release().catch(() => {})
          return
        }
        setState('on')
        lock.addEventListener('release', () => {
          if (!cancelled) setState('off')
        })
      } catch {
        setState('off')
      }
    }

    function reacquireWhenVisible() {
      if (document.visibilityState === 'visible' && (!lock || lock.released)) acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', reacquireWhenVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', reacquireWhenVisible)
      lock?.release().catch(() => {})
    }
  }, [active])

  if (!active) return 'off'
  return SUPPORTED ? state : 'unsupported'
}
