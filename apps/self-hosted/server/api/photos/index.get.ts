import { useResourceReader } from '../../utils/resource-reader'

export default eventHandler(async (event) => {
  await requireUserSession(event)
  return useResourceReader().listPhotos({ admin: true })
})
