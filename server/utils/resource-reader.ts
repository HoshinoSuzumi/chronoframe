import { DEFAULT_SITE } from '@chronoframe/core'
import { createError } from 'h3'
import { createResourceReader, CoreError } from '@chronoframe/core'
import { createSqliteResourceRepository } from '../repositories/sqlite-resources'
import { useDB } from './db'

/** Assemble the current self-hosted repository at the application boundary. */
export function useResourceReader() {
  return createResourceReader(
    createSqliteResourceRepository(useDB(), DEFAULT_SITE),
  )
}

/** Translate only known domain failures; preserve unexpected errors for server handling. */
export async function resourceReadResponse<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof CoreError)
      throw createError({
        statusCode: error.statusCode,
        statusMessage: error.message,
      })
    throw error
  }
}
