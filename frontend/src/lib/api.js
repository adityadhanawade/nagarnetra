const API_BASE = import.meta.env.VITE_API_BASE ?? ''
const KEY_STORAGE = 'nagarnetra.deviceKey'
const TIMEOUT_MS = 20000

export function getDeviceKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}

export function setDeviceKey(value) {
  try {
    localStorage.setItem(KEY_STORAGE, value.trim())
  } catch {
    // private mode: the key just is not remembered
  }
}

async function request(path, options = {}) {
  const key = getDeviceKey()
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: { ...options.headers, ...(key && { 'X-Device-Key': key }) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) {
    const error = new Error(`Request failed: ${res.status}`)
    error.status = res.status
    throw error
  }
  return res.json()
}

export const getJson = (path) => request(path)

export const postJson = (path, body) =>
  request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

export const postForm = (path, form) => request(path, { method: 'POST', body: form })
