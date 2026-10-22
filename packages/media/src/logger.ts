export interface MediaLogger {
  info(...args: any[]): void
  warn(...args: any[]): void
  error(...args: any[]): void
  debug(...args: any[]): void
  success(...args: any[]): void
}
