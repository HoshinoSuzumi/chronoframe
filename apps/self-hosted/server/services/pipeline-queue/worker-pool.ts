import type { ConsolaInstance } from 'consola'
import { consola } from 'consola'
import { QueueManager } from './manager'
import {
  DEFAULT_QUEUE_WORKER_COUNT,
  validateQueueWorkerCount,
} from '#shared/utils/queue-config'

export interface WorkerPoolConfig {
  /** 工作器数量 */
  workerCount: number
  /** 轮询间隔（毫秒） */
  intervalMs: number
  /** 工作器间隔偏移（毫秒），用于错开轮询时间 */
  intervalOffset: number
  /** 是否启用负载均衡 */
  enableLoadBalancing: boolean
  /** 统计报告间隔（毫秒） */
  statsReportInterval: number
}

export interface WorkerStats {
  workerId: string
  isProcessing: boolean
  processedCount: number
  errorCount: number
  uptime: number
  successRate: number
}

export interface PoolStats {
  totalWorkers: number
  activeWorkers: number
  totalProcessed: number
  totalErrors: number
  averageSuccessRate: number
  workers: WorkerStats[]
}

/**
 * 工作器池
 */
export class WorkerPool {
  private workers: QueueManager[] = []
  private logger: ConsolaInstance
  private config: WorkerPoolConfig
  private statsInterval: NodeJS.Timeout | null = null
  private isRunning: boolean = false
  private resizing: Promise<void> = Promise.resolve()
  private stopping: Promise<void> | null = null

  constructor(config: Partial<WorkerPoolConfig>, logger?: ConsolaInstance) {
    this.config = {
      workerCount: DEFAULT_QUEUE_WORKER_COUNT,
      intervalMs: 2000,
      intervalOffset: 300,
      enableLoadBalancing: false,
      statsReportInterval: 30000,
      ...config,
    }
    this.logger = logger || consola.withTag('worker-pool')
    validateQueueWorkerCount(this.config.workerCount)
  }

  /**
   * 启动工作器池
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('WorkerPool is already running')
      return
    }

    this.logger.info(
      `Starting WorkerPool with ${this.config.workerCount} workers`,
    )

    this.stopping = null
    // 在启动工作器之前，清理死任务
    // Expired leases are recovered by the jobs adapter during each claim.

    // 创建工作器
    for (let i = 1; i <= this.config.workerCount; i++) {
      const workerId = `worker-${i}`
      const worker = QueueManager.getInstance(workerId, this.logger)

      // 错开时间以减少数据库竞争
      const workerInterval =
        this.config.intervalMs + (i - 1) * this.config.intervalOffset

      this.workers.push(worker)
      worker.startProcessing(workerInterval)
    }

    this.isRunning = true

    // 启动统计报告
    if (this.config.statsReportInterval > 0) {
      this.startStatsReporting()
    }

    this.logger.success(
      `WorkerPool started successfully with ${this.workers.length} workers`,
    )
  }

  /**
   * 停止工作器池
   */
  stop(): Promise<void> {
    this.stopping ??= this.stopWorkers()
    return this.stopping
  }

  private async stopWorkers(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('WorkerPool is not running')
      return
    }

    this.logger.info('Stopping WorkerPool...')
    this.isRunning = false

    // 停止统计报告
    if (this.statsInterval) {
      clearInterval(this.statsInterval)
      this.statsInterval = null
    }

    // 停止所有工作器
    const stopPromises = this.workers.map(async (worker, _index) => {
      try {
        await worker.stopProcessing()
        this.logger.info(`worker [${worker.getWorkerId()}] stopped`)
      } catch (error) {
        this.logger.error(
          `Error stopping worker [${worker.getWorkerId()}]:`,
          error,
        )
      }
    })

    await Promise.allSettled(stopPromises)
    await this.resizing

    this.workers = []
    this.isRunning = false

