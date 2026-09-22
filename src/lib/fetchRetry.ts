/**
 * fetch die één keer opnieuw probeert bij "JWT issued at future": vlak na het inloggen kan de klok
 * van de server net achterlopen op die van de inlogdienst. Een seconde later is het token wel geldig.
 */
export async function fetchWithClockRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init)
  if (res.status === 401 || res.status === 400 || res.status === 403) {
    const body = await res.clone().text().catch(() => '')
    if (body.includes('issued at future')) {
      await new Promise((r) => setTimeout(r, 1500))
      return fetch(input, init)
    }
  }
  return res
}
