import { installVisitTracking } from '../../../shared/analytics/tracker'
export default defineNuxtPlugin((app) => {
  const router = useRouter()
  installVisitTracking(app, () => router.currentRoute.value.path)
})
