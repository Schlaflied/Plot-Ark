/**
 * Course export utilities — PDF, Markdown, HTML, citation formatting.
 * Extracted from CoursePage.tsx for maintainability.
 */

import jsPDF from 'jspdf';

// ─── Types (re-exported for consumers) ────────────────────────────────────────

export interface Reading {
  title: string;
  url?: string;
  type?: string;
  estimated_time?: string;
  key_points: string[];
  rationale: string;
  reading_type?: 'required' | 'optional';
}

export interface Assignment {
  title: string;
  type: string;
  coverage?: string;
  task_description?: string;
  deliverable?: string;
  estimated_time?: string;
  covers_objectives?: string;
  rubric_highlights?: string[];
}

export interface Module {
  title: string;
  complexity_level: number;
  learning_objectives: string[];
  narrative_preview: string;
  recommended_readings: Reading[];
  assignments: Assignment[];
  teaching_suggestions?: string[];
  learning_suggestions?: string[];
}

export interface Source {
  title?: string;
  url: string;
  domain: string;
  type?: string;
  estimated_time?: string;
  retrieved_at: string;
}

export interface CourseDetail {
  topic: string;
  level: string;
  audience?: string;
  course_code: string;
  course_type: string;
  modules: Module[];
  sources: Source[];
}

// ─── Citation Formatting ──────────────────────────────────────────────────────

export function formatCitation(
  src: Source,
  format: 'apa' | 'mla' | 'chicago',
): string {
  const title = src.title || src.domain;
  const domain = src.domain;
  const year =
    new Date(src.retrieved_at).getFullYear() || new Date().getFullYear();
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

  if (format === 'apa') {
    return `${title}. (${year}). Retrieved from ${src.url}`;
  } else if (format === 'mla') {
    return `"${title}." ${domain}, ${year}, ${src.url}.`;
  } else {
    return `"${title}." ${domain}. Accessed ${today}. ${src.url}.`;
  }
}

// ─── Markdown Generation ──────────────────────────────────────────────────────

export function generateMarkdown(curriculum: CourseDetail): string {
  const lines: string[] = [
    `# ${curriculum.topic}`,
    `**Level:** ${curriculum.level} | **Type:** ${curriculum.course_type} | **Code:** ${curriculum.course_code}`,
    '',
  ];

  curriculum.modules.forEach((mod, i) => {
    lines.push(`## Module ${i + 1}: ${mod.title}`);
    lines.push(`**Complexity:** ${mod.complexity_level}/5`);
    lines.push('');
    if (mod.narrative_preview) {
      lines.push(`> ${mod.narrative_preview}`);
      lines.push('');
    }
    if (mod.learning_objectives?.length) {
      lines.push('**Learning Objectives**');
      mod.learning_objectives.forEach((o) => lines.push(`- ${o}`));
      lines.push('');
    }
    if (mod.recommended_readings?.length) {
      lines.push('**Resources**');
      mod.recommended_readings.forEach((r) => {
        lines.push(`- [${r.title}](${r.url || '#'}) *(${r.type || 'reading'})*`);
      });
      lines.push('');
    }
    if (mod.assignments?.length) {
      lines.push('**Assessment**');
      mod.assignments.forEach((a) =>
        lines.push(`- **${a.type}:** ${a.title}`),
      );
      lines.push('');
    }
  });

  if (curriculum.sources?.length) {
    lines.push('---');
    lines.push('## Sources');
    curriculum.sources.forEach((s) =>
      lines.push(`- [${s.title || s.domain}](${s.url})`),
    );
  }

  return lines.join('\n');
}

// ─── HTML Generation ──────────────────────────────────────────────────────────

