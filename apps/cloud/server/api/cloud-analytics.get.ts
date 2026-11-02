import { setResponseHeader } from 'h3'
import { cloudAnalyticsSettings } from '../../../../packages/platform/src/cloud-analytics'
import {
  definePlatformHandler,
  platformDatabase,
} from '../../../shared/platform/runtime'

export default definePlatformHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const { measurementId } = await cloudAnalyticsSettings(
    platformDatabase(event),
  )
  return { measurementId }
})
