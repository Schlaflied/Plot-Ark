/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { DARK_BG, PANEL_BG, BORDER_COLOR, TEXT_MUTED, ACCENT } from '../constants/theme';

const STUDENT_FILTERS = [
  { key: 'mastered',        label: 'Mastered',        color: '#22c55e', bg: '#052e16' },
  { key: 'learning',        label: 'Learning',        color: '#eab308', bg: '#1c1408' },
  { key: 'struggling',      label: 'Struggling',      color: '#f97316', bg: '#1c0a00' },
  { key: 'no_data',         label: 'No data',         color: '#9ca3af', bg: '#1c1917' },
  { key: 'exam_focus',      label: 'Exam focus',      color: '#F4737A', bg: '#2d0a0b' },
  { key: 'confused',        label: 'Confused',        color: '#ef4444', bg: '#1c0000' },
] as const;

const PROFESSOR_FILTERS = [
  { key: 'confused',        label: 'Confused',        color: '#ef4444', bg: '#1c0000' },
  { key: 'high_confusion',  label: 'High confusion',  color: '#b91c1c', bg: '#2d0000' },
  { key: 'exam_focus',      label: 'Exam focus',      color: '#F4737A', bg: '#2d0a0b' },
] as const;

export type FilterKey =
  typeof STUDENT_FILTERS[number]['key'] |
  typeof PROFESSOR_FILTERS[number]['key'];

export interface YearSidebarProps {
  selectedYear: number | null;
  onSelectYear: (year: number | null) => void;
  onSelectAll: () => void;
  undergraduateCourses: Record<number, { code: string; label: string; fullName: string }[]>;
  activeFilters: Set<FilterKey>;
  onToggleFilter: (key: FilterKey) => void;
  role?: 'student' | 'professor';
}

const YearSidebar: React.FC<YearSidebarProps> = ({
  selectedYear,
  onSelectYear,
  onSelectAll,
  undergraduateCourses,
  activeFilters,
  onToggleFilter,
  role = 'student',
}) => {
  const filterOptions = role === 'professor'
    ? [...STUDENT_FILTERS, { key: 'high_confusion', label: 'High confusion', color: '#b91c1c', bg: '#2d0000' } as const]
    : STUDENT_FILTERS;
  return (
    <div
      className="flex flex-col p-3"
      style={{
        width: '170px',
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

      {/* Filter section */}
      <div style={{ borderTop: `1px solid ${BORDER_COLOR}`, margin: '10px 0 6px' }} />
      <div className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: TEXT_MUTED }}>
        Filter
      </div>
      <div className="flex flex-col gap-1">
        {filterOptions.map(({ key, label, color, bg }) => {
          const isActive = activeFilters.has(key);
          return (
            <button
              key={key}
              onClick={() => onToggleFilter(key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '4px 8px',
                borderRadius: '6px',
                border: `1px solid ${isActive ? color : 'transparent'}`,
                background: isActive ? bg : 'transparent',
                color: isActive ? color : TEXT_MUTED,
                fontSize: '0.75rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
                width: '100%',
              }}
            >
              <span style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: key === 'exam_focus' ? 'transparent' : color,
                border: key === 'exam_focus' ? `2px solid ${color}` : 'none',
                flexShrink: 0,
              }} />
              {label}
            </button>
          );
        })}
        {activeFilters.size > 0 && (
          <button
            onClick={() => filterOptions.forEach(f => activeFilters.has(f.key) && onToggleFilter(f.key))}
            style={{
              marginTop: '4px',
              padding: '3px 8px',
              borderRadius: '6px',
              border: `1px solid ${BORDER_COLOR}`,
              background: 'transparent',
              color: TEXT_MUTED,
              fontSize: '0.7rem',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
};

export default YearSidebar;
