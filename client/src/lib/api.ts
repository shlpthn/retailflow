export interface ApiError extends Error {
  status?: number
}

export async function api<T = any>(
  path: string,
  options: { method?: string; body?: any } = {}
): Promise<T> {
  const { method = 'GET', body } = options
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = sessionStorage.getItem('rf_token')
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  let data: any = null
  try {
    data = await res.json()
  } catch (e) {
    /* no body */
  }

  if (!res.ok) {
    const err: ApiError = new Error((data && data.error) || `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }

  return data as T
}
