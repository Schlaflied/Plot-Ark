/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export type Role = 'professor' | 'student';
export type Theme = 'light' | 'dark';

export interface AuthState {
  token: string;
  role: Role;
  email: string;
}

interface AuthContextValue {
  auth: AuthState | null;
  theme: Theme;
  login: (email: string, role: Role) => void;
  logout: () => void;
  toggleTheme: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'plotark_token';
const ROLE_KEY  = 'plotark_role';
const EMAIL_KEY = 'plotark_email';
const THEME_KEY = 'plotark_theme';

/** Generates a fake JWT-shaped token (header.payload.sig) — never verified server-side. */
function generateToken(email: string, role: Role): string {
  const header  = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub: email, role, iat: Date.now(), exp: Date.now() + 86400_000 }));
  const sig     = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return `${header}.${payload}.${sig}`;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [auth, setAuth] = useState<AuthState | null>(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const role  = localStorage.getItem(ROLE_KEY) as Role | null;
    const email = localStorage.getItem(EMAIL_KEY);
    if (token && role && email) return { token, role, email };
    return null;
  });

  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem(THEME_KEY) as Theme) || 'light';
  });

  // Sync dark class on mount
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, []);

  const login = useCallback((email: string, role: Role) => {
    const token = generateToken(email, role);
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ROLE_KEY, role);
    localStorage.setItem(EMAIL_KEY, email);
    setAuth({ token, role, email });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(EMAIL_KEY);
    setAuth(null);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next: Theme = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem(THEME_KEY, next);
      document.documentElement.classList.toggle('dark', next === 'dark');
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ auth, theme, login, logout, toggleTheme }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
