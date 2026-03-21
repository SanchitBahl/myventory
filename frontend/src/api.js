// api.js
// A simple helper that attaches the Clerk JWT to every API request.
// Usage: import { apiGet, apiPost, apiPatch, apiDelete } from './api'

const API_URL = import.meta.env.VITE_API_URL

async function request(method, path, body, getToken) {
  const token = await getToken()
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(error.detail || 'Request failed')
  }

  // 204 No Content responses have no body
  if (res.status === 204) return null
  return res.json()
}

export const apiGet    = (path, getToken)        => request('GET',    path, null, getToken)
export const apiPost   = (path, body, getToken)  => request('POST',   path, body, getToken)
export const apiPatch  = (path, body, getToken)  => request('PATCH',  path, body, getToken)
export const apiDelete = (path, getToken)        => request('DELETE', path, null, getToken)
