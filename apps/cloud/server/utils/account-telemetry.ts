/** Cloud does not collect Better Auth telemetry or inspect installed Node database drivers. */
export async function createTelemetry(..._options: unknown[]) {
  return { publish: async (..._events: unknown[]) => {} }
}
export async function getTelemetryAuthConfig(..._options: unknown[]) {
  return {}
}
