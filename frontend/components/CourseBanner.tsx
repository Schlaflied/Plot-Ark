/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { DARK_BG, PANEL_BG, BORDER_COLOR, TEXT_PRIMARY, TEXT_MUTED, ACCENT } from '../constants/theme';
import type { CourseEntry } from '../hooks/useCourseManager';

export interface CourseBannerProps {
  selectedYear: number;
  activeSubject: string;
  setActiveSubject: (s: string) => void;
  undergraduateCourses: Record<number, CourseEntry[]>;
  setUndergraduateCourses: React.Dispatch<React.SetStateAction<Record<number, CourseEntry[]>>>;
  editingCourseKey: string | null;
  setEditingCourseKey: (v: string | null) => void;
  courseNameInput: string;
  setCourseNameInput: (v: string) => void;
  addingCourseYear: number | null;
  setAddingCourseYear: (v: number | null) => void;
  newCourseInput: string;
  setNewCourseInput: (v: string) => void;
  dragCoursePillIndex: React.MutableRefObject<number | null>;
  setSelectedYear: (v: number | null) => void;
}

const CourseBanner: React.FC<CourseBannerProps> = ({
  selectedYear, activeSubject, setActiveSubject,
  undergraduateCourses, setUndergraduateCourses,
  editingCourseKey, setEditingCourseKey,
  courseNameInput, setCourseNameInput,
  addingCourseYear, setAddingCourseYear,
  newCourseInput, setNewCourseInput,
  dragCoursePillIndex, setSelectedYear,
}) => {
  const activeCourse = undergraduateCourses[selectedYear]?.find(c => c.code === activeSubject);

  return (
    <>
      {/* Course pills bar */}
      <div
        className="flex items-center gap-2"
        style={{ borderBottom: `1px solid ${BORDER_COLOR}`, background: PANEL_BG, padding: '8px 16px', overflowX: 'auto', flexShrink: 0 }}
      >
        <span className="text-xs font-semibold shrink-0" style={{ color: TEXT_MUTED }}>Year {selectedYear}:</span>
        <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
          {undergraduateCourses[selectedYear]?.map((course, idx) => {
            const isCoursActive = activeSubject === course.code;
            const isEditing = editingCourseKey === course.code;
            return (
              <div
                key={course.code}
                className="relative group flex-shrink-0"
                draggable={true}
                onDragStart={e => { dragCoursePillIndex.current = idx; e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                onDrop={e => { e.preventDefault(); if (dragCoursePillIndex.current === null || dragCoursePillIndex.current === idx) return; setUndergraduateCourses(prev => { const next = { ...prev }; const arr = [...(next[selectedYear] || [])]; const [moved] = arr.splice(dragCoursePillIndex.current!, 1); arr.splice(idx, 0, moved); next[selectedYear] = arr; dragCoursePillIndex.current = null; return next; }); }}
                onDragEnd={() => { dragCoursePillIndex.current = null; }}
                style={{ cursor: 'grab', userSelect: 'none' }}
              >
                {isEditing ? (
                  <input
                    autoFocus type="text" value={courseNameInput}
                    onChange={e => setCourseNameInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const trimmed = courseNameInput.trim();
                        if (trimmed) setUndergraduateCourses(prev => ({ ...prev, [selectedYear]: prev[selectedYear].map(c => c.code === course.code ? { ...c, label: trimmed } : c) }));
                        setEditingCourseKey(null); setCourseNameInput('');
                      }
                      if (e.key === 'Escape') { setEditingCourseKey(null); setCourseNameInput(''); }
                    }}
                    onBlur={() => {
                      const trimmed = courseNameInput.trim();
                      if (trimmed) setUndergraduateCourses(prev => ({ ...prev, [selectedYear]: prev[selectedYear].map(c => c.code === course.code ? { ...c, label: trimmed } : c) }));
                      setEditingCourseKey(null); setCourseNameInput('');
                    }}
                    style={{ background: DARK_BG, border: `1px solid ${ACCENT}`, color: TEXT_PRIMARY, borderRadius: '999px', padding: '2px 10px', fontSize: '0.75rem', outline: 'none', width: '110px' }}
                  />
                ) : (
                  <>
                    <button
                      onClick={() => setActiveSubject(course.code)}
                      className="text-xs rounded-full shrink-0"
                      style={{
                        padding: '3px 12px',
                        background: isCoursActive ? ACCENT : 'transparent',
                        color: isCoursActive ? DARK_BG : TEXT_MUTED,
                        border: `1px solid ${isCoursActive ? ACCENT : BORDER_COLOR}`,
                        cursor: 'pointer', fontWeight: isCoursActive ? 600 : 400,
                        transition: 'background 0.15s, color 0.15s, border-color 0.15s', whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={e => { if (!isCoursActive) (e.currentTarget as HTMLButtonElement).style.background = BORDER_COLOR; }}
                      onMouseLeave={e => { if (!isCoursActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                    >
                      {course.label}
                    </button>
                    <span className="absolute -top-1.5 -right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ zIndex: 5 }}>
                      <button title="Rename" onClick={e => { e.stopPropagation(); setEditingCourseKey(course.code); setCourseNameInput(course.label); }}
                        style={{ background: PANEL_BG, border: `1px solid ${BORDER_COLOR}`, borderRadius: '50%', width: '16px', height: '16px', fontSize: '0.55rem', cursor: 'pointer', color: TEXT_MUTED, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                        <span style={{ transform: 'scaleX(-1)', display: 'inline-block' }}>✎</span>
                      </button>
                      <button title="Delete" onClick={e => { e.stopPropagation(); setUndergraduateCourses(prev => ({ ...prev, [selectedYear]: prev[selectedYear].filter(c => c.code !== course.code) })); if (activeSubject === course.code) setActiveSubject('all'); }}
                        style={{ background: PANEL_BG, border: `1px solid ${BORDER_COLOR}`, borderRadius: '50%', width: '16px', height: '16px', fontSize: '0.6rem', cursor: 'pointer', color: TEXT_MUTED, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                        ×
                      </button>
                    </span>
                  </>
                )}
              </div>
            );
          })}
          {addingCourseYear === selectedYear ? (
            <input autoFocus type="text" value={newCourseInput} onChange={e => setNewCourseInput(e.target.value)}
              onBlur={() => {
                const trimmed = newCourseInput.trim();
                if (trimmed) { const code = trimmed.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''); setUndergraduateCourses(prev => ({ ...prev, [selectedYear]: [...(prev[selectedYear] ?? []), { code, label: trimmed, fullName: '' }] })); setActiveSubject(code); }
                setAddingCourseYear(null); setNewCourseInput('');
              }}
              onKeyDown={e => { if (e.key === 'Escape') { setAddingCourseYear(null); setNewCourseInput(''); } }}
              placeholder="Course code…"
              style={{ background: DARK_BG, border: `1px dashed ${ACCENT}`, color: TEXT_PRIMARY, borderRadius: '999px', padding: '2px 10px', fontSize: '0.75rem', outline: 'none', width: '110px', flexShrink: 0 }}
            />
          ) : (
            <button onClick={() => setAddingCourseYear(selectedYear)} title="Add course"
              style={{ background: 'none', border: `1px dashed ${BORDER_COLOR}`, color: TEXT_MUTED, borderRadius: '999px', padding: '2px 8px', fontSize: '0.75rem', cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>+</button>
          )}
        </div>
        <div className="flex-1" />
        <button onClick={() => setSelectedYear(null)} className="text-xs shrink-0" style={{ background: 'none', border: 'none', color: TEXT_MUTED, cursor: 'pointer', padding: '3px 8px' }}>✕ Clear</button>
      </div>

      {/* Full name tag strip */}
      {activeCourse && (
        <div style={{ background: PANEL_BG, borderBottom: `1px solid ${BORDER_COLOR}`, padding: '6px 16px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <input type="text" value={activeCourse.fullName} placeholder="Enter course full name..."
            onChange={e => { const val = e.target.value; setUndergraduateCourses(prev => ({ ...prev, [selectedYear]: prev[selectedYear].map(c => c.code === activeCourse.code ? { ...c, fullName: val } : c) })); }}
            style={{ background: DARK_BG, border: `1px solid ${BORDER_COLOR}`, color: TEXT_PRIMARY, borderRadius: '999px', padding: '3px 12px', fontSize: '0.8rem', outline: 'none', width: '320px' }}
          />
        </div>
      )}
    </>
  );
};

export default CourseBanner;
