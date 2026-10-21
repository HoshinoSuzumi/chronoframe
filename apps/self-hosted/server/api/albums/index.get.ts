import { albumAccess } from '../../utils/album-access'
import { useResourceReader } from '../../utils/resource-reader'

export default eventHandler(async (event) => {
  return useResourceReader().listAlbums(await albumAccess(event))
})
