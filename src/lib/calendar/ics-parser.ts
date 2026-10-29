export interface IcsAttendee {
  name?: string;
  email?: string;
  role?: string;
  partstat?: string;
}

export interface IcsEvent {
  summary: string;
  description?: string;
  location?: string;
  organizerName?: string;
  organizerEmail?: string;
  startDate: Date;
  endDate: Date;
  attendees: IcsAttendee[];
  meetingUrl?: string;
}

const TORONTO_TIME_ZONE = 'America/Toronto';

const WINDOWS_TIME_ZONE_ALIASES: Record<string, string> = {
  'Eastern Standard Time': 'America/Toronto',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'US Mountain Standard Time': 'America/Phoenix',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Alaskan Standard Time': 'America/Anchorage',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
  'Atlantic Standard Time': 'America/Halifax',
  'Newfoundland Standard Time': 'America/St_Johns',
  'US/Eastern': 'America/Toronto',
  'Canada/Eastern': 'America/Toronto',
  'Toronto Standard Time': 'America/Toronto',
};

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
  const lines = unfolded.split(/\r?\n/);

  const events: IcsEvent[] = [];
  let currentEventLines: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      currentEventLines = [];
    } else if (trimmed === 'END:VEVENT') {
      if (currentEventLines) {
        const parsed = parseVEvent(currentEventLines);
        if (parsed) events.push(parsed);
        currentEventLines = null;
      }
    } else if (currentEventLines) {
      currentEventLines.push(line);
    }
  }

  return events;
}

function parseVEvent(lines: string[]): IcsEvent | null {
  let summary = 'Untitled Event';
  let description = '';
  let location = '';
  let microsoftLocations = '';
  let organizerName = '';
  let organizerEmail = '';
  let startDate: Date | null = null;
  let endDate: Date | null = null;
  const attendees: IcsAttendee[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(';')) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const keyWithParams = line.substring(0, colonIdx);
    const rawVal = line.substring(colonIdx + 1);
    const val = unescapeIcsText(rawVal);

    const parts = keyWithParams.split(';');
    const key = parts[0].toUpperCase();
    const paramsMap = parseParams(parts.slice(1));

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
        startDate = parseIcsDate(rawVal, paramsMap);
        break;
      case 'DTEND':
        endDate = parseIcsDate(rawVal, paramsMap);
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

  if (startDate && !endDate) {
    endDate = new Date(startDate.getTime() + 30 * 60 * 1000);
  }

  if (!startDate || !endDate) return null;

  const meetingUrl = extractMeetingUrl(description || location);

  return {
    summary,
    description,
    location: location || (meetingUrl ? 'Microsoft Teams Meeting' : 'Online Meeting'),
    organizerName: organizerName || organizerEmail,
    organizerEmail,
    startDate,
    endDate,
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

export function parseIcsDate(val: string, params: Record<string, string> = {}): Date | null {
  if (!val) return null;
  const clean = val.trim().replace(/^["']|["']$/g, '');

  // Format: YYYYMMDDTHHMM[SS][Z]
  const m = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (m) {
    const [, y, mon, d, h, min, seconds, isUtc] = m;
    if (isUtc) {
      return new Date(Date.UTC(+y, +mon - 1, +d, +h, +min, +(seconds || 0)));
    }
    return dateFromWallClockInZone(
      +y,
      +mon,
      +d,
      +h,
      +min,
      +(seconds || 0),
      getIanaTimeZone(params.TZID)
    );
  }

  // Format: YYYYMMDD (Date only)
  const mDate = clean.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (mDate) {
    const [_, y, mon, d] = mDate;
    return dateFromWallClockInZone(+y, +mon, +d, 0, 0, 0, getIanaTimeZone(params.TZID));
  }

  const parsed = new Date(clean);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function getIanaTimeZone(timeZone: string | undefined): string {
  const requestedZone = timeZone?.trim().replace(/^"|"$/g, '');
  if (!requestedZone) return TORONTO_TIME_ZONE;

  const aliasedZone = WINDOWS_TIME_ZONE_ALIASES[requestedZone] || requestedZone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: aliasedZone });
    return aliasedZone;
  } catch {
    return TORONTO_TIME_ZONE;
  }
}

function dateFromWallClockInZone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const wallClockTimestamp = Date.UTC(year, month - 1, day, hour, minute, second);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  let timestamp = wallClockTimestamp;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = formatter.formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
    const representedTimestamp = Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second
    );
    const offset = representedTimestamp - timestamp;
    const adjustedTimestamp = wallClockTimestamp - offset;
    if (adjustedTimestamp === timestamp) break;
    timestamp = adjustedTimestamp;
  }

  return new Date(timestamp);
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

  let startDate: Date | null = null;
  let endDate: Date | null = null;

  // Match pattern like: "Wednesday, July 29, 2026 3:00 PM-3:30 PM" or "July 29, 2026 3:00 PM"
  const dateTimeMatch = combined.match(/(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+)?([A-Z][a-z]+\s+\d{1,2},\s+\d{4})\s+(\d{1,2}:\d{2}\s*(?:AM|PM))\s*(?:-\s*(\d{1,2}:\d{2}\s*(?:AM|PM)))?/i);

  if (dateTimeMatch) {
    const [_, datePart, startTimePart, endTimePart] = dateTimeMatch;
    const parsedStart = parseEmailMeetingDateTime(datePart, startTimePart);
    if (!isNaN(parsedStart.getTime())) {
      startDate = parsedStart;
      if (endTimePart) {
        const parsedEnd = parseEmailMeetingDateTime(datePart, endTimePart);
        if (!isNaN(parsedEnd.getTime())) {
          endDate = parsedEnd;
        }
      }
    }
  }

  if (!startDate) {
    startDate = email.receivedAt ? new Date(email.receivedAt) : new Date();
  }

  if (!endDate) {
    endDate = new Date(startDate.getTime() + 30 * 60 * 1000);
  }

  return {
    summary,
    description: text,
    location,
    organizerName: email.fromName || email.fromAddress || undefined,
    organizerEmail: email.fromAddress || undefined,
    startDate,
    endDate,
    meetingUrl,
    attendees: [],
  };
}

function parseEmailMeetingDateTime(datePart: string, timePart: string): Date {
  const dateMatch = datePart.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  const timeMatch = timePart.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!dateMatch || !timeMatch) return new Date(Number.NaN);

  const month = new Date(`${dateMatch[1]} 1, 2000`).getMonth() + 1;
  let hour = Number(timeMatch[1]) % 12;
  if (timeMatch[3].toUpperCase() === 'PM') hour += 12;

  return dateFromWallClockInZone(
    Number(dateMatch[3]),
    month,
    Number(dateMatch[2]),
    hour,
    Number(timeMatch[2]),
    0,
    TORONTO_TIME_ZONE
  );
}
