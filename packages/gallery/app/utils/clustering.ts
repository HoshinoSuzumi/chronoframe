import { hasValidCoordinates } from '@chronoframe/gallery/shared/utils/location'
import type {
  PhotoMarker,
  ClusterPoint,
} from '@chronoframe/gallery/shared/types/map'

/**
 * Simple clustering algorithm for small datasets
 * @param markers Array of photo markers to cluster
 * @param zoom Current zoom level
 * @returns Array of cluster points
 */
export function clusterMarkers(
  markers: PhotoMarker[],
  zoom: number,
): ClusterPoint[] {
  if (markers.length === 0) return []

  // At high zoom levels, don't cluster
  if (zoom >= 15) {
    return markers.map((marker) => ({
      type: 'Feature' as const,
      properties: { marker },
      geometry: {
        type: 'Point' as const,
        coordinates: [marker.longitude, marker.latitude],
      },
    }))
  }

  const clusters: ClusterPoint[] = []
  const processed = new Set<string>()

  const threshold = Math.max(0.001, 0.01 / Math.pow(2, zoom - 10))

  for (const marker of markers) {
    if (processed.has(marker.id)) continue

    const nearby = [marker]
    processed.add(marker.id)

    // Find nearby markers
    for (const other of markers) {
      if (processed.has(other.id)) continue

      const distance = Math.sqrt(
        Math.pow(marker.longitude - other.longitude, 2) +
          Math.pow(marker.latitude - other.latitude, 2),
      )

      if (distance < threshold) {
        nearby.push(other)
        processed.add(other.id)
      }
    }

    if (nearby.length === 1) {
      // Single marker
      clusters.push({
        type: 'Feature',
        properties: { marker },
        geometry: {
          type: 'Point',
          coordinates: [marker.longitude, marker.latitude],
        },
      })
    } else {
      // Cluster
      const centerLng =
        nearby.reduce((sum, m) => sum + m.longitude, 0) / nearby.length
      const centerLat =
        nearby.reduce((sum, m) => sum + m.latitude, 0) / nearby.length

      clusters.push({
        type: 'Feature',
        properties: {
          cluster: true,
          point_count: nearby.length,
          point_count_abbreviated: nearby.length.toString(),
          marker: nearby[0], // Representative marker for the cluster
          clusteredPhotos: nearby, // All photos in the cluster
        },
        geometry: {
          type: 'Point',
          coordinates: [centerLng, centerLat],
        },
      })
    }
  }

  return clusters
}

export function photosToMarkers(photos: Photo[]): PhotoMarker[] {
  return photos
    .filter((photo) => hasValidCoordinates(photo.latitude, photo.longitude))
    .map((photo) => ({
      id: photo.id,
      latitude: photo.latitude!,
      longitude: photo.longitude!,
      title: photo.title || undefined,
      thumbnailUrl: photo.thumbnailUrl || undefined,
      thumbnailHash: photo.thumbnailHash || undefined,
      dateTaken: photo.dateTaken || undefined,
      city: photo.city || undefined,
      geocoding: photo.geocoding,
      exif: photo.exif || undefined,
    }))
}
