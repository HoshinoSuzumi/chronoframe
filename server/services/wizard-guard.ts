import { createError } from 'h3'

// One shared gate for every wizard endpoint in this server process.
export function createWizardGuard(isFirstLaunch: () => Promise<unknown>) {
  let pending: Promise<unknown> = Promise.resolve()
  let windowStart = 0
  let attempts = 0

  return async function guard<T>(run: () => Promise<T> | T): Promise<T> {
    // A global limit also bounds the queue and cannot be bypassed by spoofing
    // forwarded IP headers. Setup normally needs only a handful of requests.
    const now = Date.now()
    if (now - windowStart >= 60_000) {
      windowStart = now
      attempts = 0
    }
    if (++attempts > 60) {
      throw createError({ statusCode: 429, message: 'Too many setup requests' })
    }

    const request = pending.then(async () => {
      // Check inside the queue so requests waiting behind submit/complete
      // cannot modify settings or credentials after setup has finished.
      // Only an explicit true enables setup; missing state fails closed.
      if ((await isFirstLaunch()) !== true) {
        throw createError({
          statusCode: 403,
          message: 'Setup already completed',
        })
      }
      return run()
    })
    pending = request.catch(() => {})
    return request
  }
}
