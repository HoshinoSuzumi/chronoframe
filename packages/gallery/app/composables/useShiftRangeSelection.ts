import type { TableRow } from '@nuxt/ui'

type RowSelectionState = Record<string, boolean>

interface RangeSelectableTable<T> {
  getRowModel(): { rows: TableRow<T>[] }
  setRowSelection(
    updater: (previous: RowSelectionState) => RowSelectionState,
  ): void
}

/**
 * Shift+click range selection over an ordered list of items.
 */
export function useShiftRangeSelection() {
  let anchorId: string | null = null
  let pendingShiftKey = false

  function getRangeIds(
    orderedIds: readonly string[],
    targetId: string,
    shiftKey: boolean,
  ): string[] {
    const anchorIndex =
      shiftKey && anchorId !== null ? orderedIds.indexOf(anchorId) : -1
    const targetIndex = orderedIds.indexOf(targetId)

    anchorId = targetId

    if (anchorIndex === -1 || targetIndex === -1) {
      return [targetId]
    }

    return anchorIndex <= targetIndex
      ? orderedIds.slice(anchorIndex, targetIndex + 1)
      : orderedIds.slice(targetIndex, anchorIndex + 1).reverse()
  }

  function resetAnchor() {
    anchorId = null
  }

  function captureModifiers(event: MouseEvent) {
    pendingShiftKey = event.shiftKey
  }

  function preventShiftTextSelection(event: MouseEvent) {
    if (event.shiftKey) {
      event.preventDefault()
    }
  }

  function toggleTableRow<T>(
    table: RangeSelectableTable<T>,
    row: TableRow<T>,
    value: boolean,
  ) {
    const shiftKey = pendingShiftKey
    pendingShiftKey = false

    const rows = table.getRowModel().rows
    const rangeIds = new Set(
      getRangeIds(
        rows.map((r) => r.id),
        row.id,
        shiftKey,
      ),
    )

    if (rangeIds.size === 1) {
      row.toggleSelected(value)
      return
    }

    table.setRowSelection((previous) => {
      const next: RowSelectionState = { ...previous }
      for (const rangeRow of rows) {
        if (!rangeIds.has(rangeRow.id) || !rangeRow.getCanSelect()) continue
        if (value) {
          next[rangeRow.id] = true
        } else {
          delete next[rangeRow.id]
        }
      }
      return next
    })
  }

  return {
    getRangeIds,
    resetAnchor,
    captureModifiers,
    preventShiftTextSelection,
    toggleTableRow,
  }
}
