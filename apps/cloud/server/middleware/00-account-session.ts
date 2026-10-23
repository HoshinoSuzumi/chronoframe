import { getCookie, getRequestHeaders } from 'h3'
import { cloudAccount } from '../utils/cloud-account'
/** Provide Cloud's account session to shared Site authorization, with numeric identity intact. */
export default defineEventHandler((event) => {
  event.context.platformSessionResolver = async () => {
    if (!getCookie(event, '__Host-chronoframe-auth')) return null
    const session = await cloudAccount(event).api.getSession({
      headers: new Headers(getRequestHeaders(event) as HeadersInit),
    })
    const id = Number(session?.user.id)
    return session &&
      session.user.emailVerified &&
      Number.isSafeInteger(id) &&
      id > 0
      ? { userId: id, expiresAt: new Date(session.session.expiresAt).getTime() }
      : null
  }
})
