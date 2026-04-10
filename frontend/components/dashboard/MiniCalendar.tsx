/**
 * MiniCalendar — A compact monthly calendar widget
 *
 * Extracted from CoursesPage.tsx. Zero props, self-contained.
 */

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MiniCalendar: React.FC = () => {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  // First weekday of the month (0=Sun)
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  // Total days in month
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const isToday = (day: number) =>
    day === today.getDate() &&
    viewMonth === today.getMonth() &&
    viewYear === today.getFullYear();

  const cells: (number | null)[] = [
    ...Array(firstDayOfMonth).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={prevMonth}
          className="p-0.5 text-stone-400 hover:text-stone-700 transition-colors rounded"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-semibold text-stone-600">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          className="p-0.5 text-stone-400 hover:text-stone-700 transition-colors rounded"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0.5 text-center mb-0.5">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className="text-[10px] text-stone-400 font-medium">{d}</span>
        ))}
      </div>

      {/* Date grid */}
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {cells.map((day, i) => (
          <span
            key={i}
            className={`text-[11px] py-0.5 rounded-full leading-5 ${
              day === null
                ? ''
                : isToday(day)
                  ? 'bg-amber-400 text-white font-bold'
                  : 'text-stone-500 hover:bg-stone-100 cursor-pointer'
            }`}
          >
            {day ?? ''}
          </span>
        ))}
      </div>
    </div>
  );
};

export default MiniCalendar;
