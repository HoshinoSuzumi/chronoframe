import { DEFAULT_SITE } from '@chronoframe/core'
export default defineEventHandler((event) => {
  event.context.site = DEFAULT_SITE
})
