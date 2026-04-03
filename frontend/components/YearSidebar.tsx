/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { DARK_BG, PANEL_BG, BORDER_COLOR, TEXT_MUTED, ACCENT } from '../constants/theme';

export interface YearSidebarProps {
  selectedYear: number | null;
  onSelectYear: (year: number | null) => void;
  onSelectAll: () => void;
  undergraduateCourses: Record<number, { code: string; label: string; fullName: string }[]>;
}

const YearSidebar: React.FC<YearSidebarProps> = ({
  selectedYear,
  onSelectYear,
  onSelectAll,
  undergraduateCourses,
}) => {
  return (
    <div
      className="flex flex-col p-3"
      style={{
        width: '160px',
        flexShrink: 0,
        background: PANEL_BG,
        borderRight: `1px solid ${BORDER_COLOR}`,
        border: `1px solid ${BORDER_COLOR}`,
        borderRadius: '0.75rem 0 0 0.75rem',
      }}
    >
      <div
        className="text-xs font-semibold tracking-widest uppercase mb-3"
        style={{ color: TEXT_MUTED }}
      >
        Undergraduate
      </div>
      {[1, 2, 3, 4].map(year => {
        const isActive = selectedYear === year;
        const courseCount = undergraduateCourses[year]?.length ?? 0;
        return (
          <button
            key={year}
            onClick={() => onSelectYear(selectedYear === year ? null : year)}
            className="w-full text-left rounded text-sm flex items-center justify-between"
            style={{
              padding: '0.5rem 0.75rem',
              background: isActive ? ACCENT : 'transparent',
              color: isActive ? DARK_BG : TEXT_MUTED,
              border: 'none',
              cursor: 'pointer',
              fontWeight: isActive ? 600 : 400,
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => {
              if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = BORDER_COLOR;
            }}
            onMouseLeave={e => {
              if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            <span>Year {year}</span>
            {courseCount > 0 && (
              <span
                style={{
                  fontSize: '0.65rem',
                  background: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(107,101,96,0.15)',
                  color: isActive ? DARK_BG : TEXT_MUTED,
                  borderRadius: '999px',
                  padding: '1px 6px',
                  fontWeight: 600,
                  minWidth: '18px',
                  textAlign: 'center',
                }}
              >
                {courseCount}
              </span>
            )}
          </button>
        );
      })}
      {/* Separator */}
      <div style={{ borderTop: `1px solid ${BORDER_COLOR}`, margin: '8px 0' }} />
      {/* All Courses */}
      <div
        onClick={onSelectAll}
        style={{
          padding: '6px 12px',
          borderRadius: '0.375rem',
          cursor: 'pointer',
          fontSize: '0.8rem',
          background: selectedYear === null ? ACCENT : 'transparent',
          color: selectedYear === null ? DARK_BG : TEXT_MUTED,
          fontWeight: selectedYear === null ? 600 : 400,
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { if (selectedYear !== null) (e.currentTarget as HTMLDivElement).style.background = BORDER_COLOR; }}
        onMouseLeave={e => { if (selectedYear !== null) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
      >
        All Courses
      </div>
    </div>
  );
};

export default YearSidebar;
