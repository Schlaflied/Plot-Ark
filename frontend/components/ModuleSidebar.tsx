/**
 * ModuleSidebar — Left sidebar for CoursePage with DnD module list.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Network } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Module } from '../utils/courseExport';

// ─── SortableModuleItem ───────────────────────────────────────────────────────

interface SortableModuleItemProps {
  id: string;
  index: number;
  module: Module;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

const SortableModuleItem: React.FC<SortableModuleItemProps> = ({
  id,
  index,
  module,
  isActive,
  onSelect,
  onDelete,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1 group">
      <button
        {...attributes}
        {...listeners}
        className="p-1 text-stone-600 hover:text-stone-400 cursor-grab active:cursor-grabbing shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Drag to reorder"
      >
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
          <circle cx="3" cy="2" r="1.2" />
          <circle cx="7" cy="2" r="1.2" />
          <circle cx="3" cy="7" r="1.2" />
          <circle cx="7" cy="7" r="1.2" />
          <circle cx="3" cy="12" r="1.2" />
          <circle cx="7" cy="12" r="1.2" />
        </svg>
      </button>
      <button
        onClick={onSelect}
        className={`flex-1 text-left px-2 py-2.5 rounded-lg text-sm transition-all flex items-center gap-2 min-w-0 ${
          isActive
            ? 'bg-stone-700 text-white'
            : 'text-stone-400 hover:bg-stone-800 hover:text-stone-200'
        }`}
      >
        <span className="font-mono text-xs opacity-40 w-4 shrink-0">
          {index + 1}
        </span>
        <span
          className="flex-1 leading-snug text-xs break-words min-w-0"
          title={module.title}
        >
          {module.title}
        </span>
        <span className="flex gap-0.5 shrink-0">
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className={`w-1.5 h-1.5 rounded-full ${
                n <= Number(module.complexity_level)
                  ? isActive
                    ? 'bg-amber-400'
                    : 'bg-stone-500'
                  : isActive
                    ? 'bg-white/20'
                    : 'bg-stone-700'
              }`}
            />
          ))}
        </span>
      </button>
      <button
        onClick={onDelete}
        className="p-1 text-stone-700 hover:text-red-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Delete module"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
};

// ─── ModuleSidebar ────────────────────────────────────────────────────────────

interface ModuleSidebarProps {
  courseId: string | undefined;
  curriculum: { course_code: string; topic: string };
  modules: Module[];
  mergedModules: Module[];
  filteredModules: Module[];
  currentModuleIndex: number;
  search: string;
  isStudent: boolean;
  sidebarWidth: number;
  onSelectModule: (index: number) => void;
  onDeleteModule: (index: number) => void;
  onAddModule: () => void;
  onSearchChange: (value: string) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onStartResize: (e: React.MouseEvent) => void;
}

const ModuleSidebar: React.FC<ModuleSidebarProps> = ({
  courseId,
  curriculum,
  modules,
  mergedModules,
  filteredModules,
  currentModuleIndex,
  search,
  isStudent,
  sidebarWidth,
  onSelectModule,
  onDeleteModule,
  onAddModule,
  onSearchChange,
  onDragEnd,
  onStartResize,
}) => {
  const navigate = useNavigate();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  return (
    <aside
      style={{ width: sidebarWidth }}
      className="shrink-0 bg-stone-900 text-stone-100 flex flex-col border-r border-stone-800 overflow-hidden relative"
    >
      {/* Course title */}
      <div className="px-4 pt-5 pb-3 border-b border-stone-800">
        {isStudent && (
          <p className="text-[10px] font-bold uppercase tracking-widest text-green-400 mb-1.5">
            Course Structure
          </p>
        )}
        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-1">
          {curriculum.course_code || 'Course'}
        </p>
        <p className="font-serif text-sm text-stone-100 leading-snug line-clamp-3">
          {curriculum.topic}
        </p>
        {isStudent && (
          <p className="text-[10px] text-stone-500 mt-1">
            {modules.length} modules
          </p>
        )}
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-stone-800">
        <input
          type="text"
          placeholder="Search modules…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full bg-stone-800 text-stone-200 placeholder:text-stone-600 text-xs rounded-md px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-amber-500/50 border border-stone-700 transition"
        />
      </div>

      {/* Knowledge Graph shortcut */}
      <div className="px-3 py-2 border-b border-stone-800">
        <button
          onClick={() =>
            navigate('/graph', {
              state: {
                fromCourse: courseId,
                courseCode: curriculum.course_code,
                courseTopic: curriculum.topic,
              },
            })
          }
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 transition-colors text-xs font-semibold border border-amber-500/20"
        >
          <Network size={14} />
          Knowledge Graph
        </button>
      </div>

      {/* Module list */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Drag hint */}
        {!isStudent && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 mb-2 rounded-lg bg-stone-800/60 text-stone-500 text-[10px]">
            <svg
              width="8"
              height="12"
              viewBox="0 0 10 14"
              fill="currentColor"
              className="shrink-0 opacity-60"
            >
              <circle cx="3" cy="2" r="1.2" />
              <circle cx="7" cy="2" r="1.2" />
              <circle cx="3" cy="7" r="1.2" />
              <circle cx="7" cy="7" r="1.2" />
              <circle cx="3" cy="12" r="1.2" />
              <circle cx="7" cy="12" r="1.2" />
            </svg>
            Drag to reorder modules
          </div>
        )}

        {isStudent ? (
          <div className="space-y-0.5">
            {mergedModules.map((mod, idx) => {
              const isActive = idx === currentModuleIndex;
              return (
                <button
                  key={idx}
                  onClick={() => onSelectModule(idx)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center gap-2 min-w-0 ${
                    isActive
                      ? 'bg-stone-700 text-white'
                      : 'text-stone-400 hover:bg-stone-800 hover:text-stone-200'
                  }`}
                >
                  <span className="font-mono text-xs opacity-40 w-4 shrink-0">
                    {idx + 1}
                  </span>
                  <span
                    className="flex-1 leading-snug text-xs break-words min-w-0"
                    title={mod.title}
                  >
                    {mod.title}
                  </span>
                  <span className="flex gap-0.5 shrink-0">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span
                        key={n}
                        className={`w-1.5 h-1.5 rounded-full ${
                          n <= Number(mod.complexity_level)
                            ? isActive
                              ? 'bg-amber-400'
                              : 'bg-stone-500'
                            : isActive
                              ? 'bg-white/20'
                              : 'bg-stone-700'
                        }`}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        ) : search.trim() ? (
          <div className="space-y-0.5">
            {filteredModules.length > 0 ? (
              filteredModules.map((mod) => {
                const origIdx = modules.indexOf(mod);
                const isActive = origIdx === currentModuleIndex;
                return (
                  <button
                    key={origIdx}
                    onClick={() => onSelectModule(origIdx)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center gap-3 ${
                      isActive
                        ? 'bg-stone-700 text-white'
                        : 'text-stone-400 hover:bg-stone-800 hover:text-stone-200'
                    }`}
                  >
                    <span className="font-mono text-xs opacity-40 w-4 shrink-0">
                      {origIdx + 1}
                    </span>
                    <span
                      className="flex-1 leading-snug text-xs break-words"
                      title={mod.title}
                    >
                      {mod.title}
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="py-8 text-center text-stone-600 text-xs">
                No modules found
              </p>
            )}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={mergedModules.map((_, i) => `module-${i}`)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-0.5">
                {mergedModules.map((mod, idx) => (
                  <SortableModuleItem
                    key={`module-${idx}`}
                    id={`module-${idx}`}
                    index={idx}
                    module={mod}
                    isActive={idx === currentModuleIndex}
                    onSelect={() => onSelectModule(idx)}
                    onDelete={() => onDeleteModule(idx)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {!isStudent && (
          <button
            onClick={onAddModule}
            className="w-full mt-2 px-3 py-2 rounded-lg text-xs text-stone-500 hover:text-amber-400 hover:bg-stone-800 transition-colors flex items-center gap-2"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add module
          </button>
        )}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onStartResize}
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-amber-500/40 transition-colors"
      />
    </aside>
  );
};

export default ModuleSidebar;
