/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef } from 'react';
import type { IngestFile } from '../components/IngestPanel';
import { slugify } from '../constants/theme';

interface UseIngestOptions {
  onComplete: (tabKey: string, tabLabel: string, tabYear: number, subjectName: string) => void;
}

export function useIngest({ onComplete }: UseIngestOptions) {
  const [ingestFiles, setIngestFiles] = useState<IngestFile[]>([]);
  const ingestFileObjects = useRef<File[]>([]);
  const [ingestSubject, setIngestSubject] = useState('');
  const [ingestCourseCode, setIngestCourseCode] = useState('');
  const [ingestYear, setIngestYear] = useState<number | null>(null);
  const [ingestLayer, setIngestLayer] = useState('hot');
  const [ingestSubjectError, setIngestSubjectError] = useState(false);
  const [ingestYearError, setIngestYearError] = useState(false);
  const [ingestRunning, setIngestRunning] = useState(false);
  const [ingestOverflow, setIngestOverflow] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [ingestSuccess, setIngestSuccess] = useState(false);
  const [dropZoneHovered, setDropZoneHovered] = useState(false);

  const handleBuildGraph = async () => {
    const subjectMissing = ingestSubject.trim() === '';
    const yearMissing = ingestYear === null;
    setIngestSubjectError(subjectMissing);
    setIngestYearError(yearMissing);
    if (ingestRunning || ingestFiles.length === 0 || subjectMissing || yearMissing) return;

    setIngestRunning(true);
    setIngestError(null);
    setIngestSuccess(false);
    setIngestFiles(prev => prev.map(f => ({ ...f, status: 'waiting' as const })));

    try {
      const formData = new FormData();
      formData.append('subject', ingestSubject.trim());
      formData.append('layer', ingestLayer);
      ingestFileObjects.current.forEach(file => formData.append('files[]', file));

      const startRes = await fetch('/api/materials/ingest', {
        method: 'POST',
        body: formData,
      });
      if (!startRes.ok) {
        const err = await startRes.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${startRes.status}`);
      }
      const { job_id } = await startRes.json();

      const poll = async (): Promise<void> => {
        const statusRes = await fetch(`/api/materials/ingest/status/${job_id}`);
        if (!statusRes.ok) throw new Error(`Status check failed: HTTP ${statusRes.status}`);
        const status = await statusRes.json();

        if (status.status === 'running') {
          const progressText: string = status.progress ?? '';
          const fileMatch = progressText.match(/(\d+)\/\d+/);
          if (fileMatch) {
            const idx = parseInt(fileMatch[1], 10) - 1;
            setIngestFiles(prev => prev.map((f, i) => ({
              ...f,
              status: i < idx ? 'done' : i === idx ? 'processing' : f.status,
            })));
          }
          await new Promise(resolve => setTimeout(resolve, 3000));
          return poll();
        }
        if (status.status === 'done') {
          setIngestFiles(prev => prev.map(f => ({ ...f, status: 'done' as const })));
          setIngestSuccess(true);
          setIngestRunning(false);

          const rawCode = ingestCourseCode.trim();
          const tabKey = slugify(ingestSubject);
          const tabLabel = rawCode || ingestSubject.trim();
          const tabYear = ingestYear!;
          onComplete(tabKey, tabLabel, tabYear, ingestSubject.trim());

          setTimeout(() => setIngestSuccess(false), 3000);
          return;
        }
        throw new Error(status.message ?? 'Ingestion failed');
      };

      await poll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ingestion failed';
      setIngestError(msg);
      setIngestFiles(prev => prev.map(f => f.status === 'processing' ? { ...f, status: 'error' as const } : f));
      setIngestRunning(false);
    }
  };

  return {
    ingestFiles, setIngestFiles, ingestFileObjects,
    ingestSubject, setIngestSubject,
    ingestCourseCode, setIngestCourseCode,
    ingestYear, setIngestYear,
    ingestLayer, setIngestLayer,
    ingestSubjectError, setIngestSubjectError,
    ingestYearError, setIngestYearError,
    ingestRunning,
    ingestOverflow, setIngestOverflow,
    ingestError, ingestSuccess,
    dropZoneHovered, setDropZoneHovered,
    handleBuildGraph,
  };
}
