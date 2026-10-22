export type FloatingRect = {
  x: number
  y: number
  width: number
  height: number
}
export type FloatingBounds = { width: number; height: number }
export function constrainFloatingRect(
  rect: FloatingRect,
  viewport: FloatingBounds,
  minWidth: number,
  minHeight: number,
  maxWidth: number,
  maxHeight: number,
  allowOverflow: boolean,
): FloatingRect {
  const upperWidth = Math.max(
    1,
    Math.min(maxWidth, allowOverflow ? Infinity : viewport.width),
  )
  const upperHeight = Math.max(
    1,
    Math.min(maxHeight, allowOverflow ? Infinity : viewport.height),
  )
  const width = Math.min(
    upperWidth,
    Math.max(Math.min(minWidth, upperWidth), rect.width),
  )
  const height = Math.min(
    upperHeight,
    Math.max(Math.min(minHeight, upperHeight), rect.height),
  )
  return {
    width,
    height,
    x: allowOverflow
      ? rect.x
      : Math.max(0, Math.min(viewport.width - width, rect.x)),
    y: allowOverflow
      ? rect.y
      : Math.max(0, Math.min(viewport.height - height, rect.y)),
  }
}
export function resizeFloatingRect(
  rect: FloatingRect,
  edge: string,
  dx: number,
  dy: number,
  viewport: FloatingBounds,
  minWidth: number,
  minHeight: number,
  maxWidth: number,
  maxHeight: number,
  allowOverflow: boolean,
): FloatingRect {
  const west = edge.includes('w'),
    north = edge.includes('n')
  const widthLimit = allowOverflow
    ? maxWidth
    : Math.min(maxWidth, west ? rect.x + rect.width : viewport.width - rect.x)
  const heightLimit = allowOverflow
    ? maxHeight
    : Math.min(
        maxHeight,
        north ? rect.y + rect.height : viewport.height - rect.y,
      )
  const width =
    edge.includes('w') || edge.includes('e')
      ? Math.max(
          Math.min(minWidth, widthLimit),
          Math.min(widthLimit, rect.width + (west ? -dx : dx)),
        )
      : rect.width
  const height =
    edge.includes('n') || edge.includes('s')
      ? Math.max(
          Math.min(minHeight, heightLimit),
          Math.min(heightLimit, rect.height + (north ? -dy : dy)),
        )
      : rect.height
  return {
    width,
    height,
    x: west ? rect.x + rect.width - width : rect.x,
    y: north ? rect.y + rect.height - height : rect.y,
  }
}
