/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { Component } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

class ErrorBoundary extends Component<{children: React.ReactNode}, {error: Error | null}> {
  constructor(props: {children: React.ReactNode}) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) return (
      <div style={{padding:40,fontFamily:'monospace',background:'#fff',color:'#c00',minHeight:'100vh',fontSize:14}}>
        <h2>Render Error</h2>
        <pre style={{whiteSpace:'pre-wrap',wordBreak:'break-all',marginTop:16}}>
          {this.state.error.message}{'\n\n'}{this.state.error.stack}
        </pre>
      </div>
    );
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
