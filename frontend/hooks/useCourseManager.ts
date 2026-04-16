/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { slugify } from '../constants/theme';

export interface CourseEntry {
  code: string;
  label: string;
  fullName: string;
}

interface UseCourseManagerOptions {
  initialCourseCode?: string;
  initialCourseTopic?: string;
  setSelectedYear: (year: number | null) => void;
  setActiveSubject: (subject: string) => void;
}

const DEFAULT_COURSES: Record<number, CourseEntry[]> = {
  1: [
    { code: 'acct-101', label: 'ACCT 101', fullName: 'Introduction to Financial Accounting' },
    { code: 'econ-101', label: 'ECON 101', fullName: 'Introduction to Microeconomics' },
    { code: 'bus-101', label: 'BUS 101', fullName: 'Foundations of Business' },
    { code: 'mgmt-101', label: 'MGMT 101', fullName: 'Principles of Management' },
    { code: 'hr-101', label: 'HR 101', fullName: 'Human Resources Fundamentals' },
  ],
  2: [
    { code: 'business-law', label: 'Business Law', fullName: 'Business Law and Ethics' },
    { code: 'info-201', label: 'INFO 201', fullName: 'Information Systems' },
    { code: 'acct-201', label: 'ACCT 201', fullName: 'Intermediate Accounting' },
    { code: 'econ-201', label: 'ECON 201', fullName: 'Macroeconomics' },
  ],
  3: [
    { code: 'supply-301', label: 'Supply Chain 301', fullName: 'Supply Chain Management' },
    { code: 'employ-301', label: 'Employment Law 301', fullName: 'Employment Law' },
    { code: 'organizational-behavior', label: 'MGMT 301', fullName: 'Organizational Behavior' },
  ],
  4: [
    { code: 'nego-401', label: 'Negotiation 401', fullName: 'Negotiation and Conflict Resolution' },
    { code: 'ihrm-401', label: 'IHRM 401', fullName: 'International Human Resource Management' },
    { code: 'call', label: 'CALL', fullName: 'Computer-Assisted Language Learning' },
  ],
};

const DEFAULT_TABS = [
  { key: 'all', label: 'All' },
  { key: 'business-law', label: 'Business Law' },
  { key: 'call', label: 'CALL' },
  { key: 'organizational-behavior', label: 'Organizational Behavior' },
];

// Bump this when DEFAULT_COURSES or DEFAULT_TABS change to clear stale localStorage
const SCHEMA_VERSION = 2;

