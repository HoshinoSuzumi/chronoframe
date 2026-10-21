import type { NormalizedLocation } from './location'
import type { Map as _MaplibreMap } from 'maplibre-gl'
import type { Map as _MapboxMap } from 'mapbox-gl'

export type MaplibreMap = _MaplibreMap
export type MapboxMap = _MapboxMap

export type MapInstance = MaplibreMap | MapboxMap

export const isMaplibreMap = (
  map: MapInstance,
  provider: string,
): map is MaplibreMap => {
  return provider === 'maplibre'
}

export const isMapboxMap = (
  map: MapInstance,
  provider: string,
): map is MapboxMap => {
  return provider === 'mapbox'
}

export interface PhotoMarker {
  id: string
  latitude: number
  longitude: number
  title?: string
  thumbnailUrl?: string
  thumbnailHash?: string
  dateTaken?: string
  geocoding?: NormalizedLocation | null
  city?: string
  exif?: any
}

export interface ClusterPoint {
  type: 'Feature'
  properties: {
    marker?: PhotoMarker
    cluster?: boolean
    point_count?: number
    point_count_abbreviated?: string
    clusteredPhotos?: PhotoMarker[]
  }
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
}
