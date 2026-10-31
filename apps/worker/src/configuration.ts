import {
  processorCipher,
  parseProcessorLimits,
  parseProcessorGeocoding,
  type ProcessorConfiguration,
  type ProcessorEnvelope,
} from '@chronoframe/contracts/processor'
/** A fresh request nonce authenticates the server clock; monotonic round-trip time bounds transit age. */
export async function openProcessorConfiguration(
  key: string,
  value: ProcessorEnvelope,
  nonce: string,
  elapsedMs: number,
): Promise<ProcessorConfiguration> {
  if (
    !value ||
    value.nodeId !== key.split('.')[0]?.slice(3) ||
    value.nonce !== nonce ||
    !Number.isSafeInteger(value.issuedAt) ||
    !Number.isSafeInteger(value.expiresAt) ||
    value.issuedAt < 1 ||
    value.expiresAt <= value.issuedAt ||
    value.expiresAt - value.issuedAt > 360000 ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs < 0 ||
    elapsedMs >= value.expiresAt - value.issuedAt
  )
    throw new Error('invalid_configuration')
  const decoded = await (
    await processorCipher(key)
  ).open<ProcessorConfiguration>(
    value.envelope,
    `${value.nodeId}:${value.revision}:${value.issuedAt}:${value.expiresAt}:${nonce}`,
  )
  return {
    limits: parseProcessorLimits(decoded.limits),
    geocoding: parseProcessorGeocoding(decoded.geocoding),
  }
}
