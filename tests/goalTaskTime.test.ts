import { describe, expect, it } from 'vitest'
import {
  formatTaskTimeRange,
  parseTaskTime24,
  toTaskTime24,
} from '../src/lib/goalTaskTime'

describe('goalTaskTime', () => {
  it('formats range with both, start-only, end-only', () => {
    expect(formatTaskTimeRange('09:00', '10:30')).toBe('09:00 ~ 10:30')
    expect(formatTaskTimeRange('09:00', undefined)).toBe('09:00 ~')
    expect(formatTaskTimeRange(undefined, '18:00')).toBe('~ 18:00')
    expect(formatTaskTimeRange(undefined, undefined)).toBeNull()
  })

  it('converts 12h picker values to 24h storage', () => {
    expect(toTaskTime24('am', 9, 0)).toBe('09:00')
    expect(toTaskTime24('pm', 2, 55)).toBe('14:55')
    expect(toTaskTime24('am', 12, 0)).toBe('00:00')
    expect(toTaskTime24('pm', 12, 0)).toBe('12:00')
  })

  it('parses stored 24h for picker', () => {
    expect(parseTaskTime24('14:55')).toEqual({ period: 'pm', hour12: 2, minute: 55 })
    expect(parseTaskTime24('00:00')).toEqual({ period: 'am', hour12: 12, minute: 0 })
  })
})
