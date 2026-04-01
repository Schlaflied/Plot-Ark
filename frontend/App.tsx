/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import CoursesPage from './pages/CoursesPage';
import GraphPage from './pages/GraphPage';
import CoursePage from './pages/CoursePage';
import GeneratePage from './pages/GeneratePage';
import StudentDataPage from './pages/StudentDataPage';

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/courses" replace />} />
      <Route path="/generate" element={<GeneratePage />} />
      <Route path="/courses" element={<CoursesPage />} />
      <Route path="/graph" element={<GraphPage />} />
      <Route path="/course/:id" element={<CoursePage />} />
      <Route path="/student-data" element={<StudentDataPage />} />
    </Routes>
  );
};

export default App;
