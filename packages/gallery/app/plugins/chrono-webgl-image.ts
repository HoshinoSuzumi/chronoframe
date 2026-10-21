import { WebGLImageViewer } from '@chronoframe/webgl-image'
import '@chronoframe/webgl-image/style'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.component('WebGLImageViewer', WebGLImageViewer)
})
