// @ts-nocheck
/// <reference lib="webworker" />

/**
 * Image decoder worker
 * @param {MessageEvent} event
 * @returns
 */
self.onmessage = async (event) => {
  const { type } = event.data

  if (type === 'load') {
    const { payload } = event.data
    try {
      let src = payload.src
      try {
        const absolute = new URL(
          src,
          self.location?.origin || 'http://localhost',
        )
        src = absolute.toString()
      } catch {
        /* empty */
      }
      const response = await fetch(src, { mode: 'cors' })
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`)
      }

      const blob = await response.blob()

      const imageBitmap = await createImageBitmap(blob)

      self.postMessage(
        {
          type: 'loaded',
          payload: {
            imageBitmap,
            width: imageBitmap.width,
            height: imageBitmap.height,
          },
        },
        [imageBitmap],
      )
    } catch (error) {
      self.postMessage({
        type: 'load-error',
        payload: error instanceof Error ? error : 'Unknown error',
      })
    }
  }
}
