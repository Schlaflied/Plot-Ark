/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X } from 'lucide-react';
import { DARK_BG, PANEL_BG, BORDER_COLOR, TEXT_PRIMARY, TEXT_MUTED, ACCENT } from '../constants/theme';

export interface NodeDetailPanelProps {
  node: {
    id: string;
    label: string;
    description: string;
    degree?: number;
  };
  onClose: () => void;
}

const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({ node, onClose }) => {
  return (
    <div
      className="flex flex-col"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        height: '100%',
        width: '280px',
        zIndex: 10,
        borderLeft: `1px solid ${BORDER_COLOR}`,
        background: PANEL_BG,
        overflowY: 'auto',
      }}
    >
      <div
        className="flex items-start justify-between p-4"
        style={{ borderBottom: `1px solid ${BORDER_COLOR}` }}
      >
        <div className="flex-1 min-w-0">
          <div
            className="text-xs font-semibold tracking-widest uppercase mb-1"
            style={{ color: ACCENT }}
          >
            Node Detail
          </div>
          <h3
            className="text-base font-semibold leading-snug"
            style={{ color: TEXT_PRIMARY, wordBreak: 'break-word' }}
          >
            {node.label}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="ml-2 mt-0.5 shrink-0"
          style={{ color: TEXT_MUTED, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest mb-1" style={{ color: TEXT_MUTED }}>ID</div>
          <div className="text-xs font-mono px-2 py-1 rounded truncate" style={{ background: DARK_BG, color: TEXT_MUTED }}>
            {String(node.id)}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-widest mb-1" style={{ color: TEXT_MUTED }}>Connections</div>
          <div className="text-sm" style={{ color: TEXT_PRIMARY }}>{node.degree ?? 0}</div>
        </div>

        {node.description && (
          <div>
            <div className="text-xs uppercase tracking-widest mb-1.5" style={{ color: TEXT_MUTED }}>Description</div>
            <p className="text-sm leading-relaxed" style={{ color: TEXT_PRIMARY }}>{node.description}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default NodeDetailPanel;
