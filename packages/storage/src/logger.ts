/** Structural logger: applications own sinks, tags and credentials redaction. */
export interface StorageLogger {
  info(...args: any[]): void
  warn(...args: any[]): void
  error(...args: any[]): void
  debug(...args: any[]): void
  success(...args: any[]): void
  log(...args: any[]): void
}
