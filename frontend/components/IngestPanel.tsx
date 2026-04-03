/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { DARK_BG, PANEL_BG, BORDER_COLOR, TEXT_PRIMARY, TEXT_MUTED, ACCENT } from '../constants/theme';

export interface IngestFile {
  name: string;
  status: 'waiting' | 'processing' | 'done' | 'error';
}

export interface IngestPanelProps {
  // File state
  ingestFiles: IngestFile[];
  setIngestFiles: React.Dispatch<React.SetStateAction<IngestFile[]>>;
  ingestFileObjects: React.MutableRefObject<File[]>;
  // Form fields
  ingestSubject: string;
  setIngestSubject: (v: string) => void;
  ingestCourseCode: string;
  setIngestCourseCode: (v: string) => void;
  ingestYear: number | null;
  setIngestYear: (v: number | null) => void;
  // Validation errors
  ingestSubjectError: boolean;
  setIngestSubjectError: (v: boolean) => void;
  ingestYearError: boolean;
  setIngestYearError: (v: boolean) => void;
  // Run state
  ingestRunning: boolean;
  ingestOverflow: boolean;
  setIngestOverflow: (v: boolean) => void;
  ingestError: string | null;
  ingestSuccess: boolean;
  // Drop zone
  dropZoneHovered: boolean;
  setDropZoneHovered: (v: boolean) => void;
  // Callbacks
  onBuildGraph: () => void;
  isFullscreen: boolean;
}

