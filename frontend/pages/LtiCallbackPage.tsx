/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../context/AuthContext';

/** Landing page for an LTI 1.3 launch: trades the one-time code for an identity,
 *  then reuses the existing login() so the rest of the app behaves as usual. */
const LtiCallbackPage: React.FC = () => {
  const [params] = useSearchParams();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const code = params.get('code');
    if (!code) { setError('Missing launch code.'); return; }
    fetch('/api/lti/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Launch failed');
        login(data.email, data.role as Role);
        navigate(typeof data.path === 'string' && data.path.startsWith('/') ? data.path : '/courses', { replace: true });
      })
      .catch(e => setError(e.message));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center text-sm">
      {error ? `LTI launch failed: ${error}` : 'Signing you in from your LMS…'}
    </div>
  );
};

export default LtiCallbackPage;
