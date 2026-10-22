import {
  usePhotoWriter,
  mutationResponse,
} from '../../../utils/resource-writer'

export default eventHandler(async (event) => {
  await requireUserSession(event)
  const photoId = getRouterParam(event, 'photoId')
  if (!photoId)
    throw createError({
      statusCode: 400,
      statusMessage: 'Photo ID is required',
    })
  return mutationResponse(() =>
    usePhotoWriter(event).delete(photoId, { authenticated: true }),
  )
})