const IngestPanel: React.FC<IngestPanelProps> = ({
  ingestFiles,
  setIngestFiles,
  ingestFileObjects,
  ingestSubject,
  setIngestSubject,
  ingestCourseCode,
  setIngestCourseCode,
  ingestYear,
  setIngestYear,
  ingestSubjectError,
  setIngestSubjectError,
  ingestYearError,
  setIngestYearError,
  ingestRunning,
  ingestOverflow,
  setIngestOverflow,
  ingestError,
  ingestSuccess,
  dropZoneHovered,
  setDropZoneHovered,
  onBuildGraph,
  isFullscreen,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const COURSE_CODE_RE = /([A-Z]{2,4}\s?\d{3,4})/;

  const addFilesToIngest = (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    setIngestFiles(prev => {
      const newEntries = fileArr.map(f => ({ name: f.name, status: 'waiting' as const }));
      const combined = [...prev, ...newEntries];
      const newFileObjects = [...ingestFileObjects.current, ...fileArr];
      if (combined.length > 15) {
        setIngestOverflow(true);
        ingestFileObjects.current = newFileObjects.slice(0, 15);
        return combined.slice(0, 15);
      }
      setIngestOverflow(false);
      ingestFileObjects.current = newFileObjects;
      return combined;
    });
    // Auto-detect course code from first filename if ingestSubject is empty
    if (fileArr.length > 0) {
      setIngestSubject(
        ingestSubject.trim() !== ''
          ? ingestSubject
          : (() => {
              const match = COURSE_CODE_RE.exec(fileArr[0].name);
              return match ? match[1] : ingestSubject;
            })()
      );
    }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDropZoneHovered(false);
    if (e.dataTransfer.files.length > 0) addFilesToIngest(e.dataTransfer.files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToIngest(e.target.files);
      e.target.value = '';
    }
  };

  return (
    <div
      className="flex flex-col"
      style={{
        width: '288px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: PANEL_BG,
        border: `1px solid ${BORDER_COLOR}`,
        borderRadius: '0.75rem',
        margin: '0 0 0 8px',
        ...(isFullscreen ? { minHeight: 0, overflow: 'hidden' } : {}),
      }}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.pptx,.docx"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInput}
      />

      {/* Panel header */}
      <div
        className="px-4 pt-4 pb-2"
        style={{ borderBottom: `1px solid ${BORDER_COLOR}` }}
      >
        <div
          className="text-xs font-semibold tracking-widest uppercase"
          style={{ color: ACCENT }}
        >
          Upload Materials
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4" style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto' }}>
        {/* Subject name input */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: TEXT_MUTED }}>
            Subject name <span style={{ color: '#f87171' }}>*</span>
          </label>
          <input
            type="text"
            value={ingestSubject}
            onChange={e => { setIngestSubject(e.target.value); if (e.target.value.trim()) setIngestSubjectError(false); }}
            placeholder="e.g. Organizational Behavior"
            disabled={ingestRunning}
            style={{
              background: DARK_BG,
              border: `1px solid ${ingestSubjectError ? '#f87171' : BORDER_COLOR}`,
              color: TEXT_PRIMARY,
              borderRadius: '0.5rem',
              padding: '0.35rem 0.6rem',
              fontSize: '0.8rem',
              outline: 'none',
              transition: 'border-color 0.15s',
              opacity: ingestRunning ? 0.6 : 1,
            }}
            onFocus={e => (e.currentTarget.style.borderColor = ingestSubjectError ? '#f87171' : ACCENT)}
            onBlur={e => (e.currentTarget.style.borderColor = ingestSubjectError ? '#f87171' : BORDER_COLOR)}
          />
          {ingestSubjectError && (
            <span style={{ color: '#f87171', fontSize: '0.7rem' }}>Subject name is required</span>
          )}
        </div>

        {/* Course code input */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: TEXT_MUTED }}>
            Course code <span style={{ color: TEXT_MUTED, fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            type="text"
            value={ingestCourseCode}
            onChange={e => setIngestCourseCode(e.target.value)}
            placeholder="e.g. ADMS 2400"
            disabled={ingestRunning}
            style={{
              background: DARK_BG,
              border: `1px solid ${BORDER_COLOR}`,
              color: TEXT_PRIMARY,
              borderRadius: '0.5rem',
              padding: '0.35rem 0.6rem',
              fontSize: '0.8rem',
              outline: 'none',
              transition: 'border-color 0.15s',
              opacity: ingestRunning ? 0.6 : 1,
            }}
            onFocus={e => (e.currentTarget.style.borderColor = ACCENT)}
            onBlur={e => (e.currentTarget.style.borderColor = BORDER_COLOR)}
          />
        </div>

        {/* Year dropdown */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: TEXT_MUTED }}>
            Year <span style={{ color: '#f87171' }}>*</span>
          </label>
          <select
            value={ingestYear ?? ''}
            onChange={e => {
              const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
              setIngestYear(val);
              if (val !== null) setIngestYearError(false);
            }}
            disabled={ingestRunning}
            style={{
              background: DARK_BG,
              border: `1px solid ${ingestYearError ? '#f87171' : BORDER_COLOR}`,
              color: ingestYear === null ? TEXT_MUTED : TEXT_PRIMARY,
              borderRadius: '0.5rem',
              padding: '0.35rem 0.6rem',
              fontSize: '0.8rem',
              outline: 'none',
              transition: 'border-color 0.15s',
              opacity: ingestRunning ? 0.6 : 1,
              cursor: ingestRunning ? 'not-allowed' : 'pointer',
              appearance: 'none',
              WebkitAppearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%236b6560' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 0.6rem center',
              paddingRight: '1.8rem',
            }}
          >
            <option value="">Select year</option>
            <option value="1">Year 1</option>
            <option value="2">Year 2</option>
            <option value="3">Year 3</option>
            <option value="4">Year 4</option>
          </select>
          {ingestYearError && (
            <span style={{ color: '#f87171', fontSize: '0.7rem' }}>Year is required</span>
          )}
        </div>

        {/* Drop zone */}
        <div
          onClick={() => !ingestRunning && fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDropZoneHovered(true); }}
          onDragLeave={() => setDropZoneHovered(false)}
          onDrop={handleFileDrop}
          style={{
            flex: '1 1 0',
            minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `2px dashed ${dropZoneHovered ? ACCENT : BORDER_COLOR}`,
            borderRadius: '0.5rem',
            padding: '1.25rem 0.75rem',
            textAlign: 'center',
            cursor: ingestRunning ? 'not-allowed' : 'pointer',
            background: dropZoneHovered ? 'rgba(139,94,60,0.05)' : DARK_BG,
            transition: 'border-color 0.15s, background 0.15s',
            opacity: ingestRunning ? 0.6 : 1,
          }}
        >
          <div className="text-xs" style={{ color: TEXT_MUTED, lineHeight: 1.6 }}>
            <div style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>📂</div>
            <div>Drop PDF, PPTX, DOCX</div>
            <div>or click to browse</div>
            <div className="mt-1" style={{ fontSize: '0.875rem', color: TEXT_PRIMARY, fontWeight: 600 }}>Max 15 files</div>
            <div style={{ fontSize: '0.75rem', color: TEXT_MUTED }}>Max 50 MB per file</div>
          </div>
        </div>

        {/* Overflow warning */}
        {ingestOverflow && (
          <div className="text-xs" style={{ color: '#f87171' }}>
            Only the first 15 files were added.
          </div>
        )}

        {/* Phase hint */}
        <div style={{ color: TEXT_MUTED, fontSize: '0.7rem', lineHeight: 1.5 }}>
          Drop files to queue them → click <strong style={{ color: TEXT_PRIMARY }}>Build Graph</strong> to generate the knowledge graph.
        </div>

        {/* File list */}
        {ingestFiles.length > 0 && (
          <div className="flex flex-col gap-1">
            {ingestFiles.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-xs"
                style={{ background: DARK_BG, border: `1px solid ${BORDER_COLOR}` }}
              >
                <span style={{ flexShrink: 0 }}>📄</span>
                <span
                  className="flex-1 truncate"
                  style={{ color: TEXT_PRIMARY }}
                  title={file.name}
                >
                  {file.name}
                </span>
                <span style={{ flexShrink: 0, fontSize: '0.8rem' }}>
                  {file.status === 'waiting' && '⏳'}
                  {file.status === 'processing' && (
                    <span style={{ color: ACCENT }}>🔄</span>
                  )}
                  {file.status === 'done' && '✅'}
                  {file.status === 'error' && '❌'}
                </span>
                {file.status === 'processing' && (
                  <span style={{ color: TEXT_MUTED, fontSize: '0.65rem', flexShrink: 0 }}>
                    processing...
                  </span>
                )}
                {!ingestRunning && (
                  <button
                    onClick={() => {
                      ingestFileObjects.current = ingestFileObjects.current.filter((_, i) => i !== idx);
                      setIngestFiles(prev => prev.filter((_, i) => i !== idx));
                    }}
                    title="Remove"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: TEXT_MUTED,
                      fontSize: '0.75rem',
                      lineHeight: 1,
                      padding: '0 1px',
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Build Graph button — pinned at bottom of panel */}
      <div className="px-4 pb-4 pt-2 flex flex-col gap-2">
        {ingestError && (
          <div className="text-xs rounded px-2 py-1.5 flex items-center gap-1.5"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
            <AlertCircle size={12} />
            {ingestError}
          </div>
        )}
        {ingestSuccess && (
          <div className="text-xs rounded px-2 py-1.5"
            style={{ background: 'rgba(34,197,94,0.12)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.3)' }}>
            Graph built successfully!
          </div>
        )}
        <button
          onClick={onBuildGraph}
          disabled={ingestFiles.length === 0 || ingestRunning}
          className="flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-opacity w-full"
          style={{
            background: ACCENT,
            color: DARK_BG,
            border: 'none',
            cursor: ingestFiles.length === 0 || ingestRunning ? 'not-allowed' : 'pointer',
            opacity: ingestFiles.length === 0 || ingestRunning ? 0.45 : 1,
          }}
        >
          {ingestRunning && (
            <Loader2 size={14} className="animate-spin" />
          )}
          {ingestRunning ? 'Building graph…' : 'Build Graph'}
        </button>
      </div>
    </div>
  );
};

export default IngestPanel;