export function useCourseManager({
  initialCourseCode,
  initialCourseTopic,
  setSelectedYear,
  setActiveSubject,
}: UseCourseManagerOptions) {
  // ---- Invalidate stale localStorage when schema version bumps ----
  if (typeof window !== 'undefined') {
    const storedVersion = Number(localStorage.getItem('plot_ark_schema_version') || '0');
    if (storedVersion < SCHEMA_VERSION) {
      localStorage.removeItem('plot_ark_undergraduate_courses');
      localStorage.removeItem('plot_ark_subject_tabs');
      localStorage.setItem('plot_ark_schema_version', String(SCHEMA_VERSION));
    }
  }

  // ---- Undergraduate course data ----
  const [undergraduateCourses, setUndergraduateCourses] = useState<Record<number, CourseEntry[]>>(() => {
    try {
      const stored = localStorage.getItem('plot_ark_undergraduate_courses');
      if (stored) return JSON.parse(stored);
    } catch {}
    return DEFAULT_COURSES;
  });

  // ---- Dynamic subject tabs ----
  const [subjectTabs, setSubjectTabs] = useState<{ key: string; label: string }[]>(() => {
    try {
      const stored = localStorage.getItem('plot_ark_subject_tabs');
      if (stored) return JSON.parse(stored);
    } catch {}
    return DEFAULT_TABS;
  });

  // ---- Tab editing ----
  const [addingTab, setAddingTab] = useState(false);
  const [newTabName, setNewTabName] = useState('');

  // ---- Course editing ----
  const [editingCourseKey, setEditingCourseKey] = useState<string | null>(null);
  const [courseNameInput, setCourseNameInput] = useState('');
  const [editingFullName, setEditingFullName] = useState(false);
  const [fullNameInput, setFullNameInput] = useState('');
  const [addingCourseYear, setAddingCourseYear] = useState<number | null>(null);
  const [newCourseInput, setNewCourseInput] = useState('');

  // ---- Course search ----
  const [courseSearch, setCourseSearch] = useState('');
  const [courseSearchResults, setCourseSearchResults] = useState<{ year: number; code: string; label: string; fullName: string }[]>([]);
  const courseSearchRef = useRef<HTMLDivElement>(null);
  const [courseSearchOpen, setCourseSearchOpen] = useState(false);

  // ---- DnD refs ----
  const dragTabIndex = useRef<number | null>(null);
  const [dragOverTabIndex, setDragOverTabIndex] = useState<number | null>(null);
  const dragCoursePillIndex = useRef<number | null>(null);

  // ---- Persist to localStorage ----
  useEffect(() => {
    try { localStorage.setItem('plot_ark_undergraduate_courses', JSON.stringify(undergraduateCourses)); } catch {}
  }, [undergraduateCourses]);

  useEffect(() => {
    try { localStorage.setItem('plot_ark_subject_tabs', JSON.stringify(subjectTabs)); } catch {}
  }, [subjectTabs]);

  // ---- Auto-select course from navigation props ----
  useEffect(() => {
    if (!initialCourseCode && !initialCourseTopic) return;
    try {
      const stored = localStorage.getItem('plot_ark_undergraduate_courses');
      if (!stored) return;
      const courses: Record<number, CourseEntry[]> = JSON.parse(stored);
      for (const [yearStr, yearCourses] of Object.entries(courses)) {
        for (const course of yearCourses) {
          const matchByCode = initialCourseCode && course.label?.toLowerCase() === initialCourseCode.toLowerCase();
          const matchByTopic = initialCourseTopic && course.fullName?.toLowerCase() === initialCourseTopic.toLowerCase();
          if (matchByCode || matchByTopic) {
            setSelectedYear(Number(yearStr));
            setActiveSubject(course.code);
            return;
          }
        }
      }
    } catch {}
  }, []);

  // ---- Click-outside: close course search dropdown ----
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (courseSearchRef.current && !courseSearchRef.current.contains(e.target as Node)) {
        setCourseSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ---- Tab helpers ----
  const confirmAddTab = () => {
    const trimmed = newTabName.trim();
    if (!trimmed) { setAddingTab(false); setNewTabName(''); return; }
    const key = slugify(trimmed);
    if (!subjectTabs.find(t => t.key === key)) {
      setSubjectTabs(prev => [...prev, { key, label: trimmed }]);
    }
    setNewTabName('');
    setAddingTab(false);
  };

  // ---- Course search ----
  const handleCourseSearch = (query: string) => {
    setCourseSearch(query);
    if (!query.trim()) {
      setCourseSearchResults([]);
      setCourseSearchOpen(false);
      return;
    }
    const q = query.toLowerCase();
    const results: { year: number; code: string; label: string; fullName: string }[] = [];
    Object.entries(undergraduateCourses).forEach(([year, courses]) => {
      courses.forEach(course => {
        if (course.label.toLowerCase().includes(q) || course.code.toLowerCase().includes(q)) {
          results.push({ year: Number(year), code: course.code, label: course.label, fullName: course.fullName });
        }
      });
    });
    setCourseSearchResults(results);
    setCourseSearchOpen(results.length > 0);
  };

  const selectCourseResult = (result: { year: number; code: string; label: string; fullName: string }) => {
    setSelectedYear(result.year);
    setActiveSubject(result.code);
    setCourseSearch('');
    setCourseSearchResults([]);
    setCourseSearchOpen(false);
  };

  // ---- Convenience: register course from ingest completion ----
  const addCourse = (tabKey: string, tabLabel: string, year: number, fullName: string) => {
    setSubjectTabs(prev => {
      if (prev.find(t => t.key === tabKey)) return prev;
      return [...prev, { key: tabKey, label: tabLabel }];
    });
    setUndergraduateCourses(prev => {
      const yearCourses = prev[year] ?? [];
      if (yearCourses.find(c => c.code === tabKey)) return prev;
      return { ...prev, [year]: [...yearCourses, { code: tabKey, label: tabLabel, fullName }] };
    });
  };

  return {
    undergraduateCourses, setUndergraduateCourses,
    subjectTabs, setSubjectTabs,
    addingTab, setAddingTab,
    newTabName, setNewTabName,
    confirmAddTab,
    editingCourseKey, setEditingCourseKey,
    courseNameInput, setCourseNameInput,
    editingFullName, setEditingFullName,
    fullNameInput, setFullNameInput,
    addingCourseYear, setAddingCourseYear,
    newCourseInput, setNewCourseInput,
    courseSearch, courseSearchResults, courseSearchRef,
    courseSearchOpen, setCourseSearchOpen,
    handleCourseSearch, selectCourseResult,
    dragTabIndex, dragOverTabIndex, setDragOverTabIndex,
    dragCoursePillIndex,
    addCourse,
  };
}
