export const DEFAULT_QUEUE_WORKER_COUNT = 5

export function validateQueueWorkerCount(
  value: unknown,
): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 8
  ) {
    throw new Error('Queue concurrency must be an integer between 1 and 8')
  }
}
