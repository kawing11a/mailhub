import { renderToStaticMarkup } from 'react-dom/server';
import { CalendarEventTimetable } from '@/components/calendar/CalendarEventTimetable';
import { parseIcs } from '@/lib/calendar/ics-parser';

function renderInvitation(start: string, end: string, timeZone: string) {
  const [event] = parseIcs(`BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Planning
DTSTART${start}
DTEND${end}
END:VEVENT
END:VCALENDAR`);
  return renderToStaticMarkup(<CalendarEventTimetable event={event} timeZone={timeZone} />);
}

describe('Calendar timetable', () => {
  it.each([
    ['America/Vancouver', '9:00 AM', '8 AM', 'UTC-07:00'],
    ['America/Los_Angeles', '8:00 AM', '7 AM', 'UTC-08:00'],
  ])('uses %s for the header and hour grid', (zone, time, tick, offset) => {
    const html = renderInvitation(':20261115T160000Z', ':20261115T170000Z', zone);

    expect(html).toContain(`Sunday, November 15, 2026 ${time}`);
    expect(html).toContain(`>${tick}<`);
    expect(html).toContain(`${zone} · ${offset}`);
  });

  it('shows the end date when the chosen display zone moves the end to the next day', () => {
    const html = renderInvitation(':20261115T140000Z', ':20261115T160000Z', 'Asia/Tokyo');

    expect(html).toContain('Sunday, November 15, 2026 11:00 PM');
    expect(html).toContain('Monday, November 16, 2026 1:00 AM');
  });

  it('keeps the invited dates for an all-day event, with an exclusive end date', () => {
    const html = renderInvitation(';VALUE=DATE:20261115', ';VALUE=DATE:20261117', 'America/Vancouver');

    expect(html).toContain('Sunday, November 15, 2026 – Monday, November 16, 2026 (All day)');
    expect(html).not.toContain('Collapse calendar view');
  });

  it('shows the original local time and flags an unrecognized TZID', () => {
    const html = renderInvitation(
      ';TZID=Custom/Unknown:20261115T090000',
      ';TZID=Custom/Unknown:20261115T100000',
      'Asia/Tokyo',
    );

    expect(html).toContain('9:00 AM – 10:00 AM');
    expect(html).toContain('Time zone unconfirmed: Custom/Unknown');
  });

  it('keeps both occurrences of the repeated hour on the time axis', () => {
    const html = renderInvitation(':20261101T053000Z', ':20261101T063000Z', 'America/Toronto');

    expect(html.match(/>1 AM</g)).toHaveLength(2);
    expect(html).toContain('UTC-04:00');
    expect(html).toContain('UTC-05:00');
  });
});
