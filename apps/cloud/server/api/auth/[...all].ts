import { definePlatformHandler } from '../../../../shared/platform/runtime'
import { forwardAccountRequest } from '../../utils/account-handler'
export default definePlatformHandler((event) => forwardAccountRequest(event))
