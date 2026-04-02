import { WorkerPool } from '../services/pipeline-queue'
import { readBootstrapDbConfigSync } from '~~/server/utils/db-bootstrap'
import { existsSync } from 'node:fs'

export default defineNitroPlugin(async (_nitroApp) => {
  const _logger = logger.dynamic('queue')

  const hasDbBootstrapConfig = !!readBootstrapDbConfigSync()
  const hasLegacySqliteFile = existsSync('data/app.sqlite3')
  if (!hasDbBootstrapConfig && !hasLegacySqliteFile) {
    _logger.info(
      'Database bootstrap config is not ready, skipping queue worker startup.',
    )
    return
  }

  const workerPool = new WorkerPool(
    {
      workerCount: 5,
      intervalMs: 1500,
      intervalOffset: 300,
      enableLoadBalancing: true,
      statsReportInterval: 60000 * 10,
    },
    _logger,
  )
  await workerPool.start()

  globalThis.__workerPool = workerPool

  const exitHandler = async () => {
    _logger.info('Shutting down worker pool...')
    await workerPool.stop()
    process.exit(0)
  }

  process.on('SIGINT', exitHandler)
  process.on('SIGTERM', exitHandler)

  // 每 5 分钟进行一次负载均衡检查
  setInterval(
    async () => {
      try {
        await workerPool.rebalance()
      } catch (error) {
        _logger.error('Rebalance failed:', error)
      }
    },
    5 * 60 * 1000,
  )
})
