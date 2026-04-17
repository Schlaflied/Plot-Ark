/**
 * Shared form option constants for the GeneratePage.
 */

export interface GroupedOption {
  value: string;
  label: string;
  group: string;
  desc?: string;
}

export const LEVEL_GROUPS = [
  'Undergraduate',
  'Graduate',
  'ESL/EFL',
  'K-12',
  'Professional',
] as const;

export const LEVELS: GroupedOption[] = [
  // ── Undergraduate ──
  { value: 'undergraduate-year-1', label: 'Undergraduate Year 1', group: 'Undergraduate' },
  { value: 'undergraduate-year-2', label: 'Undergraduate Year 2', group: 'Undergraduate' },
  { value: 'undergraduate-year-3', label: 'Undergraduate Year 3', group: 'Undergraduate' },
  { value: 'undergraduate-year-4', label: 'Undergraduate Year 4', group: 'Undergraduate' },
  // ── Graduate ──
  { value: 'master-year-1', label: "Master's Year 1", group: 'Graduate' },
  { value: 'master-year-2', label: "Master's Year 2", group: 'Graduate' },
  { value: 'doctoral', label: 'Doctoral', group: 'Graduate' },
  // ── ESL/EFL ──
  { value: 'esl-beginner', label: 'ESL/EFL — Beginner (CLB 1-4)', group: 'ESL/EFL' },
  { value: 'esl-intermediate', label: 'ESL/EFL — Intermediate (CLB 5-7)', group: 'ESL/EFL' },
  { value: 'esl-advanced', label: 'ESL/EFL — Advanced (CLB 8+)', group: 'ESL/EFL' },
  // ── K-12 ──
  { value: 'k12-elementary', label: 'K-12 Elementary', group: 'K-12' },
  { value: 'k12-middle', label: 'K-12 Middle School', group: 'K-12' },
  { value: 'k12-highschool', label: 'K-12 High School', group: 'K-12' },
  // ── Professional ──
  { value: 'professional-beginner', label: 'Beginner', group: 'Professional' },
  { value: 'professional-intermediate', label: 'Intermediate', group: 'Professional' },
  { value: 'professional-advanced', label: 'Advanced', group: 'Professional' },
  // ── Other ──
  { value: 'other-custom', label: 'Other / Custom', group: '' },
];

export const COURSE_TYPES = [
  { value: 'mixed', label: 'Mixed Formats' },
  { value: 'project', label: 'Project-Based' },
  { value: 'essay', label: 'Essay-Based' },
  { value: 'debate', label: 'Discussion / Debate' },
  { value: 'lab', label: 'Lab / Simulation' },
];

export const DESIGN_APPROACHES = [
  { value: 'addie', label: 'ADDIE — Linear (Analysis → Design → Development → Implementation → Evaluation)' },
  { value: 'sam', label: 'SAM — Iterative (Rapid Prototype → Evaluate → Revise)' },
];

export const SESSION_DURATIONS = [
  { value: 75, label: '75 min (1.25 hrs)' },
  { value: 90, label: '90 min (1.5 hrs)' },
  { value: 180, label: '3 hours' },
];

export const MODULE_PRESETS = [4, 6, 8, 10, 12];

export const SEMESTER_TERMS = [
  { value: 'Fall', label: 'Fall' },
  { value: 'Winter', label: 'Winter' },
  { value: 'Summer', label: 'Summer' },
];
