import ICAL from 'ical.js';

interface Observance {
  start: ICAL.Time;
  from: number;
  to: number;
  dates: ICAL.Time[];
  rule?: ICAL.Recur;
}

type EmbeddedTimeZone = (wallTime: Date) => Date | undefined;

export function readEmbeddedTimeZones(calendar: string): Map<string, EmbeddedTimeZone> {
  const zones = new Map<string, EmbeddedTimeZone>();

  for (const [source] of calendar.matchAll(/^BEGIN:VTIMEZONE[ \t]*\r?\n[\s\S]*?^END:VTIMEZONE[ \t]*\r?$/gim)) {
    try {
      const component = new ICAL.Component(ICAL.parse(source));
      const id = component.getFirstPropertyValue('tzid');
      if (typeof id !== 'string' || !id.trim()) continue;

      const components = component.getAllSubcomponents().filter(
        (child) => child.name === 'standard' || child.name === 'daylight',
      );
      const observances = components.map(readObservance);
      if (observances.length && observances.every((observance) => observance !== null)) {
        zones.set(id.trim(), (wallTime) => resolveWallTime(wallTime, observances));
      }
    } catch {
      // A broken VTIMEZONE can still refer to a known IANA or Windows zone.
    }
  }

  return zones;
}

function readObservance(component: ICAL.Component): Observance | null {
  const start = component.getFirstPropertyValue('dtstart');
  const from = readOffset(component, 'tzoffsetfrom');
  const to = readOffset(component, 'tzoffsetto');
  if (!(start instanceof ICAL.Time) || start.isDate || from === null || to === null) return null;

  const dates = component.getAllProperties('rdate').flatMap((property) => property.getValues());
  if (!dates.every((date): date is ICAL.Time => date instanceof ICAL.Time && !date.isDate)) return null;

  const rule = component.getFirstPropertyValue('rrule');
  return { start, from, to, dates, rule: rule instanceof ICAL.Recur ? rule : undefined };
}

function readOffset(component: ICAL.Component, name: string): number | null {
  // Read the raw value to preserve the optional seconds in RFC 5545 offsets.
  const value: unknown = component.getFirstProperty(name)?.toJSON()[3];
  if (typeof value !== 'string') return null;

  const match = /^([+-])(\d\d):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
  if (!match || Number(match[2]) > 23) return null;

  const [, sign, hours, minutes, seconds = '0'] = match;
  return (sign === '-' ? -1 : 1) * (+hours * 3600 + +minutes * 60 + +seconds);
}

function resolveWallTime(wallTime: Date, observances: Observance[]): Date | undefined {
  const wallSeconds = wallTime.getTime() / 1000;
  let earliestInstant = Infinity;
  let initialOffset = 0;
  let latestInstant = -Infinity;
  let currentOffset = 0;
  let remainingOccurrences = 10_000;

  for (const { start, from, to, dates, rule } of observances) {
    function consider(onset: number) {
      const instant = onset - from;
      if (instant < earliestInstant) {
        earliestInstant = instant;
        initialOffset = from;
      }

      // Use the old offset for both skipped and repeated local times (RFC 5545).
      const effectiveWallTime = onset + Math.max(0, to - from);
      if (effectiveWallTime <= wallSeconds && instant >= latestInstant) {
        latestInstant = instant;
        currentOffset = to;
      }
    }

    consider(start.toUnixTime());
    for (const date of dates) consider(date.toUnixTime());
    if (!rule || start.toUnixTime() > wallSeconds) continue;

    try {
      const localRule = rule.clone();
      if (localRule.until?.zone === ICAL.Timezone.utcTimezone) {
        localRule.until.fromUnixTime(localRule.until.toUnixTime() + from);
        localRule.until.zone = ICAL.Timezone.localTimezone;
      }

      const iterator = localRule.iterator(start);
      for (let next = iterator.next(); next; next = iterator.next()) {
        const onset = next.toUnixTime();
        if (onset > wallSeconds) break;
        if (--remainingOccurrences < 0) return undefined;
        consider(onset);
      }
    } catch {
      return undefined;
    }
  }

  const offset = latestInstant === -Infinity ? initialOffset : currentOffset;
  return new Date(wallTime.getTime() - offset * 1000);
}
