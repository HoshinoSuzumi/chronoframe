export const tourIds = [
  'dashboard',
  'photos',
  'albums',
  'general',
  'storage',
  'map',
  'privacy',
  'system',
  'home',
] as const
export type TourId = (typeof tourIds)[number]
export type TourStatus = 'pending' | 'completed' | 'skipped'
export type TourRecords = Record<TourId, TourStatus>
