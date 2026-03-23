/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
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

  const backTo = state.fromCourse ? `/course/${state.fromCourse}` : '/courses';
  const backLabel = state.fromCourse ? 'Back to course' : 'Back';

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
        />
      </div>
    </div>
  );
};

export default GraphPage;
