/**
 * StudentProfilePage — Student-facing profile & progress page.
 * Mirrors the professor SettingsPage layout (sidebar + content).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, User, BarChart3, Check, Camera, Settings2, ChevronDown, Sparkles, Plus, Trash2, Star, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type SidebarSection = 'profile' | 'progress' | 'narrative' | 'ai-settings';

interface StudentProfile {
  email: string;
  display_name: string;
  preferred_style: string;
  discipline: string;
  avatar_url: string;
  custom_prompt: string;
}

interface PersonaGroup {
  name: string;
  char_1: string;
  char_1_desc: string;
  char_2: string;
  char_2_desc: string;
  fandom: string;
  relationship_tags: string[];
  course_tags: string[];
}

interface PersonaSets {
  enabled: boolean;
  groups: PersonaGroup[];
  default_group: number;
}

interface CourseProgress {
  id: number;
  topic: string;
  course_code: string;
  module_count: number;
  module_mastery: Record<string, string>;
}

// ─── Mastery color mapping ────────────────────────────────────────────────────

const MASTERY_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  mastered:    { bg: 'bg-green-400',  border: 'border-green-500',  label: 'Mastered' },
  learning:    { bg: 'bg-yellow-400', border: 'border-yellow-500', label: 'Learning' },
  struggling:  { bg: 'bg-orange-400', border: 'border-orange-500', label: 'Needs review' },
  not_started: { bg: 'bg-stone-200',  border: 'border-stone-300',  label: 'Not started' },
};

const DISCIPLINES = [
  { value: 'humanities', label: 'Humanities', emoji: '📜', hint: 'Law, Philosophy, Literature, History' },
  { value: 'stem',       label: 'STEM',       emoji: '🔬', hint: 'Math, Physics, CS, Engineering' },
  { value: 'business',   label: 'Business',   emoji: '📊', hint: 'Finance, Marketing, Management' },
  { value: 'social',     label: 'Social Sci.', emoji: '🧠', hint: 'Psychology, Sociology, Poli Sci' },
  { value: 'arts',       label: 'Arts & Design', emoji: '🎨', hint: 'Fine Arts, Music, Architecture' },
];

const DISCIPLINE_EXAMPLES: Record<string, { concept: string; analogy: string; steps: string; narrative: string; stepsLabel?: string; stepsDesc?: string }> = {
  humanities: {
    concept: 'Contract Law',
    analogy: '"A contract is like a promise you pinky-swear on — but with lawyers watching."',
    steps: '"1. Offer → 2. Acceptance → 3. Consideration → 4. Binding contract."',
    narrative: '"Alex offered to sell her car for $5k. Ben said yes and paid — now there\'s a contract."',
  },
  stem: {
    concept: 'Newton\'s Second Law',
    analogy: '"F = ma is like pushing a shopping cart — the harder you push, the faster it goes, but a full cart resists more."',
    steps: '"1. Identify all forces → 2. Sum as vectors → 3. Apply F = ma → 4. Solve for unknowns."',
    stepsLabel: 'Derivation',
    stepsDesc: 'Learn through proofs, formulas, and logical derivation',
    narrative: '"A rocket engineer needs to launch a 10-ton satellite — she starts with F = ma to calculate the required thrust."',
  },
  business: {
    concept: 'Supply & Demand',
    analogy: '"Supply and demand is like a seesaw — when one side goes up, the other tilts down until they balance."',
    steps: '"1. Plot demand curve → 2. Plot supply curve → 3. Find intersection → 4. That\'s equilibrium price."',
    narrative: '"When a coffee shop raises latte prices by $1, they notice 20% fewer orders — the demand curve in action."',
  },
  social: {
    concept: 'Cognitive Dissonance',
    analogy: '"Cognitive dissonance is like wearing mismatched shoes — your brain keeps nagging you to fix the inconsistency."',
    steps: '"1. Hold belief A → 2. Encounter contradicting evidence B → 3. Feel discomfort → 4. Adjust belief or rationalize."',
    narrative: '"Sam believes smoking is bad but can\'t quit. To reduce the mental tension, he tells himself \'my grandpa smoked and lived to 90.\'"',
  },
  arts: {
    concept: 'Color Theory',
    analogy: '"Complementary colors are like musical harmonies — opposites that create something richer together."',
    steps: '"1. Primary colors → 2. Mix to get secondaries → 3. Identify complements on the wheel → 4. Apply contrast."',
    narrative: '"A designer choosing a poster palette picks orange and blue — opposites on the wheel — creating visual tension that draws the eye."',
  },
};

const STYLE_BASE = [
  { value: 'analogy',    label: 'Analogies',    emoji: '🌉', desc: 'Learn through comparisons with familiar things' },
  { value: 'steps',      label: 'Step-by-step', emoji: '📝', desc: 'Learn through structured, numbered breakdowns' },
  { value: 'narrative',  label: 'Stories',       emoji: '📖', desc: 'Learn through scenarios and narratives' },
];

// ─── Profile Section ──────────────────────────────────────────────────────────

const ProfileSection: React.FC<{
  profile: StudentProfile;
  onSave: (updates: Partial<StudentProfile>) => Promise<void>;
}> = ({ profile, onSave }) => {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [selectedStyle, setSelectedStyle] = useState(profile.preferred_style);
  const [discipline, setDiscipline] = useState(profile.discipline || 'humanities');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isInitialMount = useRef(true);

  // Sync when profile prop changes (initial load)
  useEffect(() => {
    setDisplayName(profile.display_name);
    setSelectedStyle(profile.preferred_style);
    setDiscipline(profile.discipline || 'humanities');
    setAvatarUrl(profile.avatar_url);
    isInitialMount.current = true;
  }, [profile]);

  // ── Auto-save helper ──────────────────────────────────────────────────────
  const doSave = useCallback(async (updates: Partial<StudentProfile>) => {
    setSaveStatus('saving');
    await onSave(updates);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 1500);
  }, [onSave]);

  // Debounced auto-save for display name (800ms after typing stops)
  useEffect(() => {
    if (isInitialMount.current) { isInitialMount.current = false; return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSave({ display_name: displayName, preferred_style: selectedStyle, discipline, avatar_url: avatarUrl });
    }, 800);
    return () => clearTimeout(debounceRef.current);
  }, [displayName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Immediate save for style selection
  const handleStyleChange = (value: string) => {
    const newStyle = selectedStyle === value ? '' : value;
    setSelectedStyle(newStyle);
    clearTimeout(debounceRef.current);
    doSave({ display_name: displayName, preferred_style: newStyle, discipline, avatar_url: avatarUrl });
  };

  // Immediate save for discipline selection
  const handleDisciplineChange = (value: string) => {
    setDiscipline(value);
    clearTimeout(debounceRef.current);
    doSave({ display_name: displayName, preferred_style: selectedStyle, discipline: value, avatar_url: avatarUrl });
  };

  // Immediate save for avatar upload — resize to 512×512 for crisp display
  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5 MB');
      return;
    }

    const img = new Image();
    img.onload = () => {
      // Center-crop to square, then resize to 512×512
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      // Enable high-quality scaling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Calculate center crop (square)
      const srcSize = Math.min(img.width, img.height);
      const sx = (img.width - srcSize) / 2;
      const sy = (img.height - srcSize) / 2;

      ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, size, size);

      const dataUrl = canvas.toDataURL('image/png');
      setAvatarUrl(dataUrl);
      clearTimeout(debounceRef.current);
      doSave({ display_name: displayName, preferred_style: selectedStyle, discipline, avatar_url: dataUrl });
    };

    // Read file → img element → canvas
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result as string; };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-serif font-semibold text-stone-900 mb-1">Your Profile</h2>
          <p className="text-sm text-stone-400">
            Personalize your Plot Ark experience.
          </p>
        </div>
        {/* Auto-save indicator */}
        <span className={`text-xs font-medium transition-all duration-300 ${
          saveStatus === 'saving' ? 'text-amber-500' :
          saveStatus === 'saved' ? 'text-green-500' : 'text-transparent'
        }`}>
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : '·'}
        </span>
      </div>

      {/* Identity card */}
      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-8 space-y-8">
        {/* Avatar + email */}
        <div className="flex items-center gap-5">
          {/* Clickable avatar */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative group shrink-0"
            title="Change avatar"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                className="w-20 h-20 rounded-full object-cover shadow-sm border-2 border-stone-100"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white text-2xl font-bold shadow-sm">
                {(displayName || profile.email || '?')[0].toUpperCase()}
              </div>
            )}
            {/* Camera overlay */}
            <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-all">
              <Camera size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </button>
          <div>
            <p className="text-base font-semibold text-stone-900">
              {displayName || 'Student'}
            </p>
            <p className="text-sm text-stone-400">{profile.email}</p>
          </div>
        </div>

        {/* Display name */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="How should we call you?"
            className="w-full text-sm bg-stone-50 border border-stone-200 rounded-lg px-4 py-3 text-stone-800 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400 transition"
          />
        </div>

        {/* Discipline selector */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">
            Your Discipline
          </label>
          <p className="text-xs text-stone-400">
            This helps us show relevant examples and tailor content style.
          </p>
          <div className="flex flex-wrap gap-2">
            {DISCIPLINES.map(d => {
              const active = discipline === d.value;
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => handleDisciplineChange(d.value)}
                  title={d.hint}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium transition-all ${
                    active
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  <span>{d.emoji}</span>
                  <span>{d.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Learning style */}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">
              Preferred Learning Style
            </label>
            <p className="text-sm text-stone-400 mt-1">
              Choose how you prefer concepts to be explained. Here's how each style would explain <span className="font-medium text-stone-600">{DISCIPLINE_EXAMPLES[discipline]?.concept || 'a concept'}</span>:
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {STYLE_BASE.map(opt => {
              const active = selectedStyle === opt.value;
              const ex = DISCIPLINE_EXAMPLES[discipline] || DISCIPLINE_EXAMPLES.humanities;
              const example = opt.value === 'analogy' ? ex.analogy : opt.value === 'steps' ? ex.steps : ex.narrative;
              // STEM overrides for step-by-step
              const label = opt.value === 'steps' && ex.stepsLabel ? ex.stepsLabel : opt.label;
              const desc = opt.value === 'steps' && ex.stepsDesc ? ex.stepsDesc : opt.desc;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleStyleChange(opt.value)}
                  className={`relative flex flex-col items-center gap-2.5 p-5 rounded-xl border-2 transition-all text-center ${
                    active
                      ? 'border-amber-400 bg-amber-50 shadow-md'
                      : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'
                  }`}
                >
                  {active && (
                    <span className="absolute top-2.5 right-2.5">
                      <Check size={16} className="text-amber-500" />
                    </span>
                  )}
                  <span className="text-3xl">{opt.emoji}</span>
                  <span className={`text-sm font-semibold ${active ? 'text-amber-700' : 'text-stone-700'}`}>
                    {label}
                  </span>
                  <span className="text-xs text-stone-400 leading-relaxed">{desc}</span>
                  {/* Concrete example */}
                  <span className={`text-[11px] leading-snug mt-1 italic ${
                    active ? 'text-amber-600/80' : 'text-stone-400/70'
                  }`}>
                    {example}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Progress Section ─────────────────────────────────────────────────────────

const ProgressSection: React.FC<{ courses: CourseProgress[] }> = ({ courses }) => (
  <div className="space-y-6">
    <div>
      <h2 className="text-lg font-serif font-semibold text-stone-900 mb-1">My Courses</h2>
      <p className="text-xs text-stone-400">
        Your learning progress across all enrolled courses.
      </p>
    </div>

    {courses.length === 0 ? (
      <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-10 flex flex-col items-center justify-center gap-3 text-center">
        <span className="text-3xl">📚</span>
        <p className="text-sm font-medium text-stone-500">No courses yet</p>
        <p className="text-xs text-stone-400 max-w-xs">
          Start interacting with a course — submit feedback or explore the Knowledge Graph —
          and it will appear here.
        </p>
      </div>
    ) : (
      <div className="space-y-4">
        {courses.map(course => {
          const moduleCount = course.module_count || 12;
          const blocks = Array.from({ length: moduleCount }, (_, i) => {
            const key = `module_${i + 1}`;
            return course.module_mastery[key] || 'not_started';
          });

          return (
            <Link
              key={course.id}
              to={`/course/${course.id}`}
              className="block bg-white border border-stone-200 rounded-xl shadow-sm p-5 hover:border-amber-300 hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-stone-900 group-hover:text-amber-700 transition-colors">
                    {course.topic}
                  </h3>
                  {course.course_code && (
                    <p className="text-xs text-stone-400 mt-0.5">{course.course_code}</p>
                  )}
                </div>
                <span className="text-xs text-stone-400">{moduleCount} modules</span>
              </div>

              {/* Module color blocks */}
              <div className="flex gap-1">
                {blocks.map((level, i) => {
                  const color = MASTERY_COLORS[level] || MASTERY_COLORS.not_started;
                  return (
                    <div
                      key={i}
                      title={`Module ${i + 1}: ${color.label}`}
                      className={`flex-1 h-3 rounded-sm ${color.bg} transition-colors`}
                    />
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex gap-4 mt-3">
                {Object.entries(MASTERY_COLORS).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-sm ${val.bg}`} />
                    <span className="text-[10px] text-stone-400">{val.label}</span>
                  </div>
                ))}
              </div>
            </Link>
          );
        })}
      </div>
    )}
  </div>
);

// ─── Narrative Settings Section ───────────────────────────────────────────────

const GENDER_OPTIONS = ['Male', 'Female', 'Nonbinary'] as const;

// ─── Custom Gender Dropdown (matches syllabus Select style) ───────────────────

const GenderSelect: React.FC<{
  value: string;
  onChange: (v: string) => void;
}> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`
          w-full flex items-center justify-between gap-2
          bg-white border rounded-xl px-4 py-2.5 text-sm text-left
          outline-none transition-all cursor-pointer
          ${open
            ? 'border-amber-400 ring-2 ring-amber-200/60 shadow-sm'
            : 'border-stone-200 hover:border-stone-300'
          }
        `}
      >
        <span className="text-stone-800">{value}</span>
        <ChevronDown
          size={16}
          className={`text-stone-400 transition-transform duration-200 flex-shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="
          absolute z-50 left-0 right-0 mt-1.5
          bg-white border border-stone-200 rounded-xl
          shadow-lg shadow-stone-900/8
          overflow-hidden py-1.5
        ">
          {GENDER_OPTIONS.map(g => {
            const isSelected = g === value;
            return (
              <button
                key={g}
                type="button"
                onClick={() => handleSelect(g)}
                className={`
                  w-full text-left px-4 py-2.5 text-sm transition-colors
                  flex items-center gap-2
                  ${isSelected
                    ? 'bg-amber-50 text-amber-800 font-medium'
                    : 'text-stone-700 hover:bg-stone-50'
                  }
                `}
              >
                {isSelected && (
                  <span className="w-0.5 h-5 rounded-full bg-amber-500 -ml-1 mr-1 flex-shrink-0" />
                )}
                <span className="flex-1">{g}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const RELATIONSHIP_TAG_PRESETS = [
  { label: 'Trust', value: 'trust' },
  { label: 'Protection', value: 'protection' },
  { label: 'Power imbalance', value: 'power-imbalance' },
  { label: 'Rivalry', value: 'rivalry' },
  { label: 'Game theory', value: 'game-theory' },
  { label: 'Collaboration', value: 'collaboration' },
  { label: 'Commitment', value: 'commitment' },
  { label: 'Dependency', value: 'dependency' },
  { label: 'Mentorship', value: 'mentorship' },
  { label: 'Sacrifice', value: 'sacrifice' },
];

const DEFAULT_GROUP: PersonaGroup = {
  name: 'Main CP',
  char_1: '',
  char_1_desc: '',
  char_2: '',
  char_2_desc: '',
  fandom: '',
  relationship_tags: [],
  course_tags: [],
};

const DEFAULT_PERSONA: PersonaSets = {
  enabled: true,
  groups: [{ ...DEFAULT_GROUP }],
  default_group: 0,
};

/**
 * Migrate old PersonaSets format (characters array) to new multi-group format.
 */
function migratePersonaSets(raw: any): PersonaSets {
  if (!raw || typeof raw !== 'object') return DEFAULT_PERSONA;
  // Already new format
  if (Array.isArray(raw.groups)) return raw as PersonaSets;
  // Old format: { enabled, fandom, characters: [{ description, gender }] }
  if (Array.isArray(raw.characters)) {
    return {
      enabled: raw.enabled ?? true,
      groups: [{
        name: 'Main CP',
        char_1: raw.characters[0]?.description || '',
        char_1_desc: '',
        char_2: raw.characters[1]?.description || '',
        char_2_desc: '',
        fandom: raw.fandom || '',
        relationship_tags: [],
        course_tags: [],
      }],
      default_group: 0,
    };
  }
  return DEFAULT_PERSONA;
}

// ─── Linked Courses Multi-Select Dropdown ─────────────────────────────────────

const LinkedCoursesSelect: React.FC<{
  allCourses: { id: number; course_code: string; topic: string }[];
  selected: string[];
  onChange: (tags: string[]) => void;
}> = ({ allCourses, selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleCourse = (topic: string) => {
    const next = selected.includes(topic)
      ? selected.filter(t => t !== topic)
      : [...selected, topic];
    onChange(next);
  };

  const label = selected.length === 0
    ? 'All Courses'
    : selected.length === 1
      ? selected[0]
      : `${selected.length} courses selected`;

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
        Linked Courses <span className="text-stone-300 font-normal">(optional)</span>
      </label>
      <p className="text-xs text-stone-400">
        Which courses should use this group? Leave empty to use for all courses.
      </p>

      <div ref={wrapperRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`
            w-full flex items-center justify-between gap-2
            bg-white border rounded-xl px-4 py-2.5 text-sm text-left
            outline-none transition-all cursor-pointer
            ${open
              ? 'border-amber-400 ring-2 ring-amber-200/60 shadow-sm'
              : 'border-stone-200 hover:border-stone-300'
            }
          `}
        >
          <span className={selected.length === 0 ? 'text-stone-400' : 'text-stone-800'}>
            {label}
          </span>
          <ChevronDown
            size={16}
            className={`text-stone-400 transition-transform duration-200 flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && (
          <div className="
            absolute z-50 left-0 right-0 mt-1.5
            bg-white border border-stone-200 rounded-xl
            shadow-lg shadow-stone-900/8
            overflow-hidden py-1.5
            max-h-56 overflow-y-auto
          ">
            {allCourses.length === 0 ? (
              <p className="px-4 py-3 text-xs text-stone-400 text-center">No courses found</p>
            ) : (
              allCourses.map(course => {
                const isSelected = selected.includes(course.topic);
                return (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => toggleCourse(course.topic)}
                    className={`
                      w-full text-left px-4 py-2.5 text-sm transition-colors
                      flex items-center gap-2.5
                      ${isSelected
                        ? 'bg-amber-50 text-amber-800'
                        : 'text-stone-700 hover:bg-stone-50'
                      }
                    `}
                  >
                    <span className={`
                      w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all
                      ${isSelected
                        ? 'bg-amber-500 border-amber-500'
                        : 'border-stone-300'
                      }
                    `}>
                      {isSelected && <Check size={10} className="text-white" />}
                    </span>
                    <span className="flex-1 truncate">{course.topic}</span>
                    {course.course_code && (
                      <span className="text-[10px] text-stone-400 shrink-0">{course.course_code}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Selected course pills */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {selected.map((ct, ci) => (
            <span key={ci} className="inline-flex items-center gap-1 text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-full px-2.5 py-1">
              {ct}
              <button
                type="button"
                onClick={() => onChange(selected.filter((_, i) => i !== ci))}
                className="text-amber-400 hover:text-amber-600 transition-colors"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const NarrativeSettingsSection: React.FC<{
  personaSets: PersonaSets;
  onSave: (ps: PersonaSets) => void;
  allCourses: { id: number; course_code: string; topic: string }[];
}> = ({ personaSets, onSave, allCourses }) => {
  const [data, setData] = useState<PersonaSets>(personaSets);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isInit = useRef(true);

  useEffect(() => {
    setData(personaSets);
    isInit.current = true;
  }, [personaSets]);

  const doSave = useCallback((updated: PersonaSets) => {
    setSaveStatus('saving');
    onSave(updated);
    setTimeout(() => setSaveStatus('saved'), 300);
    setTimeout(() => setSaveStatus('idle'), 1800);
  }, [onSave]);

  // Debounced auto-save for text fields
  useEffect(() => {
    if (isInit.current) { isInit.current = false; return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSave(data), 800);
    return () => clearTimeout(debounceRef.current);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateGroup = (idx: number, field: keyof PersonaGroup, value: any) => {
    setData(prev => {
      const groups = [...prev.groups];
      groups[idx] = { ...groups[idx], [field]: value };
      return { ...prev, groups };
    });
  };

  const toggleTag = (groupIdx: number, tag: string) => {
    setData(prev => {
      const groups = [...prev.groups];
      const tags = [...groups[groupIdx].relationship_tags];
      const i = tags.indexOf(tag);
      if (i >= 0) tags.splice(i, 1); else tags.push(tag);
      groups[groupIdx] = { ...groups[groupIdx], relationship_tags: tags };
      return { ...prev, groups };
    });
  };

  const addGroup = () => {
    setData(prev => ({
      ...prev,
      groups: [...prev.groups, { ...DEFAULT_GROUP, name: `Group ${prev.groups.length + 1}` }],
    }));
  };

  const removeGroup = (idx: number) => {
    if (data.groups.length <= 1) return;
    setData(prev => {
      const groups = prev.groups.filter((_, i) => i !== idx);
      const newDefault = prev.default_group >= groups.length ? 0 :
        prev.default_group > idx ? prev.default_group - 1 : prev.default_group;
      return { ...prev, groups, default_group: newDefault };
    });
  };

  const setDefault = (idx: number) => {
    const updated = { ...data, default_group: idx };
    setData(updated);
    clearTimeout(debounceRef.current);
    doSave(updated);
  };

  const handleToggle = () => {
    const updated = { ...data, enabled: !data.enabled };
    setData(updated);
    clearTimeout(debounceRef.current);
    doSave(updated);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-serif font-semibold text-stone-900 mb-1">CP / OC Narrative</h2>
          <p className="text-sm text-stone-400">
            Define character groups for narrative-style learning. Different groups can anchor different types of concepts.
          </p>
        </div>
        <span className={`text-xs font-medium transition-all duration-300 ${
          saveStatus === 'saving' ? 'text-amber-500' :
          saveStatus === 'saved' ? 'text-green-500' : 'text-transparent'
        }`}>
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : '·'}
        </span>
      </div>

      {/* Master toggle */}
      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-stone-800">Enable CP/OC Narrative Mode</p>
            <p className="text-xs text-stone-400 mt-0.5">
              Learning content will use your characters as semantic anchors for concept explanations.
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggle}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              data.enabled ? 'bg-amber-500' : 'bg-stone-300'
            }`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
              data.enabled ? 'left-[22px]' : 'left-0.5'
            }`} />
          </button>
        </div>
      </div>

      {/* Persona groups — only shown when enabled */}
      {data.enabled && (
        <div className="space-y-5">
          {data.groups.map((group, gi) => {
            const isDefault = gi === data.default_group;
            return (
              <div
                key={gi}
                className={`bg-white border rounded-2xl shadow-sm transition-all ${
                  isDefault ? 'border-amber-300 ring-1 ring-amber-200/50' : 'border-stone-200'
                }`}
              >
                {/* Group header */}
                <div className={`px-6 py-4 flex items-center gap-3 border-b rounded-t-2xl overflow-hidden ${
                  isDefault ? 'bg-amber-50/50 border-amber-200' : 'bg-stone-50/50 border-stone-100'
                }`}>
                  <input
                    type="text"
                    value={group.name}
                    onChange={e => updateGroup(gi, 'name', e.target.value)}
                    className="text-sm font-semibold text-stone-800 bg-transparent border-none outline-none flex-1 min-w-0 placeholder:text-stone-300"
                    placeholder="Group name..."
                  />
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setDefault(gi)}
                      title={isDefault ? 'Default group' : 'Set as default'}
                      className={`p-1.5 rounded-lg transition-all ${
                        isDefault
                          ? 'text-amber-500 bg-amber-100'
                          : 'text-stone-300 hover:text-amber-400 hover:bg-stone-100'
                      }`}
                    >
                      <Star size={14} fill={isDefault ? 'currentColor' : 'none'} />
                    </button>
                    {data.groups.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeGroup(gi)}
                        title="Remove group"
                        className="p-1.5 rounded-lg text-stone-300 hover:text-red-400 hover:bg-red-50 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {/* Characters side by side */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Character 1</label>
                        <input
                          type="text"
                          value={group.char_1}
                          onChange={e => updateGroup(gi, 'char_1', e.target.value)}
                          placeholder="e.g. Ash Lynx"
                          className="w-full text-sm bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-stone-800 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400 transition"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-stone-400 uppercase tracking-wider">Personality</label>
                        <textarea
                          value={group.char_1_desc}
                          onChange={e => updateGroup(gi, 'char_1_desc', e.target.value)}
                          placeholder="Brief personality so the AI stays in character, e.g. cold exterior, fiercely protective, genius-level IQ"
                          rows={2}
                          className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-stone-700 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400 transition resize-y leading-relaxed"
                        />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Character 2</label>
                        <input
                          type="text"
                          value={group.char_2}
                          onChange={e => updateGroup(gi, 'char_2', e.target.value)}
                          placeholder="e.g. Eiji Okumura"
                          className="w-full text-sm bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-stone-800 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400 transition"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-stone-400 uppercase tracking-wider">Personality</label>
                        <textarea
                          value={group.char_2_desc}
                          onChange={e => updateGroup(gi, 'char_2_desc', e.target.value)}
                          placeholder="e.g. gentle, emotionally steady, sees the best in people"
                          rows={2}
                          className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-stone-700 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400 transition resize-y leading-relaxed"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Fandom */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                      Fandom <span className="text-stone-300 font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={group.fandom}
                      onChange={e => updateGroup(gi, 'fandom', e.target.value)}
                      placeholder="e.g. Banana Fish, Genshin Impact, Original"
                      className="w-full text-sm bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-stone-800 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400 transition"
                    />
                  </div>

                  {/* Relationship tags */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                      Relationship Tags
                    </label>
                    <p className="text-xs text-stone-400">
                      How do these characters relate? The AI uses these tags to match concepts — click to toggle.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {RELATIONSHIP_TAG_PRESETS.map(tag => {
                        const active = group.relationship_tags.includes(tag.value);
                        return (
                          <button
                            key={tag.value}
                            type="button"
                            onClick={() => toggleTag(gi, tag.value)}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                              active
                                ? 'bg-amber-100 border-amber-300 text-amber-800 font-medium shadow-sm'
                                : 'bg-stone-50 border-stone-200 text-stone-500 hover:border-amber-200 hover:bg-amber-50'
                            }`}
                          >
                            {active && <span className="mr-1">✓</span>}
                            {tag.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Linked Courses dropdown */}
                  <LinkedCoursesSelect
                    allCourses={allCourses}
                    selected={group.course_tags || []}
                    onChange={tags => updateGroup(gi, 'course_tags', tags)}
                  />
                </div>
              </div>
            );
          })}

          {/* Add group button */}
          <button
            type="button"
            onClick={addGroup}
            className="w-full flex items-center justify-center gap-2 py-3.5 border-2 border-dashed border-stone-300 rounded-2xl text-sm text-stone-400 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50/50 transition-all"
          >
            <Plus size={16} />
            Add another character group
          </button>
        </div>
      )}
    </div>
  );
};

// ─── AI Settings Section ─────────────────────────────────────────────────────────

const AI_PROMPT_EXAMPLES = [
  '“Please explain things concisely — I prefer short, clear paragraphs over long explanations.”',
  '“I\'m a visual learner. When possible, describe things using spatial or visual metaphors.”',
  '“用中文解释概念，但保留英文术语。”',
  '“Relate concepts to real-world software engineering scenarios when you can.”',
];

const AISettingsSection: React.FC<{
  customPrompt: string;
  onSave: (prompt: string) => void;
}> = ({ customPrompt, onSave }) => {
  const [prompt, setPrompt] = useState(customPrompt);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isInit = useRef(true);

  useEffect(() => {
    setPrompt(customPrompt);
    isInit.current = true;
  }, [customPrompt]);

  useEffect(() => {
    if (isInit.current) { isInit.current = false; return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSaveStatus('saving');
      onSave(prompt);
      setTimeout(() => setSaveStatus('saved'), 300);
      setTimeout(() => setSaveStatus('idle'), 1800);
    }, 800);
    return () => clearTimeout(debounceRef.current);
  }, [prompt]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-serif font-semibold text-stone-900 mb-1">AI Settings</h2>
          <p className="text-sm text-stone-400">
            Customize how the AI generates and explains content for you.
          </p>
        </div>
        <span className={`text-xs font-medium transition-all duration-300 ${
          saveStatus === 'saving' ? 'text-amber-500' :
          saveStatus === 'saved' ? 'text-green-500' : 'text-transparent'
        }`}>
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : '·'}
        </span>
      </div>

      {/* Custom Instructions */}
      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={16} className="text-amber-500" />
            <p className="text-sm font-semibold text-stone-800">Custom Instructions</p>
          </div>
          <p className="text-xs text-stone-400 leading-relaxed">
            Tell the AI what you’d like it to keep in mind when generating or explaining content.
            This message will be included in every AI interaction.
          </p>
        </div>

        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="e.g. I prefer concise explanations with real-world examples. Use analogies from gaming or sports when possible."
          rows={6}
          className="w-full text-sm bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-stone-800 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400 transition resize-y leading-relaxed"
        />

        <div className="text-xs text-stone-400">
          <span className="font-medium text-stone-500">Ideas</span>
          <span className="text-stone-300 ml-1">— click to add</span>
          <div className="mt-2 flex flex-col gap-1.5">
            {AI_PROMPT_EXAMPLES.map((ex, i) => {
              // Strip surrounding curly quotes for clean insertion
              const clean = ex.replace(/^[\u201c"\u201d]+|[\u201c"\u201d]+$/g, '');
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPrompt(prev => prev ? `${prev}\n${clean}` : clean)}
                  className="flex items-center gap-2 text-left px-3 py-2 rounded-lg bg-stone-50 border border-stone-200 hover:border-amber-300 hover:bg-amber-50 transition-all group"
                >
                  <span className="text-amber-400 group-hover:text-amber-500 text-sm flex-shrink-0">+</span>
                  <span className="italic text-stone-500 group-hover:text-amber-700 transition-colors">{ex}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Future: Model selection will go here */}
      <div className="bg-stone-50 border border-dashed border-stone-300 rounded-2xl p-6 text-center">
        <Sparkles size={20} className="text-stone-300 mx-auto mb-2" />
        <p className="text-sm text-stone-400 font-medium">Model Selection</p>
        <p className="text-xs text-stone-300 mt-1">
          Choose your preferred AI model — coming soon.
        </p>
      </div>
    </div>
  );
};

// ─── Page Component ───────────────────────────────────────────────────────────────

const StudentProfilePage: React.FC = () => {
  const { auth } = useAuth();
  const email = auth?.email || '';

  const [activeSection, setActiveSection] = useState<SidebarSection>('profile');
  const [sidebarWidth, setSidebarWidth] = useState(224);
  const isResizing = useRef(false);

  const [profile, setProfile] = useState<StudentProfile>({
    email,
    display_name: '',
    preferred_style: '',
    discipline: 'humanities',
    avatar_url: '',
    custom_prompt: '',
  });
  const [personaSets, setPersonaSets] = useState<PersonaSets>(DEFAULT_PERSONA);
  const [courses, setCourses] = useState<CourseProgress[]>([]);
  const [allCourses, setAllCourses] = useState<{ id: number; course_code: string; topic: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Fetch profile + courses ─────────────────────────────────────────────────

  useEffect(() => {
    if (!email) return;
    setLoading(true);

    const headers = { 'X-User-Email': email };

    Promise.all([
      fetch('/api/profile', { headers }).then(r => r.json()),
      fetch('/api/profile/courses', { headers }).then(r => r.json()),
      fetch('/api/graph/courses').then(r => r.json()),
    ])
      .then(([profileData, coursesData, allCoursesData]) => {
        setProfile({
          email: profileData.email || email,
          display_name: profileData.display_name || '',
          preferred_style: profileData.preferred_style || '',
          discipline: profileData.discipline || 'humanities',
          avatar_url: profileData.avatar_url || '',
          custom_prompt: profileData.custom_prompt || '',
        });
        // Load persona_sets from profile (with migration for old format)
        const ps = profileData.persona_sets;
        setPersonaSets(migratePersonaSets(ps));
        setCourses(coursesData.courses || []);
        setAllCourses(Array.isArray(allCoursesData) ? allCoursesData : []);
      })
      .catch(err => console.warn('Profile fetch error:', err))
      .finally(() => setLoading(false));
  }, [email]);

  // ── Save handler ────────────────────────────────────────────────────────────

  const handleSave = useCallback(
    async (updates: Partial<StudentProfile> & { persona_sets?: PersonaSets }) => {
      try {
        await fetch('/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-User-Email': email },
          body: JSON.stringify(updates),
        });
        const { persona_sets: _ps, ...profileUpdates } = updates;
        if (Object.keys(profileUpdates).length > 0) {
          setProfile(prev => ({ ...prev, ...profileUpdates }));
        }
      } catch (err) {
        console.warn('Profile save error:', err);
      }
    },
    [email]
  );

  const handlePersonaSave = useCallback(
    (ps: PersonaSets) => {
      setPersonaSets(ps);
      handleSave({ persona_sets: ps });
    },
    [handleSave]
  );

  // ── Sidebar resize ──────────────────────────────────────────────────────────

  const startResize = (e: React.MouseEvent) => {
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      setSidebarWidth(Math.min(320, Math.max(160, startWidth + ev.clientX - startX)));
    };
    const onUp = () => {
      isResizing.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── Nav items ───────────────────────────────────────────────────────────────

  const navItems: { id: SidebarSection; label: string; icon: React.ReactNode }[] = [
    {
      id: 'profile',
      label: 'Profile',
      icon: <User size={14} />,
    },
    {
      id: 'narrative',
      label: 'Customized Learning',
      icon: <Settings2 size={14} />,
    },
    {
      id: 'progress',
      label: 'My Progress',
      icon: <BarChart3 size={14} />,
    },
    {
      id: 'ai-settings',
      label: 'AI Settings',
      icon: <Sparkles size={14} />,
    },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9F8F4]">
        <div className="flex items-center gap-3 text-stone-400">
          <div className="w-5 h-5 border-2 border-stone-200 border-t-amber-500 rounded-full animate-spin" />
          <span className="text-sm">Loading profile…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F8F4]">

      {/* Top Bar */}
      <header className="h-12 flex items-center px-4 bg-white border-b border-stone-200 shrink-0 gap-4">
        <Link
          to="/courses"
          className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 transition-colors font-medium"
        >
          <ChevronLeft size={16} /> Dashboard
        </Link>
        <div className="flex-1 min-w-0 px-2">
          <span className="font-serif text-stone-900 text-sm truncate block">Student Profile</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside
          style={{ width: sidebarWidth }}
          className="bg-stone-900 flex flex-col shrink-0 overflow-y-auto relative"
        >
          {/* Header */}
          <div className="p-4 border-b border-stone-700">
            <div className="flex items-center gap-3">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white text-sm font-bold">
                  {(profile.display_name || email || '?')[0].toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm text-stone-100 font-medium truncate">
                  {profile.display_name || 'Student'}
                </p>
                <p className="text-[10px] text-stone-500 truncate">{email}</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-2 space-y-0.5">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full text-left px-2.5 py-2 rounded-lg text-base transition-all flex items-center gap-2 ${
                  activeSection === item.id
                    ? 'bg-stone-700 text-white'
                    : 'text-stone-400 hover:bg-stone-800 hover:text-stone-200'
                }`}
              >
                <span className={activeSection === item.id ? 'text-amber-400' : 'text-stone-500'}>
                  {item.icon}
                </span>
                <span className="leading-snug">{item.label}</span>
              </button>
            ))}
          </nav>

          {/* Drag handle */}
          <div
            onMouseDown={startResize}
            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-amber-500/30 active:bg-amber-500/50 transition-colors z-10"
          />
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            {activeSection === 'profile' && (
              <ProfileSection profile={profile} onSave={handleSave} />
            )}
            {activeSection === 'narrative' && (
              <NarrativeSettingsSection personaSets={personaSets} onSave={handlePersonaSave} allCourses={allCourses} />
            )}
            {activeSection === 'progress' && (
              <ProgressSection courses={courses} />
            )}
            {activeSection === 'ai-settings' && (
              <AISettingsSection
                customPrompt={profile.custom_prompt}
                onSave={(prompt) => handleSave({ custom_prompt: prompt })}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default StudentProfilePage;
