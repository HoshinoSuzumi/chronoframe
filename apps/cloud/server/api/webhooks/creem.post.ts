import { createError, defineEventHandler } from 'h3'

// Retired endpoint: never read, accept or process a legacy callback.
export default defineEventHandler(() => {
  throw createError({
    statusCode: 410,
    statusMessage: 'payment_provider_retired',
  })
})
