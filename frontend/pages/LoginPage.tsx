/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, Github } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../context/AuthContext';

type Workspace = 'academic' | 'enterprise';

const ROLE_OPTIONS: Record<Workspace, { value: Role; label: string }[]> = {
  academic: [
    { value: 'professor', label: 'Professor' },
    { value: 'student', label: 'Student' },
  ],
  enterprise: [
    { value: 'enterprise_admin', label: 'Admin' },
    { value: 'enterprise_user', label: 'User' },
  ],
};

const LoginPage: React.FC = () => {
  const { login, theme, toggleTheme } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole]         = useState<Role>('professor');
  const [workspace, setWorkspace] = useState<Workspace>('academic');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const isDark = theme === 'dark';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError('');
    // Simulated auth delay — any credentials pass
    await new Promise(r => setTimeout(r, 500));
    login(email.trim(), role);
    navigate(workspace === 'enterprise' ? '/enterprise' : '/courses');
  };

  const selectWorkspace = (next: Workspace) => {
    setWorkspace(next);
    setRole(ROLE_OPTIONS[next][0].value);
  };

  return (
    <div className={`min-h-screen flex flex-col transition-colors ${
      isDark ? 'bg-stone-900 text-stone-100' : 'bg-[#f5f0e8] text-stone-900'
    }`}>

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-2 px-6 py-4">

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className={`p-2 rounded-lg transition-colors ${
            isDark
              ? 'text-stone-400 hover:text-stone-100 hover:bg-stone-700'
              : 'text-stone-500 hover:text-stone-900 hover:bg-stone-200'
          }`}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Academic / Enterprise workspace selector */}
        <div className={`flex rounded-lg p-0.5 ${isDark ? 'bg-stone-800' : 'bg-stone-200'}`}>
          {(['academic', 'enterprise'] as Workspace[]).map(option => (
            <button
              key={option}
              type="button"
              onClick={() => selectWorkspace(option)}
              aria-pressed={workspace === option}
              className={`px-3 py-1.5 text-sm font-medium rounded-md capitalize transition-all ${
                workspace === option
                  ? 'bg-amber-500 text-white shadow-sm'
                  : isDark
                    ? 'text-stone-400 hover:text-stone-200'
                    : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        {/* GitHub */}
        <a
          href="https://github.com/Schlaflied/Plot-Ark"
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            isDark
              ? 'border-stone-600 text-stone-300 hover:bg-stone-700'
              : 'border-stone-300 text-stone-700 hover:bg-stone-100'
          }`}
        >
          <Github size={15} />
          Github
        </a>
      </div>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-16">

        {/* Logo */}
        <img
          src="/Logo_Agentic.png"
          alt="Plot Ark"
          className="w-16 h-16 mb-6 opacity-90"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />

        {/* Heading */}
        <div className="text-center mb-8">
          <h1
            className={`mb-3 ${isDark ? 'text-stone-100' : 'text-stone-800'}`}
            style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
          >
            <span
              className="block font-light tracking-widest uppercase text-sm mb-2"
              style={{ letterSpacing: '0.25em', color: isDark ? '#a8a29e' : '#78716c' }}
            >
              Welcome to
            </span>
            <span
              className="block leading-none"
              style={{ fontSize: '3.2rem', fontWeight: 300, letterSpacing: '-0.01em' }}
            >
              Plot{' '}
              <em
                className="not-italic font-semibold"
                style={{ color: '#C5A028' }}
              >
                Ark
              </em>
            </span>
          </h1>
          <p
            className="text-sm font-light max-w-xs mx-auto leading-relaxed"
            style={{ color: isDark ? '#a8a29e' : '#78716c' }}
          >
            {workspace === 'academic'
              ? "Agentic curriculum engine — pedagogy-grounded course design powered by Bloom's Taxonomy and evidence-based research."
              : 'Learning content observability — connect training evidence, diagnose friction, and improve the next version.'}
          </p>
        </div>

        {/* Workspace-specific role selector */}
        <div className="mb-4 text-center">
          <p className={`mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] ${isDark ? 'text-stone-500' : 'text-stone-400'}`}>
            {workspace === 'academic' ? 'Academic access' : 'Enterprise access'}
          </p>
          <div className={`inline-flex rounded-xl p-1 ${isDark ? 'bg-stone-800' : 'bg-stone-200/80'}`}>
            {ROLE_OPTIONS[workspace].map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRole(option.value)}
                aria-pressed={role === option.value}
                className={`min-w-24 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                  role === option.value
                    ? 'bg-white text-amber-700 shadow-sm'
                    : isDark
                      ? 'text-stone-400 hover:text-stone-200'
                      : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Login card */}
        <form
          onSubmit={handleSubmit}
          className={`w-full max-w-sm rounded-2xl border overflow-hidden shadow-sm ${
            isDark ? 'bg-stone-800 border-stone-700' : 'bg-white border-stone-200'
          }`}
        >
          {/* Email field */}
          <div className={`border-b ${isDark ? 'border-stone-700' : 'border-stone-200'}`}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              className={`w-full px-5 py-4 text-sm bg-transparent outline-none placeholder:text-stone-400 ${
                isDark ? 'text-stone-100' : 'text-stone-900'
              }`}
              autoComplete="email"
            />
          </div>

          {/* Password field */}
          <div className={error ? `border-b ${isDark ? 'border-stone-700' : 'border-stone-200'}` : ''}>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              className={`w-full px-5 py-4 text-sm bg-transparent outline-none placeholder:text-stone-400 ${
                isDark ? 'text-stone-100' : 'text-stone-900'
              }`}
              autoComplete="current-password"
            />
          </div>

          {/* Inline error */}
          {error && (
            <div className={`px-5 py-2.5 text-xs border-b ${
              isDark
                ? 'text-red-400 bg-red-900/20 border-red-800'
                : 'text-red-600 bg-red-50 border-red-100'
            }`}>
              {error}
            </div>
          )}

          {/* Submit */}
          <div className="px-5 py-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>

        {/* Role hint */}
        <p className={`mt-4 text-xs ${isDark ? 'text-stone-500' : 'text-stone-400'}`}>
          Signing in to <span className="font-semibold text-stone-500 capitalize">{workspace}</span> as{' '}
          <span className="font-semibold text-amber-500">
            {ROLE_OPTIONS[workspace].find(option => option.value === role)?.label}
          </span>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
