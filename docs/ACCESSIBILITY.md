# Accessibility check (first pass)

An advisory, automated first-pass check of course materials against the parts of
WCAG 2.1 that can be tested automatically. It assesses the **materials**, not learners
or instructors.

> Automated checks cover only part of WCAG and cannot show that a document is
> accessible. This tool never reports "WCAG compliant". Manual review (screen reader,
> keyboard use, caption quality) is still required.

## Usage

`POST /api/materials/accessibility-check` — multipart `file` (`.html`, `.htm`, `.docx`),
optional `course_id`. Returns findings grouped by severity (`high`, `medium`, `low`). Each
finding has `location`, `wcag_criterion`, `wcag_name`, `message` and `suggested_fix`. With
no findings the summary is "No automated findings." and the manual-review reminder is
still included.

With `course_id`, findings are saved as pending advisory recommendations
(`change_log`, `change_type='accessibility_check'`) and reviewed through the same
accept / reject / revise flow as other suggestions:

- `GET /api/materials/accessibility-check/<course_id>`
- `POST /api/materials/accessibility-check/<finding_id>/decision`

## What is checked

| Check | WCAG 2.1 | HTML | DOCX |
|---|---|---|---|
| Image without alt text (`alt=""` accepted as decorative) | 1.1.1 | yes | yes |
| Skipped heading levels / no headings in a long document | 1.3.1, 2.4.6 | yes | yes (Heading styles) |
| Vague or empty link text ("click here", "read more") | 2.4.4 | yes | yes |
| Table without header cells | 1.3.1 | `<th>` | header row flag |
| Document language not set | 3.1.1 | `lang` | language property/run |
| Text colour contrast, explicit colours only | 1.4.3 | inline styles | run colours |
| Video with no captions track (`<video>`) | 1.2.2 | yes | — |
| Video link (YouTube, Vimeo, .mp4 …) with no caption/transcript mention | 1.2.2 | yes | yes |

## What is not checked

- PDF and PPTX (later steps); other formats are rejected as unsupported.
- Contrast from CSS stylesheets, themes, images or gradients; a white background is
  assumed when none is set explicitly. Large text uses the 3:1 threshold only when size is explicit.
- Whether alt text, link text or headings are actually meaningful.
- Reading order, keyboard operation, focus, forms, ARIA correctness, merged/nested table structure.
- Caption accuracy, transcripts' existence, audio description (1.2.3+).
- Anything requiring rendering or assistive technology.

## Implementation notes

Uses BeautifulSoup (HTML, new dependency `beautifulsoup4`) and python-docx (already
present). No lightweight Python WCAG checker handles DOCX, and browser-based engines such
as axe-core would add a heavy runtime, so the rules are small, explicit and each cites its
criterion. Tests use synthetic documents only: `backend/tests/test_accessibility_check.py`.