export function generateCurriculumHTML(curriculum: CourseDetail): string {
  const modules = curriculum.modules ?? [];

  const moduleSections = modules
    .map((mod, i) => {
      const objectives = (mod.learning_objectives || [])
        .map((o) => `<li>${o}</li>`)
        .join('');

      const readings = (mod.recommended_readings || [])
        .map((r) => {
          const link = r.url ? `<a href="${r.url}">${r.title}</a>` : r.title;
          return `<li>${link}</li>`;
        })
        .join('');

      const assignments = (mod.assignments || [])
        .map(
          (a) =>
            `<div class="assessment"><strong>${a.title}</strong><p>${a.task_description || a.coverage || ''}</p></div>`,
        )
        .join('');

      return `
      <div class="module">
        <h2>Module ${i + 1}: ${mod.title}</h2>
        ${objectives ? `<h3>Learning Objectives</h3><ul>${objectives}</ul>` : ''}
        ${readings ? `<h3>Readings</h3><ul>${readings}</ul>` : ''}
        ${assignments ? `<h3>Assessment</h3>${assignments}` : ''}
      </div>
    `;
    })
    .join('');

  const sources = (curriculum.sources ?? [])
    .map((s) => `<li><a href="${s.url}">${s.title || s.domain}</a></li>`)
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${curriculum.topic}</title>
<style>
  body { font-family: Georgia, serif; max-width: 740px; margin: 40px auto; padding: 0 32px; color: #1a1a1a; font-size: 14px; line-height: 1.7; }
  .meta { color: #888; font-size: 12px; margin-bottom: 40px; border-bottom: 1px solid #eee; padding-bottom: 16px; }
  h1 { font-size: 26px; font-weight: bold; margin-bottom: 6px; }
  h2 { font-size: 18px; color: #92400e; margin-top: 36px; margin-bottom: 8px; border-bottom: 1px solid #f0e6d3; padding-bottom: 4px; }
  h3 { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; color: #555; margin-top: 16px; margin-bottom: 6px; }
  ul { margin: 0 0 12px 0; padding-left: 20px; }
  li { margin-bottom: 4px; }
  a { color: #92400e; }
  .assessment { background: #fafafa; border-left: 3px solid #d97706; padding: 10px 14px; margin-top: 8px; border-radius: 2px; }
  .assessment strong { display: block; margin-bottom: 4px; }
  .assessment p { margin: 0; color: #555; font-size: 13px; }
  .module { margin-bottom: 32px; }
  .sources { margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
  <h1>${curriculum.topic}</h1>
  <div class="meta">${curriculum.level} · ${curriculum.course_type} · ${modules.length} modules</div>
  ${moduleSections}
  ${sources ? `<div class="sources"><h3>Sources</h3><ul>${sources}</ul></div>` : ''}
</body>
</html>`;
}

// ─── PDF Export ────────────────────────────────────────────────────────────────

export function exportPDF(
  curriculum: CourseDetail,
  citationFormat: 'apa' | 'mla' | 'chicago',
): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 56;
  const contentW = pageW - margin * 2;
  let y = margin;

  const checkPage = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(28, 25, 23);
  doc.text(curriculum.topic, margin, y);
  y += 28;

  // Meta
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(120, 113, 108);
  doc.text(
    `${curriculum.level} · ${curriculum.course_type} · ${(curriculum.modules || []).length} modules`,
    margin,
    y,
  );
  y += 24;

  // Divider
  doc.setDrawColor(220, 215, 210);
  doc.line(margin, y, pageW - margin, y);
  y += 20;

  (curriculum.modules || []).forEach((mod, i) => {
    checkPage(60);

    // Module heading
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(146, 64, 14);
    const heading = `Module ${i + 1}: ${mod.title}`;
    const headingLines = doc.splitTextToSize(heading, contentW);
    doc.text(headingLines, margin, y);
    y += headingLines.length * 18 + 10;

    // Learning Objectives
    if (mod.learning_objectives?.length) {
      checkPage(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(80, 73, 68);
      doc.text('LEARNING OBJECTIVES', margin, y);
      y += 14;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(40, 36, 33);
      mod.learning_objectives.forEach((obj) => {
        checkPage(20);
        const lines = doc.splitTextToSize(`• ${obj}`, contentW - 10);
        doc.text(lines, margin + 6, y);
        y += lines.length * 14 + 2;
      });
      y += 6;
    }

    // Readings
    if (mod.recommended_readings?.length) {
      checkPage(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(80, 73, 68);
      doc.text('READINGS', margin, y);
      y += 14;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(40, 36, 33);
      mod.recommended_readings.forEach((r) => {
        checkPage(20);
        const lines = doc.splitTextToSize(`• ${r.title}`, contentW - 10);
        doc.text(lines, margin + 6, y);
        y += lines.length * 14 + 2;
      });
      y += 6;
    }

    // Assessment
    if (mod.assignments?.length) {
      checkPage(40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(80, 73, 68);
      doc.text('ASSESSMENT', margin, y);
      y += 14;
      mod.assignments.forEach((a) => {
        checkPage(30);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(40, 36, 33);
        doc.text(a.title, margin + 6, y);
        y += 14;
        const desc = a.task_description || a.coverage || '';
        if (desc) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(90, 82, 76);
          const lines = doc.splitTextToSize(desc, contentW - 10);
          checkPage(lines.length * 13);
          doc.text(lines, margin + 6, y);
          y += lines.length * 13 + 4;
        }
      });
      y += 6;
    }

    y += 16;
  });

  // References
  const allSources: Source[] = curriculum.sources ?? [];
  if (allSources.length > 0) {
    checkPage(60);
    doc.setDrawColor(220, 215, 210);
    doc.line(margin, y, pageW - margin, y);
    y += 20;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(146, 64, 14);
    doc.text('References', margin, y);
    y += 20;
    allSources.forEach((src) => {
      const citation = formatCitation(src, citationFormat);
      checkPage(24);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(40, 36, 33);
      const citLines = doc.splitTextToSize(citation, contentW);
      doc.text(citLines, margin, y);
      y += citLines.length * 13 + 4;
    });
  }

  const filename = `${(curriculum.topic || 'course').replace(/\s+/g, '_').slice(0, 40)}_curriculum.pdf`;
  doc.save(filename);
}

// ─── File Download Helpers ────────────────────────────────────────────────────

export function downloadJSON(curriculum: CourseDetail): void {
  const blob = new Blob([JSON.stringify(curriculum, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(curriculum.topic || 'course').replace(/\s+/g, '_').slice(0, 40)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadMarkdown(curriculum: CourseDetail): void {
  const blob = new Blob([generateMarkdown(curriculum)], {
    type: 'text/markdown',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(curriculum.topic || 'course').replace(/\s+/g, '_').slice(0, 40)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadDOCX(curriculum: CourseDetail): void {
  const html = generateCurriculumHTML(curriculum);
  const blob = new Blob([html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(curriculum.topic || 'course').replace(/\s+/g, '_').slice(0, 40)}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyMarkdownToClipboard(
  curriculum: CourseDetail,
): Promise<void> {
  await navigator.clipboard.writeText(generateMarkdown(curriculum));
}
