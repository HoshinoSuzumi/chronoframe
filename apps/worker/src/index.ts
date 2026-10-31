import os from 'node:os'
import {
  processorCipher,
  parseProcessorLimits,
  parseProcessorGeocoding,
  type ProcessorConfiguration,
} from '@chronoframe/contracts/processor'
import { randomUUID } from 'node:crypto'
import { createWorkerGateway } from './gateway.ts'
import { setTimeout as delay } from 'node:timers/promises'
import { processWork, WorkerProcessingError, type WorkItem } from './process.ts'
import type { CloudMediaResult } from '@chronoframe/core'
const instanceId = randomUUID()
const connectionKey = process.env.CHRONOFRAME_PROCESSOR_KEY ?? ''
const version = process.env.CHRONOFRAME_PROCESSOR_VERSION ?? 'development'
let configuration!: ProcessorConfiguration
let lastStatus = 0
async function acceptConfiguration(value: {
  nodeId: string
  revision: string
  expiresAt: number
  envelope: string
}) {
  if (
    !value ||
    value.nodeId !== connectionKey.split('.')[0]?.slice(3) ||
    value.expiresAt <= Date.now() ||
    value.expiresAt > Date.now() + 360000
  )
    throw new Error('invalid_configuration')
  const decoded = await (
    await processorCipher(connectionKey)
  ).open<ProcessorConfiguration>(
    value.envelope,
    `${value.nodeId}:${value.revision}:${value.expiresAt}`,
  )
  configuration = {
    limits: parseProcessorLimits(decoded.limits),
    geocoding: parseProcessorGeocoding(decoded.geocoding),
  }
}
async function reportStatus(register = false) {
  if (!register && Date.now() - lastStatus < 30000) return
  const result = await rpc<any>(register ? 'register' : 'status', {
    instanceId,
    version,
    hostname: os.hostname(),
    metrics: {
      cpuCount: os.cpus().length,
      load1: os.loadavg()[0],
      rss: process.memoryUsage().rss,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
    },
  })
  await acceptConfiguration(result)
  lastStatus = Date.now()
}
const rpc = createWorkerGateway({
  origin: process.env.CHRONOFRAME_PORTAL_ORIGIN ?? '',
  secret: connectionKey,
  accessClientId: process.env.CHRONOFRAME_ACCESS_CLIENT_ID,
  accessClientSecret: process.env.CHRONOFRAME_ACCESS_CLIENT_SECRET,
})
let stopping = false
const shutdown = new AbortController()
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    stopping = true
    shutdown.abort()
  })
while (!stopping) {
  try {
    await reportStatus(!configuration)
    const item = await rpc<
      (WorkItem & { configuration: any }) | { lease: null }
    >('claim', {})
    if (!item.lease) {
      await rpc('cleanup', {})
      await delay(3000, undefined, { signal: shutdown.signal }).catch(() => {})
      continue
    }
    await acceptConfiguration(
      (item as WorkItem & { configuration: any }).configuration,
    )
    const work = item as WorkItem,
      controller = new AbortController(),
      timeout = setTimeout(
        () => controller.abort('processing_timeout'),
        configuration.limits.timeoutMs,
      )
    let heartbeatRunning = false
    const timer = setInterval(() => {
      if (heartbeatRunning) return
      heartbeatRunning = true
      void reportStatus()
        .then(() => rpc<{ ok: boolean }>('heartbeat', { lease: work.lease }))
        .then((result) => {
          if (!result.ok) controller.abort('lease_lost')
        })
        .catch(() => controller.abort('heartbeat_unavailable'))
        .finally(() => {
          heartbeatRunning = false
        })
    }, 30000)
    try {
      const workConfiguration = configuration
      const processed = await processWork(
        work,
        controller.signal,
        workConfiguration,
        async () => {
          const slot = await rpc<{ delayMs: number }>(
            'geocoding-slot',
            { provider: workConfiguration.geocoding.provider },
            controller.signal,
          )
          if (slot.delayMs > 0)
            await delay(slot.delayMs, undefined, { signal: controller.signal })
        },
      )
      controller.signal.throwIfAborted()
      const grants = await rpc<{
        outputs: (CloudMediaResult['assets'][number] & { url: string })[]
      }>('grant', {
        lease: work.lease,
        assets: processed.derivatives.map(
          ({ buffer: _buffer, ...asset }) => asset,
        ),
      })
      for (const grant of grants.outputs) {
        controller.signal.throwIfAborted()
        const derivative = processed.derivatives.find(
          (d) => d.role === grant.role,
        )
        if (!derivative) throw new Error('invalid_output_grant')
        const response = await fetch(grant.url, {
          method: 'PUT',
          headers: { 'Content-Type': grant.contentType },
          body: new Uint8Array(derivative.buffer),
          redirect: 'error',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('derivative_upload_failed')
      }
      const completed = await rpc<{ ok: boolean }>('complete', {
        lease: work.lease,
        result: {
          ...processed.result,
          assets: grants.outputs.map(({ url: _url, ...asset }) => asset),
        },
      })
      console.log(
        JSON.stringify({
          event: completed.ok ? 'job.completed' : 'job.discarded',
          jobId: work.lease.id,
          siteId: work.lease.siteId,
          attemptId: work.lease.attemptId,
        }),
      )
    } catch (error) {
      const aborted = controller.signal.aborted
      await rpc('fail', {
        lease: work.lease,
        code: aborted
          ? String(controller.signal.reason || 'lease_lost')
          : error instanceof WorkerProcessingError
            ? error.message
            : 'processing_error',
        requiredPixels:
          error instanceof WorkerProcessingError
            ? error.requiredPixels
            : undefined,
        requiredMetadataBytes:
          error instanceof WorkerProcessingError
            ? error.requiredMetadataBytes
            : undefined,
        requiredBytes:
          error instanceof WorkerProcessingError
            ? error.requiredBytes
            : undefined,
        retryable: aborted
          ? controller.signal.reason === 'processing_timeout'
          : error instanceof WorkerProcessingError
            ? error.retryable
            : true,
      }).catch(() => {})
      console.log(
        JSON.stringify({
          event: 'job.failed',
          jobId: work.lease.id,
          siteId: work.lease.siteId,
          attemptId: work.lease.attemptId,
          code: aborted ? 'lease_or_timeout' : 'processing_error',
        }),
      )
    } finally {
      clearInterval(timer)
      clearTimeout(timeout)
    }
    await rpc('cleanup', {}).catch(() => {})
  } catch {
    if (!stopping) {
      console.log(JSON.stringify({ event: 'worker.connection_retry' }))
      await delay(5000, undefined, { signal: shutdown.signal }).catch(() => {})
    }
  }
}
