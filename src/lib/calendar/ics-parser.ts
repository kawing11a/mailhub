import moment from 'moment-timezone';
import { findIana } from 'windows-iana';
import { readEmbeddedTimeZones } from './embedded-time-zones';

export interface IcsAttendee {
  name?: string;
  email?: string;
  role?: string;
  partstat?: string;
}

// For times without an instant, the UTC fields carry the original calendar date or clock time.
export type CalendarTime =
  | { kind: 'instant'; date: Date; timeZone: string }
  | { kind: 'unresolved'; date: Date; timeZone: string }
  | { kind: 'floating'; date: Date }
  | { kind: 'all-day'; date: Date };

export interface IcsEvent {
  summary: string;
  description?: string;
  location?: string;
  organizerName?: string;
  organizerEmail?: string;
  start: CalendarTime;
  end: CalendarTime;
  attendees: IcsAttendee[];
  meetingUrl?: string;
}

const ICS_DATE_TIME_FORMATS = ['YYYYMMDDTHHmmss', 'YYYYMMDDTHHmm'];
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export function isCalendarAttachment(att: { filename?: string | null; contentType?: string | null }): boolean {
  if (!att) return false;
  const filename = att.filename?.toLowerCase() || '';
  const contentType = att.contentType?.toLowerCase() || '';
  return (
    filename.endsWith('.ics') ||
    filename.endsWith('.vcs') ||
    filename.includes('invite') ||
    filename.includes('calendar') ||
    contentType.includes('calendar') ||
    contentType.includes('ics') ||
    contentType.includes('vcalendar')
  );
}

export function parseIcs(icsContent: string): IcsEvent[] {
  if (!icsContent || typeof icsContent !== 'string') return [];

  // Unfold folded lines (RFC 5545 section 3.1)
  const unfolded = icsContent.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const calendars = Array.from(
    unfolded.matchAll(/^BEGIN:VCALENDAR[ \t]*\r?\n[\s\S]*?^END:VCALENDAR[ \t]*\r?$/gim),
    ([calendar]) => calendar,
  );
  return (calendars.length ? calendars : [unfolded]).flatMap(parseVCalendar);
}

function parseVCalendar(calendar: string): IcsEvent[] {
  const zones = readEmbeddedTimeZones(calendar);
  const events: IcsEvent[] = [];
  let currentEventLines: string[] | null = null;
  let nestedDepth = 0;

  for (const line of calendar.split(/\r?\n/)) {
    const marker = line.trim().toUpperCase();
    if (!currentEventLines && marker === 'BEGIN:VEVENT') {
      currentEventLines = [];
    } else if (currentEventLines) {
      if (marker === 'END:VEVENT') {
        const parsed = parseVEvent(currentEventLines, zones);
        if (parsed) events.push(parsed);
        currentEventLines = null;
        nestedDepth = 0;
      } else if (marker.startsWith('BEGIN:')) {
        nestedDepth += 1;
      } else if (marker.startsWith('END:')) {
        nestedDepth = Math.max(0, nestedDepth - 1);
      } else if (nestedDepth === 0) {
        currentEventLines.push(line);
      }
    }
  }

  return events;
}

