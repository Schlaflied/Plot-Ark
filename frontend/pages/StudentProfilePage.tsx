/**
 * StudentProfilePage — Student-facing profile & progress page.
 * Mirrors the professor SettingsPage layout (sidebar + content).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, User, BarChart3, Check, Camera } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type SidebarSection = 'profile' | 'progress';

interface StudentProfile {
  email: string;
  display_name: string;
  preferred_style: string;
  avatar_url: string;
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

// ─── Style options ────────────────────────────────────────────────────────────

const STYLE_OPTIONS = [
  {
    value: 'analogy',
    label: 'Analogies',
    emoji: '🌉',
    desc: 'Learn through comparisons with familiar things',
    example: '"A contract is like a promise you pinky-swear on — but with lawyers watching."',
  },
  {
    value: 'steps',
    label: 'Step-by-step',
    emoji: '📝',
    desc: 'Learn through structured, numbered breakdowns',
    example: '"1. Offer → 2. Acceptance → 3. Consideration → 4. Binding contract."',
  },
  {
    value: 'narrative',
    label: 'Stories',
    emoji: '📖',
    desc: 'Learn through scenarios and narratives',
    example: '"Alex offered to sell her car for $5k. Ben said yes and paid — now there\'s a contract."',
  },
];

// ─── Profile Section ──────────────────────────────────────────────────────────

const ProfileSection: React.FC<{
  profile: StudentProfile;
  onSave: (updates: Partial<StudentProfile>) => Promise<void>;
}> = ({ profile, onSave }) => {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [selectedStyle, setSelectedStyle] = useState(profile.preferred_style);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isInitialMount = useRef(true);

  // Sync when profile prop changes (initial load)
  useEffect(() => {
    setDisplayName(profile.display_name);
    setSelectedStyle(profile.preferred_style);
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
      doSave({ display_name: displayName, preferred_style: selectedStyle, avatar_url: avatarUrl });
    }, 800);
    return () => clearTimeout(debounceRef.current);
  }, [displayName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Immediate save for style selection
  const handleStyleChange = (value: string) => {
    const newStyle = selectedStyle === value ? '' : value;
    setSelectedStyle(newStyle);
    clearTimeout(debounceRef.current);
    doSave({ display_name: displayName, preferred_style: newStyle, avatar_url: avatarUrl });
  };

  // Immediate save for avatar upload
  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be under 2 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setAvatarUrl(dataUrl);
      clearTimeout(debounceRef.current);
      doSave({ display_name: displayName, preferred_style: selectedStyle, avatar_url: dataUrl });
    };
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

        {/* Learning style */}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">
              Preferred Learning Style
            </label>
            <p className="text-sm text-stone-400 mt-1">
              Choose how you prefer concepts to be explained. Here's how each style would explain <span className="font-medium text-stone-600">Contract Law</span>:
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {STYLE_OPTIONS.map(opt => {
              const active = selectedStyle === opt.value;
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
                    {opt.label}
                  </span>
                  <span className="text-xs text-stone-400 leading-relaxed">{opt.desc}</span>
                  {/* Concrete example */}
                  <span className={`text-[11px] leading-snug mt-1 italic ${
                    active ? 'text-amber-600/80' : 'text-stone-400/70'
                  }`}>
                    {opt.example}
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

// ─── Page Component ───────────────────────────────────────────────────────────

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
    avatar_url: '',
  });
  const [courses, setCourses] = useState<CourseProgress[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Fetch profile + courses ─────────────────────────────────────────────────

  useEffect(() => {
    if (!email) return;
    setLoading(true);

    const headers = { 'X-User-Email': email };

    Promise.all([
      fetch('/api/profile', { headers }).then(r => r.json()),
      fetch('/api/profile/courses', { headers }).then(r => r.json()),
    ])
      .then(([profileData, coursesData]) => {
        setProfile({
          email: profileData.email || email,
          display_name: profileData.display_name || '',
          preferred_style: profileData.preferred_style || '',
          avatar_url: profileData.avatar_url || '',
        });
        setCourses(coursesData.courses || []);
      })
      .catch(err => console.warn('Profile fetch error:', err))
      .finally(() => setLoading(false));
  }, [email]);

  // ── Save handler ────────────────────────────────────────────────────────────

  const handleSave = useCallback(
    async (updates: Partial<StudentProfile>) => {
      try {
        await fetch('/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-User-Email': email },
          body: JSON.stringify(updates),
        });
        setProfile(prev => ({ ...prev, ...updates }));
      } catch (err) {
        console.warn('Profile save error:', err);
      }
    },
    [email]
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
      id: 'progress',
      label: 'My Progress',
      icon: <BarChart3 size={14} />,
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
            {activeSection === 'progress' && (
              <ProgressSection courses={courses} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default StudentProfilePage;
