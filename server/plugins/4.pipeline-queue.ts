import { WorkerPool } from '../services/pipeline-queue'
import { settingsManager } from '../services/settings/settingsManager'
import { DEFAULT_QUEUE_WORKER_COUNT } from '~~/shared/utils/queue-config'

export default defineNitroPlugin(async (nitroApp) => {
  const _logger = logger.dynamic('queue')
  const shutdownTimeoutMs = 30_000
  const workerPool = new WorkerPool(
    {
      workerCount:
        (await settingsManager.get<number>('system', 'queue.workerCount')) ??
        DEFAULT_QUEUE_WORKER_COUNT,
      intervalMs: 1500,
      intervalOffset: 300,
      enableLoadBalancing: false,
      statsReportInterval: 60000 * 10,
    },
    _logger,
  )
  await workerPool.start()
  globalThis.__workerPool = workerPool

  let shutdown: Promise<void> | undefined
  const stop = () => (shutdown ||= workerPool.stop())
  nitroApp.hooks.hook('close', stop)

  const exitHandler = () => {
    _logger.info('Shutting down worker pool...')
    const deadline = setTimeout(() => {
      _logger.warn(
        'Queue shutdown deadline exceeded; unfinished tasks will recover on startup',
      )
      process.exit(1)
    }, shutdownTimeoutMs)
    void stop()
      .then(() => {
        clearTimeout(deadline)
        process.exit(0)
      })
      .catch((error) => {
        clearTimeout(deadline)
        _logger.error('Queue shutdown failed', error)
        process.exit(1)
      })
  }
  process.once('SIGINT', exitHandler)
  process.once('SIGTERM', exitHandler)
})
