'use client';

import type { IcsEvent } from '@/lib/calendar/ics-parser';
import { formatTimetable } from '@/lib/calendar/timetable';
import { Clock, MapPin, ChevronDown, ChevronUp, Video } from 'lucide-react';
import { useMemo, useState } from 'react';

const HOUR_HEIGHT = 54;

interface CalendarEventTimetableProps {
  event: IcsEvent;
  timeZone: string;
}

export function CalendarEventTimetable({ event, timeZone }: CalendarEventTimetableProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const { label, grid } = useMemo(() => formatTimetable(event, timeZone), [event, timeZone]);

  return (
    <div className="my-3 border border-gray-200 rounded-lg bg-white shadow-xs overflow-hidden">
      <div className="bg-gray-50/80 px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-gray-700 min-w-0">
          <div className="flex items-start gap-2 text-gray-800 font-medium">
            <Clock className="mt-0.5 size-4 text-gray-500 shrink-0" />
            <span className="wrap-anywhere">{label}</span>
          </div>
          {!grid && <span className="font-semibold text-gray-900">{event.summary}</span>}

          {event.location && (
            <div className="flex items-center gap-1.5 text-gray-600 truncate">
              <MapPin className="size-4 text-gray-400 shrink-0" />
              <span className="truncate">{event.location}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {event.meetingUrl && (
            <a
              href={event.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100"
            >
              <Video className="size-3.5" />
              Join Meeting
            </a>
          )}
          {grid && (
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={() => setIsExpanded((expanded) => !expanded)}
              className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-200/60 hover:text-gray-700"
              title={isExpanded ? 'Collapse calendar view' : 'Expand calendar view'}
            >
              {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
          )}
        </div>
      </div>

      {isExpanded && grid && (
        <div className="p-4 bg-white">
          <div
            className="relative flex overflow-hidden rounded border border-gray-200"
            style={{ height: grid.height * HOUR_HEIGHT }}
          >
            <div className="relative w-14 shrink-0 select-none border-r border-gray-200 bg-gray-50/40 sm:w-16">
              {grid.ticks.map((tick, index) => (
                <div
                  key={index}
                  className="absolute right-2.5 text-right text-[11px] font-medium text-gray-500"
                  style={{ top: index * HOUR_HEIGHT }}
                >
                  <span>{tick.label}</span>
                  {tick.offset && <span className="block text-[10px]">{tick.offset}</span>}
                </div>
              ))}
            </div>

            <div className="relative flex-1 overflow-hidden bg-white">
              {grid.ticks.map((_, index) => {
                const top = index * HOUR_HEIGHT;
                const half = top + HOUR_HEIGHT / 2;
                return (
                  <div key={index}>
                    <div className="absolute inset-x-0 border-b border-gray-200" style={{ top }} />
                    {half < grid.height * HOUR_HEIGHT && (
                      <div
                        className="absolute inset-x-0 border-b border-dashed border-gray-200"
                        style={{ top: half }}
                      />
                    )}
                  </div>
                );
              })}

              <div
                className="absolute inset-x-1 flex overflow-hidden rounded border border-dashed border-sky-400 bg-sky-100/90 text-sky-950 shadow-2xs hover:bg-sky-100 sm:inset-x-2"
                style={{
                  top: grid.start * HOUR_HEIGHT,
                  height: grid.duration * HOUR_HEIGHT,
                  minHeight: '32px',
                }}
              >
                <div
                  className="h-full w-2.5 shrink-0 rounded-l border-r border-sky-400/40"
                  style={{
                    background: 'repeating-linear-gradient(45deg, #0284c7, #0284c7 4px, #38bdf8 4px, #38bdf8 8px)',
                  }}
                />

                <div className="min-w-0 flex-1 select-text overflow-hidden p-1.5 text-xs leading-snug sm:p-2">
                  <span className="font-semibold">{event.summary}</span>
                  {event.location && <span className="text-sky-900">; {event.location}</span>}
                  {event.organizerName && <span className="text-sky-900">; {event.organizerName}</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
