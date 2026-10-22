import type {} from '../types/worker'
import { useDB, closeDB } from '../utils/db'
export default defineNitroPlugin((nitroApp) => {
  try {
    useDB()
    logger
      .dynamic('db-migrate')
      .info('Database migration finished successfully')
  } catch (error) {
    closeDB()
    throw error
  }
  nitroApp.hooks.hook('close', async () => {
    await globalThis.__workerPool?.stop()
    closeDB()
  })
})
