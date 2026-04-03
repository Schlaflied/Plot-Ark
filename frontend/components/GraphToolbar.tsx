/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Search, X, Network } from 'lucide-react';
import { DARK_BG, PANEL_BG, BORDER_COLOR, TEXT_PRIMARY, TEXT_MUTED, ACCENT } from '../constants/theme';

export interface GraphToolbarProps {
  // Subject tabs
  selectedYear: number | null;
  activeSubject: string;
  setActiveSubject: (s: string) => void;
  subjectTabs: { key: string; label: string }[];
  setSubjectTabs: React.Dispatch<React.SetStateAction<{ key: string; label: string }[]>>;
  addingTab: boolean;
  setAddingTab: (v: boolean) => void;
  newTabName: string;
  setNewTabName: (v: string) => void;
  confirmAddTab: () => void;
  dragTabIndex: React.MutableRefObject<number | null>;
  dragOverTabIndex: number | null;
  setDragOverTabIndex: (v: number | null) => void;
  // Graph stats
  nodeCount: number | null;
  edgeCount: number | null;
  // Course search
  courseSearch: string;
  courseSearchResults: { year: number; code: string; label: string; fullName: string }[];
  courseSearchRef: React.RefObject<HTMLDivElement>;
  courseSearchOpen: boolean;
  handleCourseSearch: (query: string) => void;
  selectCourseResult: (result: { year: number; code: string; label: string; fullName: string }) => void;
  // Node search
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  // Selection
  hasSelectedNode: boolean;
  onClosePanel: () => void;
  // Fullscreen
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
  // Zoom
  onFitView: () => void;
}

