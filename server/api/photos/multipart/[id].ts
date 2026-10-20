import { directUploads, abortDirectUpload } from '~~/server/utils/direct-upload'
import { createMultipartCompleter } from '@chronoframe/core'
import { mutationResponse } from '../../../utils/resource-writer'
import { logUpload } from '../../../utils/upload-log'

export default eventHandler(async (event) => {
  const user = await requireUserSession(event)
  const id = getRouterParam(event, 'id') || ''
  const session = directUploads.get(id)
  if (!session || session.owner !== String(user.user.id))
    throw createError({
      statusCode: 404,
      statusMessage: 'Upload session not found',
    })
  if (event.method === 'DELETE') {
    logUpload('multipart.cancel.requested', {
      sessionId: id,
      key: session.key,
      busy: session.busy,
    })
    await abortDirectUpload(id)
    return { ok: true }
  }
  if (event.method !== 'POST') throw createError({ statusCode: 405 })
  const complete = createMultipartCompleter({
    sessions: {
      get: (key) => directUploads.get(key),
      abort: abortDirectUpload,
    },
    now: Date.now,
    event: (name, details, error) => logUpload(name, details, error),
  })
  return mutationResponse(() =>
    complete(
      id,
      String(user.user.id),
      async () => (await readBody(event))?.parts,
    ),
  )
})
