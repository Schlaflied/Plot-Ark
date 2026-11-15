/**
 * Synthetic Enterprise L&D demo programs.
 * All numbers below are fabricated for demonstration and must stay labelled as synthetic in the UI.
 */

export type EvalLevel = 1 | 2 | 3 | 4;
export type EvidenceSource = 'Content' | 'LMS report' | 'Learner pulse' | 'Manager follow-up';

export const EVAL_LEVELS: { level: EvalLevel; name: string; question: string }[] = [
  { level: 1, name: 'Reaction', question: 'Did learners find it relevant and engaging?' },
  { level: 2, name: 'Learning', question: 'Did learners acquire the knowledge or skill?' },
  { level: 3, name: 'Behavior', question: 'Are they applying it on the job?' },
  { level: 4, name: 'Results', question: 'Did team or business outcomes change?' },
];

export interface EvidenceCard {
  id: string;
  level: EvalLevel;
  source: EvidenceSource;
  title: string;
  detail: string;
}

export interface DemoProgram {
  id: 'compliance' | 'manager';
  name: string;
  subtitle: string;
  kind: string;
  purpose: string;
  /** Levels this program is expected to evidence, with a plain-language reason. */
  expectedLevels: EvalLevel[];
  levelRationale: string;
  summary: { label: string; value: string }[];
  coverageLabel: string;
  metrics: { label: string; value: string; note: string }[];
  diagnosis: {
    badges: [string, string];
    title: string;
    description: string;
    stats: [string, string][];
    insightTitle: string;
    insight: string;
  };
  evidence: EvidenceCard[];
}

export const DEMO_PROGRAMS: DemoProgram[] = [
  {
    id: 'compliance',
    name: 'Data Privacy & Security',
    subtitle: 'Annual compliance training · Cohort Q3',
    kind: 'Compliance',
    purpose: 'Compliance programs mostly exist so completion can be recorded.',
    expectedLevels: [1, 2],
    levelRationale:
      'Compliance training mainly needs a defensible record that people completed it and passed a knowledge check, so levels 1 and 2 are the expected evidence. Behavior and results (3–4) are optional here, so their gaps are not flagged as problems.',
    summary: [
      { label: 'Content', value: '1 SCORM package · 12 modules' },
      { label: 'Learning report', value: 'CSV · 248 learners' },
      { label: 'Pulse feedback', value: '162 responses' },
    ],
    coverageLabel: 'Evidence coverage · 82% · strong',
    metrics: [
      { label: 'Learners', value: '248', note: 'Across one Q3 cohort' },
      { label: 'Completion', value: '72%', note: '8 points below target' },
      { label: 'Median time', value: '34 min', note: 'Module 7 is 2.4× baseline' },
      { label: 'Content issues', value: '3', note: '1 high-confidence finding' },
    ],
    diagnosis: {
      badges: ['High friction', 'Evidence: strong'],
      title: 'Module 4 · Handling customer data',
      description: 'The scenario asks learners to apply a rule before the course explains it.',
      stats: [
        ['Question accuracy', '62%'],
        ['Unlocated difficulty', '26 learners'],
        ['Repeat attempts', '1.8× baseline'],
      ],
      insightTitle: 'Likely prerequisite gap',
      insight:
        '“Retention period” is required by the customer-data scenario, but the concept is introduced in the following section. Plot Ark treats this as a likely relationship—not proven causality.',
    },
    evidence: [
      { id: 'c1', level: 1, source: 'Learner pulse', title: 'Learner voice', detail: 'The dominant response is “I cannot locate what is unclear.” (162 responses)' },
      { id: 'c2', level: 2, source: 'LMS report', title: 'Observed behaviour in the course', detail: 'Accuracy drops to 62% at the matching checkpoint; repeat attempts 1.8× baseline.' },
      { id: 'c3', level: 2, source: 'Content', title: 'Course structure', detail: 'SCORM manifest places the retention rule after the scenario.' },
    ],
  },
  {
    id: 'manager',
    name: 'First-Year Manager Transition',
    subtitle: 'Leadership program · 4 instructor-led sessions + 8-week follow-up · Cohort Spring',
    kind: 'Leadership',
    purpose: 'Leadership programs exist to change outcomes, so measurement matters most here.',
    expectedLevels: [1, 2, 3, 4],
    levelRationale:
      'This program aims to change how new managers lead and what their teams achieve, so all four levels are expected. Levels with no evidence are flagged because the program cannot yet show whether it works.',
    summary: [
      { label: 'Content', value: '4 workshops · facilitator guide' },
      { label: 'Learning report', value: 'CSV · 36 managers' },
      { label: 'Follow-up', value: '21 manager check-ins' },
    ],
    coverageLabel: 'Evidence coverage · 3 of 4 levels',
    metrics: [
      { label: 'Managers', value: '36', note: 'One Spring cohort' },
      { label: 'Session attendance', value: '88%', note: '4 sessions, 144 seats' },
      { label: 'Follow-up response', value: '58%', note: '21 of 36 check-ins returned' },
      { label: 'Levels with evidence', value: '3 / 4', note: 'No level 4 results yet' },
    ],
    diagnosis: {
      badges: ['Behavior gap', 'Evidence: partial'],
      title: 'Session 3 · Giving feedback in 1:1s',
      description: 'Managers rate the session highly, but follow-up shows few apply the feedback model.',
      stats: [
        ['Session rating', '4.5 / 5'],
        ['Applied in 1:1s', '9 of 21 managers'],
        ['Team outcome data', 'Not collected'],
      ],
      insightTitle: 'Reaction is strong; transfer is uncertain',
      insight:
        'High satisfaction does not show that behavior changed. Manager follow-up gives early level 3 evidence, but no team results (level 4) are connected yet, so impact cannot be claimed.',
    },
    evidence: [
      { id: 'm1', level: 1, source: 'Learner pulse', title: 'Session ratings', detail: 'Average 4.5 / 5 across four sessions; “practice with peers” is the most cited strength.' },
      { id: 'm2', level: 2, source: 'LMS report', title: 'Scenario assessment', detail: '81% passed the post-session feedback-conversation scenario.' },
      { id: 'm3', level: 2, source: 'Content', title: 'Facilitator guide alignment', detail: 'Session 3 objectives map to the assessment, but no practice step precedes it.' },
      { id: 'm4', level: 3, source: 'Manager follow-up', title: '8-week check-in', detail: '9 of 21 respondents report using the feedback model in regular 1:1s.' },
    ],
  },
];
