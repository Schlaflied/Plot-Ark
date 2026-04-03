/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import type { QueryHistoryItem } from '../components/QueryPanel';

interface GraphNodeLike {
  id: string;
  label?: string;
  x?: number;
  y?: number;
}

interface UseQueryOptions {
  activeSubject: string;
  graphData: { nodes: any[]; links: any[] } | null;
  fgRef: React.MutableRefObject<any>;
  setSelectedNode: (node: any | null) => void;
  setActiveSubject: (subject: string) => void;
}

export function useQuery({ activeSubject, graphData, fgRef, setSelectedNode, setActiveSubject }: UseQueryOptions) {
  const [question, setQuestion] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryAnswer, setQueryAnswer] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>(() => {
    try {
      const stored = localStorage.getItem('plot_ark_query_history');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [showHistory, setShowHistory] = useState(false);

  // Persist queryHistory to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('plot_ark_query_history', JSON.stringify(queryHistory));
    } catch {}
  }, [queryHistory]);

  const panToNode = (node: any) => {
    setSelectedNode(node);
    setTimeout(() => {
      const n = node as GraphNodeLike;
      if (fgRef.current && n.x != null && n.y != null) {
        fgRef.current.centerAt(n.x, n.y, 800);
        fgRef.current.zoom(3, 800);
      }
    }, 150);
  };

  const findMatchedNode = (matchedNodeId: string | null, questionText: string) => {
    if (matchedNodeId === null || !graphData) return null;
    return (
      graphData.nodes.find((n: any) => String(n.id) === matchedNodeId) ??
      graphData.nodes.find((n: any) => (n as GraphNodeLike).label?.toLowerCase() === questionText.toLowerCase())
    ) ?? null;
  };

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setQueryLoading(true);
    setQueryAnswer(null);
    setQueryError(null);
    try {
      const res = await fetch('/api/graph/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          mode: 'hybrid',
          subject: activeSubject === 'all' ? 'business-law' : activeSubject,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const answer = data.answer ?? JSON.stringify(data);
      setQueryAnswer(answer);

      const matchedNodeId: string | null = data.matched_node_id ?? null;
      setQueryHistory(prev => [{
        id: Date.now(),
        question: question.trim(),
        answer,
        subject: activeSubject,
        starred: false,
        matchedNodeId,
        timestamp: Date.now(),
      }, ...prev].slice(0, 20));

      const matchedNode = findMatchedNode(matchedNodeId, question.trim());
      if (matchedNode) panToNode(matchedNode);
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setQueryLoading(false);
    }
  };

  const handleHistoryClick = (item: { question: string; answer: string; subject: string; matchedNodeId: string | null }) => {
    setQuestion(item.question);
    setQueryAnswer(item.answer);
    setActiveSubject(item.subject);

    const matchedNode = findMatchedNode(item.matchedNodeId, item.question);
    if (matchedNode) panToNode(matchedNode);
  };

  return {
    question, setQuestion,
    queryLoading, queryAnswer, queryError,
    queryHistory, setQueryHistory,
    showHistory, setShowHistory,
    handleQuery, handleHistoryClick,
  };
}
