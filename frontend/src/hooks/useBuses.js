import { useCallback, useEffect, useState } from 'react'
import { getJson } from '../lib/api.js'

export function useBuses() {
  const [state, setState] = useState({ status: 'loading', buses: [] })

  const load = useCallback(
    () =>
      getJson('/api/buses')
        .then((buses) => setState({ status: 'ready', buses }))
        .catch(() => setState({ status: 'error', buses: [] })),
    [],
  )

  useEffect(() => {
    load()
  }, [load])

  const retry = () => {
    setState({ status: 'loading', buses: [] })
    load()
  }

  return { ...state, retry }
}
