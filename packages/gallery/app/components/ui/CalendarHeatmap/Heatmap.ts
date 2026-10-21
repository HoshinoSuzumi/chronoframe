export interface Value {
  date: Date | string
  count: number
}

export interface Activity {
  count: number
  colorIndex: number
}

export type Activities = Map<string, Activity>

export interface CalendarItem {
  date: Date
  count?: number
  colorIndex: number
}

export type Calendar = CalendarItem[][]

export interface Month {
  value: number
  index: number
}

export interface Locale {
  months: string[]
  days: string[]
  on: string
  less: string
  more: string
}

export type TooltipFormatter = (item: CalendarItem, unit: string) => string

// 颜色主题配置
export const COLOR_THEMES = {
  // 默认蓝色主题
  blue: {
    light: ['#ebedf0', '#dae2ef', '#c0ddf9', '#73b3f3', '#3886e1', '#17459e'],
    dark: ['#1f1f22', '#1e334a', '#1d466c', '#1d5689', '#1d69ac', '#1B95D1'],
  },
  // 绿色主题
  green: {
    light: ['#ebedf0', '#c6e48b', '#7bc96f', '#239a3b', '#196127', '#0d2818'],
    dark: ['#1f1f22', '#0e4429', '#006d32', '#26a641', '#39d353', '#57e86a'],
  },
  // 红色主题
  red: {
    light: ['#ebedf0', '#f9d3d3', '#f2a7a7', '#ec6b6b', '#d63a3a', '#800f0f'],
    dark: ['#1f1f22', '#4a1e1e', '#6c1d1d', '#892121', '#ac2626', '#d13b3b'],
  },
  // 紫色主题
  purple: {
    light: ['#ebedf0', '#e2d6f9', '#c9a9f2', '#a26be5', '#6a35c9', '#2f0b73'],
    dark: ['#1f1f22', '#2c1e4a', '#412d6c', '#583d92', '#764eb8', '#9b6edb'],
  },
  // 橙色主题
  orange: {
    light: ['#ebedf0', '#ffe0c2', '#ffbb80', '#ff944d', '#e66a00', '#803900'],
    dark: ['#1f1f22', '#4a2e1e', '#6c3f1d', '#8c4f1d', '#b05d14', '#e67826'],
  },
  // 青色主题
  teal: {
    light: ['#ebedf0', '#c2f0ed', '#80dfd9', '#4ac6c0', '#229a96', '#0d4c4a'],
    dark: ['#1f1f22', '#1e3a3a', '#1d5656', '#1d6f6c', '#1d8f8c', '#26b3af'],
  },
  // 金色主题
  gold: {
    light: ['#ebedf0', '#fff6c2', '#ffe680', '#ffda4d', '#e6b800', '#7f6a00'],
    dark: ['#1f1f22', '#4a421e', '#6c5e1d', '#8c781d', '#b08f14', '#e6b825'],
  },
} as const

export class Heatmap {
  static readonly DAYS_IN_ONE_YEAR = 365
  static readonly DAYS_IN_WEEK = 7

  startDate: Date
  endDate: Date
  max: number
  private _values: Value[]
  private _firstFullWeekOfMonths?: Month[]
  private _activities?: Activities
  private _calendar?: Calendar

  constructor(
    endDate: Date | string,
    values: Value[],
    max?: number,
    startDate?: Date | string,
  ) {
    this.endDate = this.parseDate(endDate)
    if (startDate) {
      this.startDate = this.parseDate(startDate)
    } else {
      this.startDate = this.shiftDate(this.endDate, -Heatmap.DAYS_IN_ONE_YEAR)
    }
    this._values = values || []
    this.max = max || Math.max(...this._values.map((v) => v.count))
    this._activities = undefined
    this._calendar = undefined
    this._firstFullWeekOfMonths = undefined
  }

  set values(v: Value[]) {
    this._values = v
    this.max = Math.max(...v.map((item) => item.count))
    this._activities = undefined
    this._calendar = undefined
    this._firstFullWeekOfMonths = undefined
  }

  get values(): Value[] {
    return this._values
  }

  get activities(): Activities {
    if (!this._activities) {
      this._activities = new Map()
      for (const value of this._values) {
        const date = this.parseDate(value.date)
        const key = this.keyDayParser(date)
        this._activities.set(key, {
          count: value.count,
          colorIndex: this.getColorIndex(value.count),
        })
      }
    }
    return this._activities
  }

  get weekCount(): number {
    return Math.ceil(
      (this.getCountEmptyDaysAtStart() + this.getDaysCount()) /
        Heatmap.DAYS_IN_WEEK,
    )
  }

