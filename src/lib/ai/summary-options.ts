export const SUMMARY_TIME_RANGES_HOURS = [24, 168, 720] as const;
export const DEFAULT_SUMMARY_TIME_RANGE_HOURS = SUMMARY_TIME_RANGES_HOURS[0];

export function normalizeSummaryTimeRangeHours(value: unknown): number {
  const hours = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return SUMMARY_TIME_RANGES_HOURS.find((range) => range === hours)
    ?? DEFAULT_SUMMARY_TIME_RANGE_HOURS;
}
