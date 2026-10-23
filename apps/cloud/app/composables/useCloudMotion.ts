/** Keep entry transitions subtle and respect the visitor's motion preference. */
export function useCloudMotion() {
  const reduced = usePreferredReducedMotion()
  return computed(() => ({
    initial: { opacity: 0, y: reduced.value === 'reduce' ? 0 : 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduced.value === 'reduce' ? 0 : 0.35 },
  }))
}
