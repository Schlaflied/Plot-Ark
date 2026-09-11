/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import type { Role } from './context/AuthContext';
import CoursesPage from './pages/CoursesPage';
import GraphPage from './pages/GraphPage';
import CoursePage from './pages/CoursePage';
import GeneratePage from './pages/GeneratePage';
import StudentDataPage from './pages/StudentDataPage';
import SettingsPage from './pages/SettingsPage';
import StudentProfilePage from './pages/StudentProfilePage';
import LoginPage from './pages/LoginPage';

const EnterprisePage = React.lazy(() => import('./pages/EnterprisePage'));

// ─── Route guards ─────────────────────────────────────────────────────────────

const landingForRole = (role: Role): string => (
  role === 'enterprise_admin' || role === 'enterprise_user' ? '/enterprise' : '/courses'
);

/** Requires a valid session and keeps academic and enterprise roles isolated. */
const ProtectedRoute: React.FC<{
  element: React.ReactElement;
  allowedRoles: Role[];
}> = ({ element, allowedRoles }) => {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(auth.role)) return <Navigate to={landingForRole(auth.role)} replace />;
  return element;
};

// ─── Routes ──────────────────────────────────────────────────────────────────

const AppRoutes: React.FC = () => {
  const { auth } = useAuth();
  const academicRoles: Role[] = ['professor', 'student'];
  const enterpriseRoles: Role[] = ['enterprise_admin', 'enterprise_user'];

  return (
    <Routes>
      {/* Public */}
      <Route
        path="/login"
        element={auth ? <Navigate to={landingForRole(auth.role)} replace /> : <LoginPage />}
      />

      {/* Root redirect */}
      <Route
        path="/"
        element={<Navigate to={auth ? landingForRole(auth.role) : '/login'} replace />}
      />

      {/* Shared (professor + student) */}
      <Route path="/courses"      element={<ProtectedRoute element={<CoursesPage />} allowedRoles={academicRoles} />} />
      <Route path="/course/:id"   element={<ProtectedRoute element={<CoursePage />} allowedRoles={academicRoles} />} />
      <Route path="/graph"        element={<ProtectedRoute element={<GraphPage />} allowedRoles={academicRoles} />} />

      {/* Professor only */}
      <Route path="/generate"     element={<ProtectedRoute element={<GeneratePage />} allowedRoles={['professor']} />} />
      <Route path="/student-data" element={<ProtectedRoute element={<StudentDataPage />} allowedRoles={['professor']} />} />
      <Route path="/settings"     element={<ProtectedRoute element={<SettingsPage />} allowedRoles={['professor']} />} />
      <Route
        path="/enterprise"
        element={(
          <ProtectedRoute
            allowedRoles={enterpriseRoles}
            element={(
              <React.Suspense fallback={<div className="min-h-screen bg-[#F6F4EF] p-8 text-sm text-stone-500">Loading Enterprise L&amp;D…</div>}>
                <EnterprisePage />
              </React.Suspense>
            )}
          />
        )}
      />

      {/* Student only */}
      <Route path="/profile"      element={<ProtectedRoute element={<StudentProfilePage />} allowedRoles={['student']} />} />
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
