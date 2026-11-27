import { parseIcs, isCalendarAttachment } from '../ics-parser';

function invitation(start: string, end: string, timeZone = '') {
  return `BEGIN:VCALENDAR
VERSION:2.0
${timeZone}
BEGIN:VEVENT
SUMMARY:Planning
DTSTART${start}
DTEND${end}
END:VEVENT
END:VCALENDAR`;
}

describe('ics-parser', () => {
  const sampleIcs = `BEGIN:VCALENDAR
METHOD:REQUEST
PRODID:Microsoft Exchange Server 2010
VERSION:2.0
BEGIN:VEVENT
ORGANIZER;CN=Robert McMillan:mailto:rmcmillan@oc-innovation.ca
ATTENDEE;ROLE=OPT-PARTICIPANT;CN=info@itcg.ca:mailto:info@itcg.ca
DESCRIPTION:Microsoft Teams meeting\\nJoin: https://teams.microsoft.com/meet/241318111466818
SUMMARY:Future Ready Discussion
DTSTART;TZID=Eastern Standard Time:20260729T150000
DTEND;TZID=Eastern Standard Time:20260729T153000
X-MICROSOFT-LOCATIONS:[ { "DisplayName" : "Microsoft Teams Meeting" } ]
END:VEVENT
END:VCALENDAR`;

  it('should identify calendar attachments correctly', () => {
    expect(isCalendarAttachment({ filename: 'invite.ics', contentType: 'text/calendar' })).toBe(true);
    expect(isCalendarAttachment({ filename: 'meeting.ICS', contentType: 'application/octet-stream' })).toBe(true);
    expect(isCalendarAttachment({ filename: 'document.pdf', contentType: 'application/pdf' })).toBe(false);
  });

  it('should parse iCalendar VEVENT data accurately', () => {
    const events = parseIcs(sampleIcs);
    expect(events).toHaveLength(1);

    const ev = events[0];
    expect(ev.summary).toBe('Future Ready Discussion');
    expect(ev.location).toBe('Microsoft Teams Meeting');
    expect(ev.organizerName).toBe('Robert McMillan');
    expect(ev.organizerEmail).toBe('rmcmillan@oc-innovation.ca');
    expect(ev.meetingUrl).toBe('https://teams.microsoft.com/meet/241318111466818');
    expect(ev).toMatchObject({
      start: { kind: 'instant', date: new Date('2026-07-29T19:00:00Z'), timeZone: 'Eastern Standard Time' },
      end: { kind: 'instant', date: new Date('2026-07-29T19:30:00Z') },
    });
  });

  it.each([
    ['America/Vancouver', '20260115', '17:00'],
    ['America/Vancouver', '20261015', '16:00'],
    ['America/Vancouver', '20261115', '16:00'],
    ['America/Los_Angeles', '20261115', '17:00'],
  ])('uses the rules for %s on %s', (zone, day, utcTime) => {
    const [event] = parseIcs(invitation(`;TZID=${zone}:${day}T090000`, `;TZID=${zone}:${day}T100000`));
    const isoDay = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}`;

    expect(event).toMatchObject({
      start: { kind: 'instant', date: new Date(`${isoDay}T${utcTime}:00Z`), timeZone: zone },
    });
  });

  it('honors the embedded rule for a matching TZID within each invitation', () => {
    const timeZone = `BEGIN:VTIMEZONE
TZID:Pacific Standard Time
BEGIN:STANDARD
DTSTART:20260308T020000
TZOFFSETFROM:-0800
TZOFFSETTO:-0700
END:STANDARD
END:VTIMEZONE`;
    const start = ';TZID="Pacific Standard Time":20261115T090000';
    const end = ';TZID="Pacific Standard Time":20261115T100000';

    expect(parseIcs(invitation(start, end, timeZone))[0]).toMatchObject({
      start: { kind: 'instant', date: new Date('2026-11-15T16:00:00Z') },
    });
    expect(parseIcs(invitation(start, end))[0]).toMatchObject({
      start: { kind: 'instant', date: new Date('2026-11-15T17:00:00Z') },
    });
  });

  it.each([
    ['20260308T023000', '2026-03-08T07:30:00Z'],
    ['20260308T033000', '2026-03-08T07:30:00Z'],
    ['20261101T013000', '2026-11-01T05:30:00Z'],
    ['20261101T023000', '2026-11-01T07:30:00Z'],
    ['20271107T090000', '2027-11-07T14:00:00Z'],
  ])('resolves embedded recurring transitions for %s', (date, expected) => {
    const timeZone = `BEGIN:VTIMEZONE
TZID:Custom:East
BEGIN:DAYLIGHT
DTSTART:20250309T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
END:DAYLIGHT
BEGIN:STANDARD
DTSTART:20251102T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU;UNTIL=20261101T060000Z
RDATE:20271107T020000,20281105T020000
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
END:STANDARD
END:VTIMEZONE`;
    const time = `;TZID="Custom:East":${date}`;

    expect(parseIcs(invitation(time, time, timeZone))[0]).toMatchObject({
      start: { kind: 'instant', date: new Date(expected), timeZone: 'Custom:East' },
    });
  });

  it('gives an all-day event without DTEND an exclusive end on the next date', () => {
    const event = parseIcs('BEGIN:VEVENT\nDTSTART;VALUE=DATE:20261115\nEND:VEVENT')[0];

    expect(event.end).toEqual({ kind: 'all-day', date: new Date('2026-11-16T00:00:00Z') });
  });

  it.each([
    [':20261115T090000Z', 'instant', '2026-11-15T09:00:00Z'],
    [':20261115T090000', 'floating', '2026-11-15T09:00:00Z'],
    [';TZID=Unknown/Zone:20261115T090000', 'unresolved', '2026-11-15T09:00:00Z'],
    [';VALUE=DATE:20261115', 'all-day', '2026-11-15T00:00:00Z'],
    [';TZID=America/Toronto:20260308T023000', 'instant', '2026-03-08T07:30:00Z'],
    [';TZID=America/Toronto:20261101T013000', 'instant', '2026-11-01T05:30:00Z'],
  ])('preserves the meaning of DTSTART%s', (start, kind, expected) => {
    const [event] = parseIcs(invitation(start, start));
    expect(event).toMatchObject({ start: { kind, date: new Date(expected) } });
  });
});
