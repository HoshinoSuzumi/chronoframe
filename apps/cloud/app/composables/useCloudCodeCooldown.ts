/** Client-side resend feedback; server throttles remain authoritative. */
export function useCloudCodeCooldown() {
  const remaining = ref(0)
  let timer: ReturnType<typeof setInterval> | undefined
  /** Start a fresh sixty-second countdown after a successful send. */
  function start() {
    clearInterval(timer)
    const until = Date.now() + 60_000
    remaining.value = 60
    timer = setInterval(() => {
      remaining.value = Math.max(0, Math.ceil((until - Date.now()) / 1000))
      if (!remaining.value) clearInterval(timer)
    }, 1000)
  }
  onScopeDispose(() => clearInterval(timer))
  return { remaining, start }
}
