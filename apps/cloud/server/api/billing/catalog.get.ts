import { pricingCatalog } from '../../../../../packages/platform/src/billing'
import {
  definePlatformHandler,
  platformDatabase,
} from '../../../../shared/platform/runtime'
import { setResponseHeader } from 'h3'
export default definePlatformHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return pricingCatalog(platformDatabase(event))
})
