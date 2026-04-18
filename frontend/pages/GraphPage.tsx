/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import GraphViewer from '../components/GraphViewer';
import { ArrowLeft } from 'lucide-react';

interface GraphPageState {
  fromCourse?: string;
  courseCode?: string;
  courseTopic?: string;
}

const GraphPage: React.FC = () => {
  const location = useLocation();
  const state = (location.state as GraphPageState) || {};

  // Persist fromCourse to sessionStorage so it survives page refresh
  // (location.state is in-memory only and is lost on hard refresh)
  const SESSION_KEY = 'graph_page_course_id';
  if (state.fromCourse) sessionStorage.setItem(SESSION_KEY, state.fromCourse);
  const courseId = state.fromCourse || sessionStorage.getItem(SESSION_KEY) || null;

  const [masteryMap, setMasteryMap] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!courseId) return;
    fetch(`/api/mastery/${courseId}`)
      .then(r => r.json())
      .then(d => setMasteryMap(d.mastery || {}))
      .catch(() => {});
  }, [courseId]);

  const backTo = courseId ? `/course/${courseId}` : '/courses';
  const backLabel = courseId ? 'Back to course' : 'Back';

  return (
    <div className="min-h-screen bg-stone-900 flex flex-col">
      {/* Header bar */}
      <div className="px-6 py-4 flex items-center gap-4 border-b border-stone-800">
        <Link
          to={backTo}
          className="flex items-center gap-2 text-sm text-stone-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
          {backLabel}
        </Link>
        <div className="text-xs tracking-[0.2em] text-stone-400 uppercase font-bold">
          Knowledge Graph
        </div>
      </div>

      {/* Graph fills remaining height */}
      <div className="flex-1">
        <GraphViewer
          initialCourseCode={state.courseCode}
          initialCourseTopic={state.courseTopic}
          masteryMap={masteryMap}
        />
      </div>
    </div>
  );
};

export default GraphPage;
