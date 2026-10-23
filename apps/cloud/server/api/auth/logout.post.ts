import { forwardAccountRequest } from '../../utils/account-handler'
export default defineEventHandler((event) =>
  forwardAccountRequest(event, '/sign-out'),
)
