import {
  installVisitTracking,
  visitRoutePath,
} from '../../../shared/analytics/tracker'
export default defineNuxtPlugin((app) => {
  const router = useRouter()
  const track = installVisitTracking(app, () =>
    visitRoutePath(router.currentRoute.value),
  )
  router.afterEach((_to, _from, failure) => {
    if (!failure) track()
  })
})
