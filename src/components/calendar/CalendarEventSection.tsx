'use client';

import { IcsEvent, parseIcs, parseMeetingFromEmail } from '@/lib/calendar/ics-parser';
import { CalendarEventTimetable } from './CalendarEventTimetable';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

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
  email?: any;
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

  useEffect(() => {
    let isCancelled = false;

    async function loadCalendarEvents() {
      setIsLoading(true);
      const parsedEvents: IcsEvent[] = [];

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
            if (res.ok) {
              const icsText = await res.text();
              const parsed = parseIcs(icsText);
              parsedEvents.push(...parsed);
            }
          }
        }

        // 3. Fallback: Parse meeting details from email body/headers if no ICS events loaded
        if (parsedEvents.length === 0 && email) {
          const fallbackEvent = parseMeetingFromEmail(email);
          if (fallbackEvent) {
            parsedEvents.push(fallbackEvent);
          }
        }
      } catch (err) {
        console.error('Failed to load calendar events:', err);
      }

      if (!isCancelled) {
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
      {events.map((ev, idx) => (
        <CalendarEventTimetable key={idx} event={ev} />
      ))}
    </div>
  );
}
