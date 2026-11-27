'use client';

import { type IcsEvent, parseIcs, parseMeetingFromEmail } from '@/lib/calendar/ics-parser';
import { useUIStore } from '@/stores/uiStore';
import { CalendarEventTimetable } from './CalendarEventTimetable';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Loader2 } from 'lucide-react';
import moment from 'moment-timezone';

const timeZoneOptions = moment.tz.names().map((id) => {
  const parts = id.replace(/_/g, ' ').split('/');
  const city = parts.pop();
  return { id, label: parts.length ? `${city} (${parts.join('/')})` : id };
}).sort((a, b) => a.label.localeCompare(b.label, 'en'));

function getDeviceTimeZone() {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return detected && moment.tz.zone(detected) ? detected : 'UTC';
}

function subscribeToDeviceTimeZone(onChange: () => void) {
  window.addEventListener('focus', onChange);
  document.addEventListener('visibilitychange', onChange);
  return () => {
    window.removeEventListener('focus', onChange);
    document.removeEventListener('visibilitychange', onChange);
  };
}

interface CalendarEventSectionProps {
  attachments?: Array<{
    id: string;
    filename?: string | null;
    contentType?: string | null;
    sizeBytes?: number | null;
  }>;
  inlineIcsContent?: string | null;
  defaultSubject?: string | null;
  selectedAccountId: string | null;
  emailId: string;
  email?: Parameters<typeof parseMeetingFromEmail>[0];
}

export function CalendarEventSection({
  attachments,
  inlineIcsContent,
  defaultSubject,
  selectedAccountId,
  emailId,
  email,
}: CalendarEventSectionProps) {
  const [events, setEvents] = useState<IcsEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const preferredTimeZone = useUIStore((state) => state.calendarTimeZone);
  const setCalendarTimeZone = useUIStore((state) => state.setCalendarTimeZone);
  const deviceTimeZone = useSyncExternalStore(subscribeToDeviceTimeZone, getDeviceTimeZone, () => 'UTC');
  const manualTimeZone = preferredTimeZone && moment.tz.zone(preferredTimeZone) ? preferredTimeZone : '';

  useEffect(() => {
    let isCancelled = false;

    async function loadCalendarEvents() {
      setIsLoading(true);
      const parsedEvents: IcsEvent[] = [];
      let attachmentRetrievalFailed = false;

      try {
        // 1. Process inline ICS content if present
        if (inlineIcsContent) {
          const parsed = parseIcs(inlineIcsContent);
          parsedEvents.push(...parsed);
        }

        // 2. Process calendar attachments if present
        if (attachments && attachments.length > 0 && selectedAccountId && emailId) {
          for (const att of attachments) {
            const downloadUrl = `/api/accounts/${selectedAccountId}/emails/${emailId}/attachments/${att.id}`;
            const res = await fetch(downloadUrl);
            if (!res.ok) {
              attachmentRetrievalFailed = true;
              break;
            }

            const icsText = await res.text();
            const parsed = parseIcs(icsText);
            parsedEvents.push(...parsed);
          }
        }

        // 3. Fallback: Parse meeting details from email body/headers if no ICS events loaded
        if (!attachmentRetrievalFailed && parsedEvents.length === 0 && email) {
          const fallbackEvent = parseMeetingFromEmail(email);
          if (fallbackEvent) {
            parsedEvents.push(fallbackEvent);
          }
        }
      } catch (err) {
        console.error('Failed to load calendar events:', err);
        if (attachments && attachments.length > 0) {
          attachmentRetrievalFailed = true;
        }
      }

      if (!isCancelled) {
        if (attachmentRetrievalFailed) {
          setEvents([]);
          setIsLoading(false);
          return;
        }

        // Apply default subject if summary is generic or untitled
        const finalEvents = parsedEvents.map(ev => {
          if ((!ev.summary || ev.summary === 'Untitled Event') && defaultSubject) {
            return { ...ev, summary: defaultSubject };
          }
          return ev;
        });

        setEvents(finalEvents);
        setIsLoading(false);
      }
    }

    loadCalendarEvents();

    return () => {
      isCancelled = true;
    };
  }, [attachments, inlineIcsContent, defaultSubject, selectedAccountId, emailId, email]);

  if (isLoading) {
    return (
      <div className="px-6 py-3 border-b border-gray-100 flex items-center space-x-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
        <span>Loading calendar event details...</span>
      </div>
    );
  }

  if (events.length === 0) {
    return null;
  }

  return (
    <div className="px-6 py-2 border-b border-gray-100 flex-shrink-0 bg-gray-50/30">
      <label className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
        <span>Calendar time zone</span>
        <select
          className="min-w-0 max-w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800"
          value={manualTimeZone}
          onChange={(event) => setCalendarTimeZone(event.target.value)}
        >
          <option value="">Follow device ({deviceTimeZone})</option>
          {timeZoneOptions.map(({ id, label }) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
      </label>
      {events.map((ev, idx) => (
        <CalendarEventTimetable key={idx} event={ev} timeZone={manualTimeZone || deviceTimeZone} />
      ))}
    </div>
  );
}
