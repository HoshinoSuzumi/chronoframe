export type DebugValue = string | number | boolean | null
export type DebugControl = {
  key: string
  label: string
  type: 'switch' | 'select' | 'number' | 'text' | 'status' | 'action'
  default?: DebugValue
  options?: { label: string; value: string | number }[]
  min?: number
  max?: number
  step?: number
  value?: DebugValue
  action?: () => void
  disabled?: boolean
}
export type DebugSection = {
  active?: boolean
  id: string
  route: string
  title: string
  controls: DebugControl[]
}
