import { useResourceReader } from '../../utils/resource-reader'

export default eventHandler(async () => useResourceReader().listVisiblePhotos())
