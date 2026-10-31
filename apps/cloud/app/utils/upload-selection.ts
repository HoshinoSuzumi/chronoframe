type UploadFile = Pick<File, 'name' | 'size' | 'lastModified'>
export function mergeUploadFiles<T extends UploadFile>(
  current: T[],
  incoming: T[],
): T[] {
  const seen = new Set<string>()
  return [...current, ...incoming].filter((file) => {
    const key = JSON.stringify([file.name, file.size, file.lastModified])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
/** Remove verified photos and their paired MOV files; keep interrupted and unstarted files. */
export function remainingUploadFiles<T extends UploadFile>(
  files: T[],
  completed: number,
): T[] {
  const isVideo = (file: T) => file.name.toLowerCase().endsWith('.mov')
  const photos = files.filter((file) => !isVideo(file))
  const completedPhotos = photos.slice(0, completed)
  const stem = (file: T) => file.name.replace(/\.[^.]+$/, '').toLowerCase()
  const unfinishedStems = new Set(photos.slice(completed).map(stem))
  const removed = new Set(completedPhotos)
  for (const photo of completedPhotos) {
    if (unfinishedStems.has(stem(photo))) continue
    const companion = files.find(
      (file) => isVideo(file) && stem(file) === stem(photo),
    )
    if (companion) removed.add(companion)
  }
  return files.filter((file) => !removed.has(file))
}
