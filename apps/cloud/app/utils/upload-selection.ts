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
  const completedPhotos = files
    .filter((file) => !isVideo(file))
    .slice(0, completed)
  const removed = new Set(completedPhotos)
  for (const photo of completedPhotos) {
    const companion = files.find(
      (file) =>
        isVideo(file) &&
        file.name.replace(/\.[^.]+$/, '').toLowerCase() ===
          photo.name.replace(/\.[^.]+$/, '').toLowerCase(),
    )
    if (companion) removed.add(companion)
  }
  return files.filter((file) => !removed.has(file))
}
