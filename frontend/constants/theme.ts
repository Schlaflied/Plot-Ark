/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ---- Shared theme constants ----

export const DARK_BG = '#f5f0e8';
export const PANEL_BG = '#ede8de';
export const BORDER_COLOR = '#d4cfc5';
export const TEXT_PRIMARY = '#1a1a2e';
export const TEXT_MUTED = '#6b6560';
export const ACCENT = '#8B5E3C';

/** Map degree (0..maxDegree) to a warm brown palette */
export function degreeToColor(degree: number, maxDegree: number): string {
  const t = maxDegree > 0 ? degree / maxDegree : 0;
  const r = Math.round(196 + t * (92 - 196));
  const g = Math.round(168 + t * (51 - 168));
  const b = Math.round(130 + t * (23 - 130));
  return `rgb(${r},${g},${b})`;
}

/** Strip markdown formatting for plain-text display */
export function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\[(\d+)\]/g, '')
    .replace(/ - /g, '\n• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Slugify a name for use as a URL-safe key */
export function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}
