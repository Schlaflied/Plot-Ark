/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import CoursesPage from './pages/CoursesPage';
import GraphPage from './pages/GraphPage';
import CoursePage from './pages/CoursePage';
import GeneratePage from './pages/GeneratePage';
import StudentDataPage from './pages/StudentDataPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';

// ─── Route guards ─────────────────────────────────────────────────────────────

/** Requires a valid session. Professor-only routes redirect students to /courses. */
const ProtectedRoute: React.FC<{
  element: React.ReactElement;
  professorOnly?: boolean;
}> = ({ element, professorOnly }) => {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/login" replace />;
  if (professorOnly && auth.role === 'student') return <Navigate to="/courses" replace />;
  return element;
};

// ─── Routes ──────────────────────────────────────────────────────────────────

const AppRoutes: React.FC = () => {
  const { auth } = useAuth();

  return (
    <Routes>
      {/* Public */}
      <Route
        path="/login"
        element={auth ? <Navigate to="/courses" replace /> : <LoginPage />}
      />

      {/* Root redirect */}
      <Route
        path="/"
        element={<Navigate to={auth ? '/courses' : '/login'} replace />}
      />

      {/* Shared (professor + student) */}
      <Route path="/courses"      element={<ProtectedRoute element={<CoursesPage />} />} />
      <Route path="/course/:id"   element={<ProtectedRoute element={<CoursePage />} />} />
      <Route path="/graph"        element={<ProtectedRoute element={<GraphPage />} />} />

      {/* Professor only */}
      <Route path="/generate"     element={<ProtectedRoute element={<GeneratePage />}     professorOnly />} />
      <Route path="/student-data" element={<ProtectedRoute element={<StudentDataPage />}  professorOnly />} />
      <Route path="/settings"     element={<ProtectedRoute element={<SettingsPage />}     professorOnly />} />
    </Routes>
  );
};

// ─── Root ─────────────────────────────────────────────────────────────────────

const App: React.FC = () => (
  <AuthProvider>
    <AppRoutes />
  </AuthProvider>
);

export default App;
