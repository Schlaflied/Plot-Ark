/**
 * Dashboard card components — CourseCard, SpecialCard, AddCourseCard
 *
 * Extracted from CoursesPage.tsx for reusability and maintainability.
 */

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { X, Star, Plus } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  id: number;
  created_at: string;
  topic: string;
  level: string;
  course_code: string;
  course_type: string;
  module_count: number;
  is_favorite: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Course card ──────────────────────────────────────────────────────────────

interface CourseCardProps {
  entry: HistoryEntry;
  onDelete: (e: React.MouseEvent, id: number) => void;
  onToggleFavorite: (e: React.MouseEvent, id: number) => void;
  viewMode?: 'professor' | 'student';
}

export const CourseCard: React.FC<CourseCardProps> = ({ entry, onDelete, onToggleFavorite, viewMode = 'professor' }) => {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => navigate(`/course/${entry.id}${viewMode === 'student' ? '?view=student' : ''}`)}
      className="relative bg-white border border-stone-200 rounded-xl shadow-sm group hover:shadow-md transition-all cursor-pointer"
    >
      {/* Amber top border */}
      <div className="h-1 rounded-t-xl" style={{ backgroundColor: '#C5A028' }} />

      {/* Delete button */}
      <button
        onClick={e => onDelete(e, entry.id)}
        className="absolute top-3 right-3 z-10 p-0.5 text-stone-300 hover:text-stone-700 opacity-0 group-hover:opacity-100 transition-all"
        title="Delete"
      >
        <X size={13} />
      </button>

      {/* Favorite button */}
      <button
        onClick={e => onToggleFavorite(e, entry.id)}
        className={`absolute top-3 right-7 z-10 p-0.5 transition-all opacity-0 group-hover:opacity-100 ${
          entry.is_favorite ? 'text-amber-500 !opacity-100' : 'text-stone-300 hover:text-amber-500'
        }`}
        title={entry.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        <Star size={12} fill={entry.is_favorite ? 'currentColor' : 'none'} />
      </button>

      <div className="p-4">
        <h3 className="font-semibold text-stone-900 text-sm leading-snug line-clamp-2 mb-1">
          {entry.topic}
        </h3>
        <p className="text-xs text-stone-400 mb-0.5">
          {entry.level}{entry.course_type ? ` · ${entry.course_type}` : ''}{entry.module_count ? ` · ${entry.module_count} modules` : ''}
        </p>
        <p className="text-xs text-stone-400 mb-3">
          {formatDate(entry.created_at)}
        </p>
        <div className="flex justify-end">
          <span className="text-xs font-semibold text-amber-700 group-hover:underline">
            Open →
          </span>
        </div>
      </div>
    </div>
  );
};

// ─── Special feature card ─────────────────────────────────────────────────────

interface SpecialCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  to: string;
  isExternal?: boolean;
}

export const SpecialCard: React.FC<SpecialCardProps> = ({ title, description, icon, to, isExternal }) => {
  const inner = (
    <>
      <div className="h-1 rounded-t-xl" style={{ backgroundColor: '#C5A028' }} />
      <div className="p-4 flex items-start gap-3">
        <div className="mt-0.5" style={{ color: '#C5A028' }}>{icon}</div>
        <div>
          <h3 className="font-semibold text-sm leading-snug mb-1 group-hover:underline" style={{ color: '#C5A028' }}>
            {title}
          </h3>
          <p className="text-xs text-stone-500 leading-relaxed">{description}</p>
        </div>
      </div>
    </>
  );

  const cardClass = 'relative bg-white border border-stone-200 rounded-xl shadow-sm hover:shadow-md transition-shadow group block';

  if (isExternal) {
    return (
      <a href={to} className={cardClass}>
        {inner}
      </a>
    );
  }
  return (
    <Link to={to} className={cardClass}>
      {inner}
    </Link>
  );
};

// ─── New Course card ──────────────────────────────────────────────────────────

export const AddCourseCard: React.FC = () => (
  <Link
    to="/generate"
    className="flex flex-col items-center justify-center bg-white border-2 border-dashed border-stone-200 rounded-xl hover:border-amber-400 hover:bg-amber-50/30 transition-all group min-h-[120px]"
  >
    <Plus size={22} className="text-stone-300 group-hover:text-amber-500 transition-colors mb-1" />
    <span className="text-xs text-stone-400 group-hover:text-amber-700 transition-colors font-medium">
      New Course
    </span>
  </Link>
);
