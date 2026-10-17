import { listUploadAlbumOptions } from '../../utils/upload-album-options'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  return listUploadAlbumOptions(useDB())
})
