/** Explicit page views cover SSR entry and SPA navigation; assets and prefetches are excluded. */
export function installVisitTracking(
  app: { hook: (name: any, callback: () => void) => void },
  path: () => string,
) {
  let previous = ''
  let first = true
  function track() {
    if (
      navigator.doNotTrack === '1' ||
      (navigator as Navigator & { globalPrivacyControl?: boolean })
        .globalPrivacyControl
    )
      return
    const current = path()
    if (current === previous) return
    const parameters = new URLSearchParams(location.search)
    const data = {
      path: current,
      referrer: first ? document.referrer : location.origin + previous,
      source: parameters.get('utm_source'),
      medium: parameters.get('utm_medium'),
      campaign: parameters.get('utm_campaign'),
    }
    previous = current
    first = false
    // Cookies are unnecessary: this endpoint authorizes Site identity from the request Host.
    void fetch('/api/analytics/visit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'omit',
      keepalive: true,
      body: JSON.stringify(data),
    }).catch(() => {})
  }
  app.hook('app:mounted', track)
  app.hook('page:finish', track)
}