function parseVEvent(lines: string[], zones: ReturnType<typeof readEmbeddedTimeZones>): IcsEvent | null {
  let summary = 'Untitled Event';
  let description = '';
  let location = '';
  let microsoftLocations = '';
  let organizerName = '';
  let organizerEmail = '';
  let start: CalendarTime | null = null;
  let end: CalendarTime | null = null;
  const attendees: IcsAttendee[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(';')) continue;

    const property = /^((?:[^":]|"[^"]*")+):(.*)$/.exec(line);
    if (!property) continue;

    const [, keyWithParams, rawVal] = property;
    const val = unescapeIcsText(rawVal);

    const [name, ...params] = keyWithParams.match(/(?:[^;"]|"[^"]*")+/g) ?? [];
    if (!name) continue;
    const key = name.toUpperCase();
    const paramsMap = parseParams(params);

    switch (key) {
      case 'SUMMARY':
        if (val.trim()) summary = val.trim();
        break;
      case 'DESCRIPTION':
        description = val;
        break;
      case 'LOCATION':
        if (val.trim()) location = val.trim();
        break;
      case 'X-MICROSOFT-LOCATIONS':
        microsoftLocations = val;
        break;
      case 'DTSTART':
        start = parseIcsTime(rawVal, paramsMap.TZID, zones);
        break;
      case 'DTEND':
        end = parseIcsTime(rawVal, paramsMap.TZID, zones);
        break;
      case 'ORGANIZER': {
        if (paramsMap['CN']) organizerName = paramsMap['CN'];
        if (rawVal.toLowerCase().startsWith('mailto:')) {
          organizerEmail = rawVal.substring(7);
        } else if (val.toLowerCase().startsWith('mailto:')) {
          organizerEmail = val.substring(7);
        }
        break;
      }
      case 'ATTENDEE': {
        const name = paramsMap['CN'] || '';
        let email = '';
        if (rawVal.toLowerCase().startsWith('mailto:')) {
          email = rawVal.substring(7);
        } else if (val.toLowerCase().startsWith('mailto:')) {
          email = val.substring(7);
        }
        attendees.push({
          name: name || email,
          email,
          role: paramsMap['ROLE'],
          partstat: paramsMap['PARTSTAT'],
        });
        break;
      }
    }
  }

  // Fallback location from X-MICROSOFT-LOCATIONS if LOCATION empty
  if (!location && microsoftLocations) {
    try {
      const locs = JSON.parse(microsoftLocations);
      if (Array.isArray(locs) && locs.length > 0 && locs[0].DisplayName) {
        location = locs[0].DisplayName;
      }
    } catch {
      // ignore
    }
  }

  if (!start) return null;
  const defaultDuration = start.kind === 'all-day' ? DAY : 30 * MINUTE;
  end ??= { ...start, date: new Date(start.date.getTime() + defaultDuration) };

  const meetingUrl = extractMeetingUrl(description || location);

  return {
    summary,
    description,
    location: location || (meetingUrl ? 'Microsoft Teams Meeting' : 'Online Meeting'),
    organizerName: organizerName || organizerEmail,
    organizerEmail,
    start,
    end,
    attendees,
    meetingUrl,
  };
}

function parseParams(paramsList: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const param of paramsList) {
    const eqIdx = param.indexOf('=');
    if (eqIdx !== -1) {
      const k = param.substring(0, eqIdx).toUpperCase();
      let v = param.substring(eqIdx + 1);
      if (v.startsWith('"') && v.endsWith('"')) {
        v = v.slice(1, -1);
      }
      result[k] = v;
    }
  }
  return result;
}

function unescapeIcsText(str: string): string {
  return str
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .replace(/\\n/gi, '\n');
}

function parseIcsTime(
  val: string,
  sourceTimeZone: string | undefined,
  zones: ReturnType<typeof readEmbeddedTimeZones>,
): CalendarTime | null {
  const clean = val.trim().replace(/^["']|["']$/g, '').toUpperCase();
  if (/^\d{8}$|^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const day = moment.utc(clean, ['YYYYMMDD', 'YYYY-MM-DD'], true);
    return day.isValid() ? { kind: 'all-day', date: day.toDate() } : null;
  }

  const utc = clean.endsWith('Z');
  const value = utc ? clean.slice(0, -1) : clean;
  const isoOffset = /[T ].*([+-]\d{2}:?\d{2})$/.exec(value)?.[1];
  const wallTime = /^\d{8}T/.test(value)
    ? moment.utc(value, ICS_DATE_TIME_FORMATS, true)
    : moment.utc(value, moment.ISO_8601, true);
  if (!wallTime.isValid()) return null;

  if (utc || isoOffset) {
    return { kind: 'instant', date: wallTime.toDate(), timeZone: isoOffset ?? 'UTC' };
  }

  const timeZone = sourceTimeZone?.trim();
  if (!timeZone) return { kind: 'floating', date: wallTime.toDate() };

  const embedded = zones.get(timeZone)?.(wallTime.toDate());
  if (embedded) return { kind: 'instant', date: embedded, timeZone };

  const ianaName = timeZone === 'Toronto Standard Time'
    ? 'America/Toronto'
    : moment.tz.zone(timeZone.replace(/^\//, ''))?.name ?? findIana(timeZone, '001')[0];
  if (ianaName && moment.tz.zone(ianaName)) {
    const date = moment.tz(wallTime.toArray(), ianaName).toDate();
    return { kind: 'instant', date, timeZone };
  }

  return { kind: 'unresolved', date: wallTime.toDate(), timeZone };
}

function extractMeetingUrl(text: string): string | undefined {
  if (!text) return undefined;
  const match = text.match(/https?:\/\/(?:[a-z0-9-]+\.)*(?:teams\.microsoft\.com|zoom\.us|meet\.google\.com)[^\s<>"]*/i);
  return match ? match[0] : undefined;
}

export function parseMeetingFromEmail(email: {
  subject?: string | null;
  fromName?: string | null;
  fromAddress?: string | null;
  receivedAt?: Date | string | null;
  body?: { bodyText?: string | null; bodyHtml?: string | null } | null;
}): IcsEvent | null {
  if (!email) return null;

  const text = email.body?.bodyText || '';
  const html = email.body?.bodyHtml || '';
  const combined = text + '\n' + html;

  const isTeams = combined.includes('teams.microsoft.com') || combined.includes('Microsoft Teams meeting');
  const isZoom = combined.includes('zoom.us');
  const isGoogle = combined.includes('meet.google.com');

  if (!isTeams && !isZoom && !isGoogle) {
    return null;
  }

  const meetingUrl = extractMeetingUrl(combined);
  const location = isTeams
    ? 'Microsoft Teams Meeting'
    : isZoom
    ? 'Zoom Meeting'
    : isGoogle
    ? 'Google Meet'
    : 'Online Meeting';

  const summary = email.subject || 'Meeting Invite';

  let start: CalendarTime | undefined;
  let end: CalendarTime | undefined;

  // Match pattern like: "Wednesday, July 29, 2026 3:00 PM-3:30 PM" or "July 29, 2026 3:00 PM"
  const dateTimeMatch = combined.match(/(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+)?([A-Z][a-z]+\s+\d{1,2},\s+\d{4})\s+(\d{1,2}:\d{2}\s*(?:AM|PM))\s*(?:-\s*(\d{1,2}:\d{2}\s*(?:AM|PM)))?/i);

  if (dateTimeMatch) {
    const [, datePart, startTimePart, endTimePart] = dateTimeMatch;
    const parsedStart = moment.utc(`${datePart} ${startTimePart}`, 'MMMM D, YYYY h:mm A', 'en');
    if (parsedStart.isValid()) {
      start = { kind: 'floating', date: parsedStart.toDate() };
      if (endTimePart) {
        const parsedEnd = moment.utc(`${datePart} ${endTimePart}`, 'MMMM D, YYYY h:mm A', 'en');
        if (parsedEnd.isValid()) end = { kind: 'floating', date: parsedEnd.toDate() };
      }
    }
  }

  start ??= { kind: 'instant', date: email.receivedAt ? new Date(email.receivedAt) : new Date(), timeZone: 'UTC' };
  if (Number.isNaN(start.date.getTime())) return null;
  end ??= { ...start, date: new Date(start.date.getTime() + 30 * MINUTE) };

  return {
    summary,
    description: text,
    location,
    organizerName: email.fromName || email.fromAddress || undefined,
    organizerEmail: email.fromAddress || undefined,
    start,
    end,
    meetingUrl,
    attendees: [],
  };
}
