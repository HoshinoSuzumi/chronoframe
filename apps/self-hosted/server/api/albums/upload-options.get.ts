import { listUploadAlbumOptions } from '../../utils/upload-album-options'
import { requireAdminSession } from '../../utils/require-admin.ts'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  return listUploadAlbumOptions(useDB())
})
