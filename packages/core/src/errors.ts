/** Transport-neutral domain failure; the application supplies HTTP mapping and translations. */
export class CoreError extends Error {
  readonly statusCode: number
  readonly code?: string
  constructor(statusCode: number, message: string, code?: string) {
    super(message)
    this.name = 'CoreError'
    this.statusCode = statusCode
    this.code = code
  }
}

/** Retain the read-specific error identity for existing consumers. */
export class ResourceReadError extends CoreError {
  constructor(statusCode: 401 | 403 | 404, message: string) {
    super(statusCode, message)
    this.name = 'ResourceReadError'
  }
}
