import moment from 'moment-timezone';
import type { CalendarTime, IcsEvent } from './ics-parser';

const HOUR = 3_600_000;
const DAY_FORMAT = 'dddd, MMMM D, YYYY';
const CLOCK_FORMAT = 'h:mm A';

function displayTime(time: CalendarTime, zone: string) {
  return (time.kind === 'instant' ? moment.tz(time.date, zone) : moment.utc(time.date)).locale('en');
}

function timeZoneLabel(time: CalendarTime, displayZone: string, displayed: moment.Moment) {
  switch (time.kind) {
    case 'instant':
      return `${displayZone} · UTC${displayed.format('Z')}`;
    case 'unresolved':
      return `Time zone unconfirmed: ${time.timeZone}`;
    case 'floating':
      return 'No time zone in invitation';
    case 'all-day':
      return 'All day';
  }
}

export function formatTimetable(event: IcsEvent, timeZone: string) {
  const start = displayTime(event.start, timeZone);
  const end = displayTime(event.end, timeZone);
  if (event.start.kind === 'all-day' && event.end.kind === 'all-day') {
    const lastDay = end.clone().subtract(1, 'day');
    const date = start.format(DAY_FORMAT);
    const range = lastDay.isAfter(start) ? ` – ${lastDay.format(DAY_FORMAT)}` : '';
    return { label: `${date}${range} (All day)`, grid: null };
  }

  const sameDay = start.format('YYYY-MM-DD') === end.format('YYYY-MM-DD');
  const sameClock = event.start.kind === event.end.kind
    && (event.start.kind !== 'unresolved' || (
      event.end.kind === 'unresolved' && event.start.timeZone === event.end.timeZone
    ));
  const startLabel = timeZoneLabel(event.start, timeZone, start);
  const endLabel = timeZoneLabel(event.end, timeZone, end);
  const startFormat = event.start.kind === 'all-day' ? DAY_FORMAT : `${DAY_FORMAT} ${CLOCK_FORMAT}`;
  const endFormat = event.end.kind === 'all-day' ? DAY_FORMAT : sameDay ? CLOCK_FORMAT : startFormat;
  const startText = start.format(startFormat);
  const endText = end.format(endFormat);
  const label = startLabel === endLabel
    ? `${startText} – ${endText} (${startLabel})`
    : `${startText} (${startLabel}) – ${endText} (${endLabel})`;

  const duration = end.diff(start);
  if (!sameDay || !sameClock || duration <= 0) {
    return { label, grid: null };
  }

  // Advance by elapsed hours so skipped and repeated hours match the clock labels.
  const dayStart = start.clone().startOf('day');
  const dayEnd = dayStart.clone().add(1, 'day').startOf('day').valueOf();
  const gridStart = Math.max(start.clone().startOf('hour').valueOf() - HOUR, dayStart.valueOf());
  const gridEnd = Math.min(Math.max(gridStart + 3 * HOUR, end.valueOf() + HOUR), dayEnd);
  const zone = event.start.kind === 'instant' ? timeZone : 'UTC';
  const offsetChanges = moment.tz(gridStart, zone).utcOffset() !== moment.tz(gridEnd - 1, zone).utcOffset();
  const ticks = [];
  for (let instant = gridStart; instant < gridEnd; instant += HOUR) {
    const tick = moment.tz(instant, zone).locale('en');
    ticks.push({
      label: tick.format(tick.minute() ? CLOCK_FORMAT : 'h A'),
      offset: offsetChanges ? tick.format('Z') : undefined,
    });
  }

  return {
    label,
    grid: {
      ticks,
      height: (gridEnd - gridStart) / HOUR,
      start: (start.valueOf() - gridStart) / HOUR,
      duration: duration / HOUR,
    },
  };
}
