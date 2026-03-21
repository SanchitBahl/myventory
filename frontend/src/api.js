// api.js
const API_URL = import.meta.env.VITE_API_URL

async function request(method, path, body, getToken) {
  const token = await getToken()
  const url = `${API_URL}/api${path}`
  
  console.log(`${method} ${url}`)

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    console.log(`Response status: ${res.status}`)

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: 'Unknown error' }))
      throw new Error(error.detail || 'Request failed')
    }

    if (res.status === 204) return null
    return res.json()
  } catch (e) {
    console.error(`Request failed: ${e.message}`, { method, url, body })
    throw e
  }
}

export const apiGet    = (path, getToken)        => request('GET',    path, null, getToken)
export const apiPost   = (path, body, getToken)  => request('POST',   path, body, getToken)
export const apiPatch  = (path, body, getToken)  => request('PATCH',  path, body, getToken)
export const apiDelete = (path, getToken)        => request('DELETE', path, null, getToken)
