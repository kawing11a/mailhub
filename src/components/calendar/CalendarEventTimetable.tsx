'use client';

import { IcsEvent } from '@/lib/calendar/ics-parser';
import { format } from 'date-fns';
import { Clock, MapPin, ChevronDown, ChevronUp, Video, Calendar, User } from 'lucide-react';
import { useMemo, useState } from 'react';

interface CalendarEventTimetableProps {
  event: IcsEvent;
}

export function CalendarEventTimetable({ event }: CalendarEventTimetableProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Format date header: "Wednesday, July 29, 2026 3:00 PM-3:30 PM"
  const formattedDate = useMemo(() => {
    try {
      const dayStr = format(event.startDate, 'EEEE, MMMM d, yyyy');
      const startStr = format(event.startDate, 'h:mm a');
      const endStr = format(event.endDate, 'h:mm a');
      return `${dayStr} ${startStr}-${endStr}`;
    } catch {
      return 'Calendar Event';
    }
  }, [event.startDate, event.endDate]);

  // Timetable grid layout calculation
  const { hours, startHour, topOffset, blockHeight } = useMemo(() => {
    const startH = event.startDate.getHours();
    const endH = event.endDate.getHours();

    // Display range: 1 hour before start hour, up to 1-2 hours after end hour
    const startHour = Math.max(0, startH - 1);
    const endHour = Math.min(23, Math.max(endH + 1, startHour + 2));

    const hoursArr: number[] = [];
    for (let h = startHour; h <= endHour; h++) {
      hoursArr.push(h);
    }

    const HOUR_HEIGHT = 54; // px height per hour in timetable

    const startMinutesFromBase = (startH - startHour) * 60 + event.startDate.getMinutes();
    const topPx = (startMinutesFromBase / 60) * HOUR_HEIGHT;

    const durationMinutes = Math.max(15, (event.endDate.getTime() - event.startDate.getTime()) / (1000 * 60));
    const heightPx = (durationMinutes / 60) * HOUR_HEIGHT;

    return {
      hours: hoursArr,
      startHour,
      topOffset: topPx,
      blockHeight: heightPx,
    };
  }, [event.startDate, event.endDate]);

  const HOUR_HEIGHT = 54;
  const gridTotalHeight = hours.length * HOUR_HEIGHT;

  return (
    <div className="my-3 border border-gray-200 rounded-lg bg-white shadow-xs overflow-hidden">
      {/* Header Bar */}
      <div className="bg-gray-50/80 px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-gray-700 font-normal min-w-0">
          <div className="flex items-center space-x-2 text-gray-800 font-medium">
            <Clock className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="truncate">{formattedDate}</span>
          </div>

          {event.location && (
            <div className="flex items-center space-x-1.5 text-gray-600 truncate">
              <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="truncate">{event.location}</span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2 flex-shrink-0">
          {event.meetingUrl && (
            <a
              href={event.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded hover:bg-sky-100 transition-colors"
            >
              <Video className="w-3.5 h-3.5 mr-1" />
              Join Meeting
            </a>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-200/60 rounded transition-colors"
            title={isExpanded ? 'Collapse calendar view' : 'Expand calendar view'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Timetable View */}
      {isExpanded && (
        <div className="p-4 bg-white">
          <div className="border border-gray-200 rounded overflow-hidden flex bg-white relative">
            {/* Left Hour Scale */}
            <div className="w-14 sm:w-16 border-r border-gray-200 bg-gray-50/40 select-none flex-shrink-0 relative">
              {hours.map((h) => {
                const labelDate = new Date(2000, 0, 1, h, 0, 0);
                const labelStr = format(labelDate, 'h a');
                return (
                  <div
                    key={h}
                    className="absolute right-2.5 text-[11px] font-medium text-gray-500 -mt-2"
                    style={{ top: `${(h - startHour) * HOUR_HEIGHT}px` }}
                  >
                    {labelStr}
                  </div>
                );
              })}
              {/* Extra height spacer */}
              <div style={{ height: `${gridTotalHeight}px` }} />
            </div>

            {/* Timetable Grid Area */}
            <div className="flex-1 relative overflow-hidden bg-white" style={{ height: `${gridTotalHeight}px` }}>
              {/* Grid Lines */}
              {hours.map((h, i) => {
                const topPx = i * HOUR_HEIGHT;
                const halfTopPx = topPx + HOUR_HEIGHT / 2;
                return (
                  <div key={h}>
                    {/* Hour line (solid) */}
                    <div
                      className="absolute left-0 right-0 border-b border-gray-200"
                      style={{ top: `${topPx}px` }}
                    />
                    {/* Half-hour line (dotted) */}
                    {i < hours.length - 1 && (
                      <div
                        className="absolute left-0 right-0 border-b border-dashed border-gray-200"
                        style={{ top: `${halfTopPx}px` }}
                      />
                    )}
                  </div>
                );
              })}

              {/* Event Card (Matching image design) */}
              <div
                className="absolute left-1 right-1 sm:left-2 sm:right-2 rounded border border-dashed border-sky-400 bg-sky-100/90 text-sky-950 flex shadow-2xs overflow-hidden transition-all hover:bg-sky-100"
                style={{
                  top: `${topOffset}px`,
                  height: `${blockHeight}px`,
                  minHeight: '32px',
                }}
              >
                {/* Left accent bar with diagonal blue stripes */}
                <div
                  className="w-2.5 h-full flex-shrink-0 rounded-l border-r border-sky-400/40"
                  style={{
                    background: 'repeating-linear-gradient(45deg, #0284c7, #0284c7 4px, #38bdf8 4px, #38bdf8 8px)',
                  }}
                />

                {/* Content Inside Event Card */}
                <div className="p-1.5 sm:p-2 flex-1 min-w-0 overflow-hidden text-xs leading-snug font-sans select-text">
                  <div className="font-semibold text-sky-950 inline">
                    {event.summary}
                  </div>
                  {event.location && (
                    <span className="text-sky-900 font-normal">
                      ; {event.location}
                    </span>
                  )}
                  {event.organizerName && (
                    <span className="text-sky-900 font-normal">
                      ; {event.organizerName}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