const GraphToolbar: React.FC<GraphToolbarProps> = ({
  selectedYear, activeSubject, setActiveSubject,
  subjectTabs, setSubjectTabs,
  addingTab, setAddingTab, newTabName, setNewTabName, confirmAddTab,
  dragTabIndex, dragOverTabIndex, setDragOverTabIndex,
  nodeCount, edgeCount,
  courseSearch, courseSearchResults, courseSearchRef, courseSearchOpen,
  handleCourseSearch, selectCourseResult,
  searchQuery, setSearchQuery,
  hasSelectedNode, onClosePanel,
  isFullscreen, setIsFullscreen,
  onFitView,
}) => {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 flex-wrap"
      style={{ borderBottom: `1px solid ${BORDER_COLOR}`, background: PANEL_BG }}
    >
      <Network size={16} style={{ color: ACCENT, flexShrink: 0 }} />

      {/* Subject tabs — hidden when a year is selected */}
      {selectedYear === null && <div className="flex items-center gap-1" style={{ background: DARK_BG, borderRadius: '0.5rem', padding: '2px' }}>
        {subjectTabs.map((tab, index) => {
          const isActive = activeSubject === tab.key;
          const isDragOver = dragOverTabIndex === index;
          return (
            <div
              key={tab.key}
              className="relative flex items-center group"
              draggable={true}
              onDragStart={e => { dragTabIndex.current = index; e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverTabIndex(index); }}
              onDragLeave={() => setDragOverTabIndex(null)}
              onDrop={e => {
                e.preventDefault();
                if (dragTabIndex.current === null || dragTabIndex.current === index) { setDragOverTabIndex(null); return; }
                setSubjectTabs(prev => {
                  const next = [...prev];
                  const [moved] = next.splice(dragTabIndex.current!, 1);
                  next.splice(index, 0, moved);
                  return next;
                });
                dragTabIndex.current = null;
                setDragOverTabIndex(null);
              }}
              onDragEnd={() => { dragTabIndex.current = null; setDragOverTabIndex(null); }}
              style={{ display: 'inline-flex', cursor: 'grab', userSelect: 'none', background: isDragOver ? BORDER_COLOR : undefined, borderRadius: '0.375rem' }}
            >
              <button
                onClick={() => setActiveSubject(tab.key)}
                className="text-xs font-medium px-3 py-1 rounded transition-all"
                style={{
                  background: isActive ? ACCENT : 'transparent',
                  color: isActive ? DARK_BG : TEXT_MUTED,
                  border: 'none',
                  cursor: 'inherit',
                  borderRadius: '0.375rem',
                  fontWeight: isActive ? 600 : 400,
                  paddingRight: tab.key !== 'all' ? '1.4rem' : undefined,
                }}
              >
                {tab.label}
              </button>
              {tab.key !== 'all' && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    setSubjectTabs(prev => prev.filter(t => t.key !== tab.key));
                    if (activeSubject === tab.key) setActiveSubject('all');
                  }}
                  title="Remove tab"
                  className="absolute"
                  style={{
                    right: '3px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: isActive ? DARK_BG : TEXT_MUTED,
                    fontSize: '0.65rem', lineHeight: 1, padding: '1px', opacity: 0,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0'; }}
                  onFocus={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                  onBlur={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0'; }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
        {addingTab ? (
          <div className="flex items-center gap-1 px-1">
            <input
              autoFocus type="text" value={newTabName}
              onChange={e => setNewTabName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') confirmAddTab();
                if (e.key === 'Escape') { setAddingTab(false); setNewTabName(''); }
              }}
              placeholder="Subject name"
              style={{ background: DARK_BG, border: `1px solid ${ACCENT}`, color: TEXT_PRIMARY, borderRadius: '0.375rem', padding: '0.15rem 0.4rem', fontSize: '0.75rem', outline: 'none', width: '110px' }}
            />
            <button onClick={confirmAddTab} style={{ background: ACCENT, color: DARK_BG, border: 'none', borderRadius: '0.375rem', padding: '0.15rem 0.4rem', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600 }}>Add</button>
            <button onClick={() => { setAddingTab(false); setNewTabName(''); }} style={{ background: 'none', border: 'none', color: TEXT_MUTED, cursor: 'pointer', fontSize: '0.75rem', lineHeight: 1 }}>×</button>
          </div>
        ) : (
          <button onClick={() => setAddingTab(true)} title="Add subject tab" style={{ background: 'none', border: `1px dashed ${BORDER_COLOR}`, color: TEXT_MUTED, borderRadius: '0.375rem', padding: '0.1rem 0.45rem', fontSize: '0.85rem', cursor: 'pointer', lineHeight: 1 }}>+</button>
        )}
      </div>}

      <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: TEXT_MUTED }}>
        {nodeCount !== null ? `${nodeCount} nodes · ${edgeCount} edges` : '— nodes · — edges'}
      </span>
      <div className="flex-1" />

      {/* Course search */}
      <div className="relative" ref={courseSearchRef}>
        <div className="relative flex items-center">
          <Search size={13} className="absolute left-2.5 pointer-events-none" style={{ color: TEXT_MUTED }} />
          <input type="text" value={courseSearch} onChange={e => handleCourseSearch(e.target.value)} placeholder="Search courses…"
            style={{ background: DARK_BG, border: `1px solid ${BORDER_COLOR}`, color: TEXT_PRIMARY, borderRadius: '0.5rem', padding: '0.3rem 2rem', fontSize: '0.75rem', outline: 'none', width: '160px', transition: 'border-color 0.15s' }}
            onFocus={e => (e.currentTarget.style.borderColor = ACCENT)} onBlur={e => (e.currentTarget.style.borderColor = BORDER_COLOR)}
          />
          {courseSearch && (
            <button onClick={() => handleCourseSearch('')} className="absolute right-2" style={{ color: TEXT_MUTED, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><X size={12} /></button>
          )}
        </div>
        {courseSearchOpen && (
          <div className="absolute mt-1" style={{ top: '100%', left: 0, zIndex: 50, background: PANEL_BG, border: `1px solid ${BORDER_COLOR}`, borderRadius: '0.5rem', minWidth: '200px', maxHeight: '220px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
            {courseSearchResults.map(result => (
              <button key={`${result.year}-${result.code}`} onClick={() => selectCourseResult(result)} className="w-full text-left flex items-center gap-2 px-3 py-2"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: TEXT_PRIMARY, borderBottom: `1px solid ${BORDER_COLOR}` }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = DARK_BG; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
              >
                <span style={{ color: TEXT_MUTED, flexShrink: 0 }}>Year {result.year}</span>
                <span style={{ fontWeight: 500 }}>{result.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Node search */}
      <div className="relative flex items-center">
        <Search size={13} className="absolute left-2.5 pointer-events-none" style={{ color: TEXT_MUTED }} />
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Filter nodes…"
          style={{ background: DARK_BG, border: `1px solid ${BORDER_COLOR}`, color: TEXT_PRIMARY, borderRadius: '0.5rem', padding: '0.3rem 2rem', fontSize: '0.75rem', outline: 'none', width: '180px', transition: 'border-color 0.15s' }}
          onFocus={e => (e.currentTarget.style.borderColor = ACCENT)} onBlur={e => (e.currentTarget.style.borderColor = BORDER_COLOR)}
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-2" style={{ color: TEXT_MUTED, lineHeight: 1 }}><X size={12} /></button>
        )}
      </div>

      {hasSelectedNode && (
        <button onClick={onClosePanel} className="text-xs px-2 py-1 rounded" style={{ background: BORDER_COLOR, color: TEXT_MUTED }}>Close panel</button>
      )}

      {!isFullscreen ? (
        <button onClick={() => setIsFullscreen(true)} className="text-xs px-2 py-1 rounded" style={{ background: BORDER_COLOR, color: TEXT_MUTED }} title="Enter full screen">⛶ Full screen</button>
      ) : (
        <button onClick={() => setIsFullscreen(false)} className="text-xs px-2 py-1 rounded" style={{ background: BORDER_COLOR, color: TEXT_MUTED }} title="Exit full screen (Esc)">✕ Exit full screen</button>
      )}
      <button onClick={onFitView} className="text-xs px-2 py-1 rounded" style={{ background: BORDER_COLOR, color: TEXT_MUTED }} title="Fit all nodes in view">⊡ Fit view</button>
    </div>
  );
};

export default GraphToolbar;
