/**
 * SyllabusUpload component — drag-and-drop PDF/DOCX upload with AI parsing.
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  Loader2, CheckCircle2, AlertTriangle, Upload, X, FileUp,
} from 'lucide-react';

type SyllabusStatus = 'idle' | 'parsing' | 'done' | 'error';

interface SyllabusUploadProps {
  onFieldsParsed: (fields: Record<string, string>) => void;
}

export const SyllabusUpload: React.FC<SyllabusUploadProps> = ({ onFieldsParsed }) => {
  const [syllabusStatus, setSyllabusStatus] = useState<SyllabusStatus>('idle');
  const [syllabusFile, setSyllabusFile] = useState<File | null>(null);
  const [syllabusError, setSyllabusError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'pdf' && ext !== 'docx') {
      setSyllabusError('Only PDF and DOCX files are supported');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setSyllabusError('File too large (max 10 MB)');
      return;
    }

    setSyllabusFile(file);
    setSyllabusError('');
    setSyllabusStatus('parsing');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/syllabus/parse', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setSyllabusError(data.error || `Server error: ${res.status}`);
        setSyllabusStatus('error');
        return;
      }

      if (data.fields) {
        onFieldsParsed(data.fields);
        setSyllabusStatus('done');
      } else {
        setSyllabusError('No fields extracted');
        setSyllabusStatus('error');
      }
    } catch (err: any) {
      setSyllabusError(err.message || 'Network error');
      setSyllabusStatus('error');
    }
  }, [onFieldsParsed]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleClear = useCallback(() => {
    setSyllabusFile(null);
    setSyllabusStatus('idle');
    setSyllabusError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-semibold text-stone-700 mb-1.5">
        <Upload size={15} /> Import Syllabus
        <span className="text-xs text-stone-400 font-normal">(optional — PDF or DOCX)</span>
      </label>

      {/* Dropzone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => syllabusStatus !== 'parsing' && fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl transition-all cursor-pointer
          ${isDragOver
            ? 'border-amber-400 bg-amber-50/50'
            : syllabusStatus === 'done'
              ? 'border-green-300 bg-green-50/30'
              : syllabusStatus === 'error'
                ? 'border-red-300 bg-red-50/30'
                : 'border-stone-200 hover:border-amber-300 hover:bg-amber-50/20'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx"
          onChange={handleInputChange}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center py-8 px-4">
          {syllabusStatus === 'parsing' ? (
            <>
              <Loader2 size={28} className="text-amber-500 animate-spin mb-2" />
              <p className="text-sm text-amber-700 font-medium">Parsing syllabus…</p>
            </>
          ) : syllabusStatus === 'done' && syllabusFile ? (
            <>
              <CheckCircle2 size={28} className="text-green-500 mb-2" />
              <p className="text-sm text-green-700 font-medium mb-1">
                Fields auto-filled from syllabus
              </p>
              <p className="text-xs text-stone-400">{syllabusFile.name}</p>
              <button
                onClick={e => { e.stopPropagation(); handleClear(); }}
                className="mt-2 flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 transition-colors"
              >
                <X size={12} /> Clear
              </button>
            </>
          ) : (
            <>
              <FileUp size={28} className="text-stone-300 mb-2" />
              <p className="text-sm text-stone-500">
                Drop your syllabus here or{' '}
                <span className="text-amber-700 font-semibold hover:underline">browse</span>
              </p>
              <p className="text-xs text-stone-400 mt-1">PDF or DOCX — fields will auto-fill</p>
              <p className="text-xs text-stone-400">PDF or DOCX · Max 10 MB</p>
            </>
          )}
        </div>

        {/* Remove button when file is present */}
        {syllabusFile && syllabusStatus !== 'parsing' && (
          <button
            onClick={e => { e.stopPropagation(); handleClear(); }}
            className="absolute top-2 right-2 p-1 text-stone-300 hover:text-stone-600 transition-colors"
            title="Remove file"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Error message */}
      {syllabusError && (
        <div className="flex items-center gap-2 mt-2 text-xs text-red-600">
          <AlertTriangle size={12} />
          {syllabusError}
        </div>
      )}
    </div>
  );
};