  get calendar(): Calendar {
    if (!this._calendar) {
      const calendar: Calendar = []
      let week: CalendarItem[] = []

      // Check if this is a specific year (exactly 365/366 days from Jan 1 to Dec 31)
      const isSpecificYear = this.isExactYearRange()

      if (isSpecificYear) {
        // For specific year, start with empty slots only for days before the first day of the year
        const emptyDaysAtStart = this.getCountEmptyDaysAtStart()

        // Add empty days at the start of the first week
        for (let i = 0; i < emptyDaysAtStart; i++) {
          week.push({
            date: new Date(0), // Use epoch as placeholder for empty days
            colorIndex: 0,
            count: undefined,
          })
        }
      } else {
        // For non-specific year ranges (like "recent year"), add padding to align to week start
        const emptyDaysAtStart = this.getCountEmptyDaysAtStart()

        // Add empty days at the start of the first week
        for (let i = 0; i < emptyDaysAtStart; i++) {
          week.push({
            date: new Date(0), // Use epoch as placeholder for empty days
            colorIndex: 0,
            count: undefined,
          })
        }
      }

      // Fill actual days
      const currentDate = new Date(this.startDate)
      while (currentDate <= this.endDate) {
        const key = this.keyDayParser(currentDate)
        const activity = this.activities.get(key)

        week.push({
          date: new Date(currentDate),
          count: activity?.count,
          colorIndex: activity?.colorIndex || 0,
        })

        if (week.length === Heatmap.DAYS_IN_WEEK) {
          calendar.push(week)
          week = []
        }

        currentDate.setDate(currentDate.getDate() + 1)
      }

      if (isSpecificYear) {
        // For specific year, add empty slots only for days after the last day of the year
        const emptyDaysAtEnd = this.getCountEmptyDaysAtEnd()
        for (let i = 0; i < emptyDaysAtEnd; i++) {
          week.push({
            date: new Date(0), // Use epoch as placeholder for empty days
            colorIndex: 0,
            count: undefined,
          })
        }
      } else {
        // For other ranges (like "recent year"), use the original logic
        const emptyDaysAtEnd = this.getCountEmptyDaysAtEnd()
        const nextDate = new Date(currentDate)
        for (let i = 0; i < emptyDaysAtEnd; i++) {
          week.push({
            date: new Date(nextDate),
            colorIndex: 0,
          })
          nextDate.setDate(nextDate.getDate() + 1)
        }
      }

      if (week.length > 0) {
        calendar.push(week)
      }

      this._calendar = calendar
    }
    return this._calendar
  }

  get firstFullWeekOfMonths(): Month[] {
    if (!this._firstFullWeekOfMonths) {
      const months: Month[] = []
      const calendar = this.calendar

      for (let weekIndex = 0; weekIndex < calendar.length; weekIndex++) {
        const week = calendar[weekIndex]
        if (week && week.length > 0) {
          // Check each day in the week to find the 1st day of any month
          for (const day of week) {
            if (day.date.getTime() > 0 && day.date.getDate() === 1) {
              const month = day.date.getMonth()

              // Check if this month is not already in our list
              const existingMonth = months.find((m) => m.value === month)
              if (!existingMonth) {
                months.push({
                  value: month,
                  index: weekIndex,
                })
              }
            }
          }
        }
      }

      // Sort by month value to ensure proper order
      months.sort((a, b) => a.value - b.value)
      this._firstFullWeekOfMonths = months
    }
    return this._firstFullWeekOfMonths
  }

  getColorIndex(count?: number): number {
    if (!count || count === 0) return 0
    if (count >= this.max) return 4

    const step = this.max / 4
    if (count <= step) return 1
    if (count <= step * 2) return 2
    if (count <= step * 3) return 3
    return 4
  }

  getCountEmptyDaysAtStart(): number {
    return this.startDate.getDay()
  }

  getCountEmptyDaysAtEnd(): number {
    return Heatmap.DAYS_IN_WEEK - 1 - this.endDate.getDay()
  }

  getDaysCount(): number {
    // Count calendar dates, independent of time of day and daylight saving time.
    const start = Date.UTC(
      this.startDate.getFullYear(),
      this.startDate.getMonth(),
      this.startDate.getDate(),
    )
    const end = Date.UTC(
      this.endDate.getFullYear(),
      this.endDate.getMonth(),
      this.endDate.getDate(),
    )
    return (end - start) / (1000 * 60 * 60 * 24) + 1
  }

  isExactYearRange(): boolean {
    // Check if this represents an exact year (Jan 1 to Dec 31)
    const startYear = this.startDate.getFullYear()
    const endYear = this.endDate.getFullYear()

    return (
      startYear === endYear &&
      this.startDate.getMonth() === 0 && // January
      this.startDate.getDate() === 1 && // 1st day
      this.endDate.getMonth() === 11 && // December
      this.endDate.getDate() === 31 // 31st day
    )
  }

  private shiftDate(date: Date, numDays: number): Date {
    const newDate = new Date(date)
    newDate.setDate(newDate.getDate() + numDays)
    return newDate
  }

  private parseDate(date: Date | string): Date {
    // Date-only strings represent local calendar dates, not UTC instants.
    let parsed: Date
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [year, month, day] = date.split('-').map(Number) as [
        number,
        number,
        number,
      ]
      parsed = new Date(year, month - 1, day)
    } else {
      parsed = new Date(date)
    }
    parsed.setHours(0, 0, 0, 0)
    return parsed
  }

  private keyDayParser(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
}