    this.logger.success('WorkerPool stopped successfully')
  }

  /**
   * 获取池统计信息
   */
  getPoolStats(): PoolStats {
    const workerStats = this.workers.map((worker) => worker.getStats())

    const totalProcessed = workerStats.reduce(
      (sum, stats) => sum + stats.processedCount,
      0,
    )
    const totalErrors = workerStats.reduce(
      (sum, stats) => sum + stats.errorCount,
      0,
    )
    const activeWorkers = workerStats.filter(
      (stats) => stats.isProcessing,
    ).length

    const totalAttempts = totalProcessed + totalErrors
    const averageSuccessRate =
      totalAttempts > 0 ? (totalProcessed / totalAttempts) * 100 : 0

    return {
      totalWorkers: this.workers.length,
      activeWorkers,
      totalProcessed,
      totalErrors,
      averageSuccessRate: Math.round(averageSuccessRate * 100) / 100,
      workers: workerStats,
    }
  }

  /**
   * 启动控制台统计报告
   */
  private startStatsReporting(): void {
    this.statsInterval = setInterval(() => {
      const stats = this.getPoolStats()

      this.logger.info('=== WorkerPool Stats ===')
      this.logger.info(
        `Total Workers: ${stats.totalWorkers}, Active: ${stats.activeWorkers}`,
      )
      this.logger.info(
        `Total Processed: ${stats.totalProcessed}, Total Errors: ${stats.totalErrors}`,
      )
      this.logger.info(`Average Success Rate: ${stats.averageSuccessRate}%`)

      stats.workers.forEach((worker) => {
        const status = worker.isProcessing ? 'Processing' : 'Idle'
        this.logger.info(
          `  ${worker.workerId}: ${status} | Processed: ${worker.processedCount} | Errors: ${worker.errorCount} | Success Rate: ${worker.successRate.toFixed(1)}% | Uptime: ${worker.uptime}s`,
        )
      })
    }, this.config.statsReportInterval)
  }

  /**
   * 重新平衡工作器负载
   */
  async rebalance(): Promise<void> {
    if (!this.config.enableLoadBalancing) {
      return
    }

    const stats = this.getPoolStats()

    // 如果某个工作器错误率过高，重启它
    const problematicWorkers = stats.workers.filter(
      (worker) => worker.errorCount > 10 && worker.successRate < 50,
    )

    for (const workerStat of problematicWorkers) {
      this.logger.warn(
        `Worker ${workerStat.workerId} has high error rate, preparing to restart`,
      )

      const worker = this.workers.find(
        (w) => w.getWorkerId() === workerStat.workerId,
      )
      if (worker) {
        await worker.stopProcessing()
        if (this.isRunning) worker.startProcessing(this.config.intervalMs)
      }
    }
  }

  /**
   * 获取队列统计信息（从任意一个工作器获取）
   */
  async getQueueStats() {
    if (this.workers.length === 0) {
      return {}
    }

    return await this.workers[0]!.getQueueStats()
  }

  /**
   * 清理死任务 - 重置为 pending，迁移任务保留后台优先级
   */
  /**
   * 检查池是否正在运行
   */
  isActive(): boolean {
    return this.isRunning
  }

  /**
   * 获取工作器数量
   */
  getWorkerCount(): number {
    return this.workers.length
  }

  /** Apply settings changes serially; draining workers cannot be restarted early. */
  setWorkerCount(workerCount: number): Promise<void> {
    validateQueueWorkerCount(workerCount)
    const resize = this.resizing.then(async () => {
      this.config.workerCount = workerCount
      if (!this.isRunning) return
      if (workerCount < this.workers.length) {
        const removed = this.workers.splice(workerCount)
        await Promise.all(removed.map((worker) => worker.stopProcessing()))
      }
      while (this.isRunning && this.workers.length < workerCount) {
        const index = this.workers.length
        const worker = QueueManager.getInstance(
          `worker-${index + 1}`,
          this.logger,
        )
        this.workers.push(worker)
        worker.startProcessing(
          this.config.intervalMs + index * this.config.intervalOffset,
        )
      }
      this.logger.info(`Queue concurrency updated to ${workerCount}`)
    })
    this.resizing = resize.catch(() => {})
    return resize
  }

  /**
   * 获取第一个工作器（用于添加任务）
   */
  getFirstWorker(): QueueManager | null {
    return this.workers[0] ?? null
  }

  /**
   * 添加任务到队列（通过任意一个工作器）
   */
  async addTask(
    ...[payload, options]: Parameters<QueueManager['addTask']>
  ): Promise<number> {
    const worker = this.getFirstWorker()
    if (!worker) {
      throw new Error('No workers available')
    }
    return await worker.addTask(payload, options)
  }

  /**
   * 获取任务状态
   * @param taskId 任务ID
   * @returns 任务状态信息
   */
  async getTaskStatus(taskId: number) {
    const worker = this.getFirstWorker()
    if (!worker) {
      throw new Error('No workers available')
    }
    return await worker.getTaskStatus(taskId)
  }
}
