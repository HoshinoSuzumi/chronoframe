import { describe, it, expect } from 'vitest'
import { clusterMarkers, photosToMarkers } from '~/utils/clustering'
import type { PhotoMarker } from '~~/shared/types/map'

describe('utils/clustering', () => {
  const createMarker = (id: string, latitude: number, longitude: number): PhotoMarker => ({
    id,
    latitude,
    longitude,
  })

  describe('clusterMarkers', () => {
    it('returns single markers without clustering at high zoom levels', () => {
      const markers = [
        createMarker('1', 0, 0),
        createMarker('2', 1, 1),
      ]

      const result = clusterMarkers(markers, 16)

      expect(result).toHaveLength(2)
      result.forEach((feature, index) => {
        expect(feature.properties.marker).toEqual(markers[index])
        expect(feature.properties.cluster).toBeUndefined()
        expect(feature.geometry.coordinates).toEqual([
          markers[index].longitude,
          markers[index].latitude,
        ])
      })
    })

    it('clusters nearby markers at lower zoom levels', () => {
      const markers = [
        createMarker('1', 0, 0),
        createMarker('2', 0.0002, 0.0001),
        createMarker('3', 1, 1),
      ]

      const result = clusterMarkers(markers, 8)

      expect(result).toHaveLength(2)

      const cluster = result.find((feature) => feature.properties.cluster)
      expect(cluster).toBeDefined()
      expect(cluster!.properties.point_count).toBe(2)
      expect(cluster!.properties.clusteredPhotos).toHaveLength(2)

      const single = result.find((feature) => !feature.properties.cluster)
      expect(single).toBeDefined()
      expect(single!.properties.marker).toEqual(markers[2])
    })
  })

  describe('photosToMarkers', () => {
    it('converts photos with valid coordinates into markers', () => {
      const photos = [
        {
          id: '1',
          latitude: 10,
          longitude: 20,
          title: 'Photo 1',
          thumbnailUrl: 'thumb1.jpg',
          thumbnailHash: 'hash1',
          dateTaken: '2024-01-01',
          city: 'City 1',
          exif: { Make: 'Canon' },
        },
        {
          id: '2',
          latitude: null,
          longitude: 30,
        },
      ]

      const markers = photosToMarkers(photos as any)

      expect(markers).toEqual([
        {
          id: '1',
          latitude: 10,
          longitude: 20,
          title: 'Photo 1',
          thumbnailUrl: 'thumb1.jpg',
          thumbnailHash: 'hash1',
          dateTaken: '2024-01-01',
          city: 'City 1',
          exif: { Make: 'Canon' },
        },
      ])
    })
  })
})
