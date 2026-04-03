"""
Prompt Builder — centralized AI prompt templates for curriculum generation.

All three generation modes (full generate, skeleton, expand) have their
prompt construction logic here so curriculum routes stay lean.
"""

import json

from constants import (
    get_blooms_level, get_blooms_constraint, get_session_constraints,
    ASSESSMENT_FORMATS,
)


# ── Shared helpers ─────────────────────────────────────────────────────────────

RESOURCE_PRIORITY_PROMPT = {
    "project": "RESOURCE PRIORITY: Each module's recommended_readings MUST include at least 1 news or industry source (HBR, Economist, NYT, etc.) alongside academic sources. Real-world cases are essential for project-based courses.",
    "essay": "RESOURCE PRIORITY: Prioritize academic sources. Add video (TED Talk, lecture) and news sources where they strengthen the argument. Never omit academic sources.",
    "debate": "RESOURCE PRIORITY: Each module MUST include at least 1 current news or policy source to support debate positions. Mix with academic sources for theoretical grounding.",
    "lab": "RESOURCE PRIORITY: Each module MUST include at least 1 video resource (tutorial, demonstration, simulation walkthrough). Supplement with academic readings.",
    "mixed": "RESOURCE PRIORITY: Distribute resource types across modules — not every module should be academic-only. Mix academic, news (current events), and video across the curriculum.",
}


def _design_approach_block(design_approach: str):
    """Return (label, instructions, sam_module_field) for the given approach."""
    if design_approach == "sam":
        label = "SAM (Successive Approximation Model)"
        instructions = """
Design Approach — SAM (Successive Approximation Model):
- Frame each module with ITERATIVE checkpoints rather than fixed deliverables.
- Each module MUST include a "rapid_prototype_cycle" field: a brief description of the Rapid Prototype → Evaluate → Revise loop learners will go through.
- Assignments should be framed as low-stakes prototypes designed to be revised, not final submissions.
- The overall curriculum narrative should emphasize continuous iteration over linear completion.
"""
        sam_field = '"rapid_prototype_cycle": "Description of the Rapid Prototype → Evaluate → Revise cycle for this module.",'
    else:
        label = "ADDIE (Analysis → Design → Development → Implementation → Evaluation)"
        instructions = """
Design Approach — ADDIE (linear instructional design model):
- Follow the standard linear flow: Analysis → Design → Development → Implementation → Evaluation.
- Each module represents a discrete, completed stage of learning before the next begins.
- Assignments are summative deliverables that demonstrate mastery of that module's objectives.
"""
        sam_field = ""
    return label, instructions, sam_field


def _reading_priority_block(required_sources: list, optional_sources: list) -> str:
    """Return reading priority instructions based on source selection."""
    if required_sources or optional_sources:
        text = "\n\nReading Priority Instructions (based on instructor selection):\n"
        if required_sources:
            text += "REQUIRED readings — these MUST appear in modules as assigned readings:\n"
            for s in required_sources:
                text += f"  - {s['title']} | {s['url']}\n"
        if optional_sources:
            text += "OPTIONAL/supplementary readings — include where relevant but not mandatory:\n"
            for s in optional_sources:
                text += f"  - {s['title']} | {s['url']}\n"
        text += (
            "When assigning readings to modules:\n"
            "- Mark required readings with \"reading_type\": \"required\"\n"
            "- Mark optional readings with \"reading_type\": \"optional\"\n"
        )
        return text
    return (
        "\n\nFor each reading in recommended_readings, assign a reading_type field:\n"
        "- \"required\" if it directly covers the core concept of the module\n"
        "- \"optional\" if it is supplementary or extension material\n"
    )


def _sources_context_block(real_sources: list) -> str:
    """Return the sources context injected into prompts."""
    if not real_sources:
        return ""
    text = "\n\nReal sources found by research agent — use these URLs in your sources array (they are verified real):\n"
    for s in real_sources:
        priority_label = s.get("priority", "")
        priority_tag = f" [PRIORITY: {priority_label.upper()}]" if priority_label else ""
        text += f"- [{s['type']}]{priority_tag} {s['title']} | {s['url']}\n"
    text += "\nPrioritize these real URLs. You may add more you know with confidence, but do NOT invent URLs.\n"
    return text


# ── Prompt 1: Full curriculum generation ───────────────────────────────────────

def build_generate_prompt(
    *,
    topic: str,
    level: str,
    audience: str,
    accreditation_context: str,
    course_code: str,
    course_type: str,
    module_count: int,
    session_duration: int,
    design_approach: str,
    real_sources: list,
    required_sources: list,
    optional_sources: list,
) -> str:
    """Build the full curriculum generation prompt."""
    blooms = get_blooms_level(course_code, level)
    blooms_constraint = get_blooms_constraint(level)
    session_constraint = get_session_constraints(session_duration)
    assessment_format = ASSESSMENT_FORMATS.get(course_type, ASSESSMENT_FORMATS["mixed"])

    design_approach_label, design_approach_instructions, sam_module_field = _design_approach_block(design_approach)
    reading_priority_instructions = _reading_priority_block(required_sources, optional_sources)
    sources_context = _sources_context_block(real_sources)

    return f"""You are an expert curriculum designer applying evidence-based instructional design principles. Generate a rigorous, narrative-driven curriculum.

Topic: {topic}
Course Code: {course_code or "Not specified"}
Level: {level}
Target Audience: {audience}
Accreditation Context: {accreditation_context}
Course Type: {course_type}
Number of Modules: {module_count}
Design Approach: {design_approach_label}

Pedagogical Constraints:
- Bloom's Taxonomy Target: {blooms}
- Bloom's Verb Constraint: {blooms_constraint}
- Session Duration: {session_constraint}
- Assessment Format: {assessment_format}
- Difficulty Progression (i+1 principle, Krashen): complexity_level must start at 1 and reach 5 by the final module, increasing evenly — never jump more than 1 level per module.
- Cognitive Load (Sweller): Maximum 2 recommended readings per module. Each reading must have a clear rationale tied to that module's learning objectives.
- Not every module requires an assignment. When included, it must align with the module's Bloom's level and course type.
- Assignment task_description: MUST be specific and actionable (e.g. "Write a 500-word reflection comparing two case studies..."), NOT generic (e.g. "This assignment addresses the objectives of..."). Failing this instruction makes the output unusable.
- Assignment rubric_highlights: MUST contain exactly 3-4 concrete criteria describing what excellent work looks like for THIS specific task.
- Assignment estimated_time: MUST be realistic given the session duration constraint above. A 75-min session cannot have a 3-hour assignment.
{design_approach_instructions}{reading_priority_instructions}
{RESOURCE_PRIORITY_PROMPT.get(course_type, RESOURCE_PRIORITY_PROMPT["mixed"])}
Return ONLY valid JSON (no markdown, no explanation):
{{
  "design_approach": "{design_approach}",
  "session_duration_minutes": {session_duration},
  "modules": [
    {{
      "title": "Module title",
      "complexity_level": 1,
      "learning_objectives": ["objective using only the permitted Bloom's verbs for this level", "objective 2", "objective 3"],
      {sam_module_field}
      "narrative_preview": "A compelling 2-3 sentence narrative hook using metaphor, scenario, or challenge framing.",
      "recommended_readings": [
        {{
          "title": "Full title of reading (article, chapter, or textbook section) — complete, never truncated with '...'",
          "url": "https://real-url-from-sources-above.com",
          "type": "academic | video | news",
          "estimated_time": "15 min read | 20 min video | 10 min read",
          "reading_type": "required | optional",
          "key_points": ["key point 1", "key point 2"],
          "rationale": "Why this reading is essential for this module's specific learning objectives and why it is relevant to students' lives or careers."
        }}
      ],
      "assignments": [
        {{
          "type": "project | essay | quiz | discussion | presentation | lab | reflection",
          "title": "Short assignment title",
          "task_description": "2-3 sentence specific description of exactly what students must do. Must be concrete and actionable — NOT generic phrases like 'addresses the objectives of this module'.",
          "deliverable": "What they hand in — e.g. '1-page written reflection', '10-slide deck', 'in-class oral presentation (5 min)'",
          "estimated_time": "Realistic completion time given the session duration — e.g. '45 minutes', '2 hours'. Must match the session length constraint above.",
          "covers_objectives": "Which specific learning objectives from this module this assessment addresses.",
          "rubric_highlights": [
            "Criterion 1 — description of what good work looks like",
            "Criterion 2 — description of what good work looks like",
            "Criterion 3 — description of what good work looks like",
            "Criterion 4 — description of what good work looks like"
          ]
        }}
      ]
    }}
  ],
  "sources": [
    {{
      "title": "Full title of the paper, video, article, or resource — complete, never truncated with '...'",
      "url": "https://example.com",
      "domain": "example.com",
      "type": "academic | video | news",
      "estimated_time": "20 min read | 15 min video | 10 min read",
      "retrieved_at": "2026-03-16"
    }}
  ]
}}

CRITICAL REQUIREMENT — MODULE COUNT:
You MUST generate exactly {module_count} modules. No more, no fewer.
Before finalizing your response, count your modules and verify the count equals {module_count}.
If your count is wrong, fix it before responding.
Responses with incorrect module counts will be automatically rejected and regenerated.

complexity_level must start at 1 and reach 5 by the last module.

For sources: use the verified real URLs provided above. Add more real sources you know with confidence. Every URL must be real and accessible.{sources_context}"""


# ── Prompt 2: Skeleton generation ──────────────────────────────────────────────

def build_skeleton_prompt(
    *,
    topic: str,
    level: str,
    audience: str,
    accreditation_context: str,
    course_code: str,
    course_type: str,
    module_count: int,
    design_approach: str,
) -> str:
    """Build the skeleton-only (titles + objectives) prompt."""
    blooms_constraint = get_blooms_constraint(level)

    return f"""You are an expert curriculum designer. Generate ONLY the module skeleton for the following course.

Topic: {topic}
Course Code: {course_code or "Not specified"}
Level: {level}
Target Audience: {audience}
Accreditation Context: {accreditation_context or "None"}
Course Type: {course_type}
Number of Modules: {module_count}
Design Approach: {design_approach}

Bloom's Verb Constraint: {blooms_constraint}
Difficulty Progression: complexity_level must start at 1 and reach 5 by the final module, increasing evenly.

Generate the course skeleton. Include a course_narrative (2-3 sentences explaining the central question or theme of this course and why these modules belong together — the "story" of the whole course). For each module provide: module_number, title, complexity_level, learning_objectives (list of 2-3 objectives using the permitted Bloom's verbs). Nothing else — no readings, no assignments, no narrative_preview.

Return ONLY valid JSON (no markdown, no explanation):
{{
  "course_narrative": "A 2-3 sentence explanation of the course's central theme and why these modules belong together.",
  "modules": [
    {{
      "module_number": 1,
      "title": "Module title",
      "complexity_level": 1,
      "learning_objectives": ["objective using permitted Bloom's verbs", "objective 2"]
    }}
  ]
}}

CRITICAL: Generate exactly {module_count} modules. complexity_level must start at 1 and end at 5."""


# ── Prompt 3: Single-module expansion ──────────────────────────────────────────

def build_expand_prompt(
    *,
    topic: str,
    level: str,
    audience: str,
    accreditation_context: str,
    course_code: str,
    course_type: str,
    design_approach: str,
    session_duration: int,
    module_title: str,
    module_number: int,
    complexity_level: int,
    learning_objectives: list,
    total_modules: int,
    approved_sources: list,
) -> str:
    """Build the prompt for expanding a single skeleton module."""
    blooms_constraint = get_blooms_constraint(level)
    session_constraint = get_session_constraints(session_duration)
    assessment_format = ASSESSMENT_FORMATS.get(course_type, ASSESSMENT_FORMATS["mixed"])

    if design_approach == "sam":
        design_approach_label = "SAM (Successive Approximation Model)"
        sam_field = '"rapid_prototype_cycle": "Description of the Rapid Prototype → Evaluate → Revise cycle for this module.",'
    else:
        design_approach_label = "ADDIE (Analysis → Design → Development → Implementation → Evaluation)"
        sam_field = ""

    # Sources context
    sources_context = ""
    if approved_sources:
        real_sources = [s for s in approved_sources if s.get("url")]
        if real_sources:
            sources_context = "\n\nApproved sources from instructor — use these URLs for readings where relevant:\n"
            for s in real_sources:
                priority = s.get("priority", "optional")
                tag = " [REQUIRED]" if priority == "required" else " [OPTIONAL]"
                sources_context += f"- [{s.get('type', 'other')}]{tag} {s.get('title', '')} | {s.get('url', '')}\n"
            sources_context += "Prioritize required sources. Do NOT invent URLs.\n"

    resource_priority_map = {
        "project": "PRIORITY: recommended_readings should lean toward academic + news sources (real-world cases and current research). Include at least 1 news/industry source per module where relevant.",
        "essay": "PRIORITY: recommended_readings should lean toward academic sources. Include video (TED/lecture) and news where they support the argument. Minimum 1 academic per module.",
        "debate": "PRIORITY: recommended_readings should include news/current events AND academic sources to support multiple perspectives. At least 1 news source per module.",
        "lab": "PRIORITY: recommended_readings should lean heavily toward video resources (tutorials, demonstrations, walkthroughs). At least 1 video per module where possible.",
        "mixed": "PRIORITY: recommended_readings should include a balanced mix of academic, news, and video sources across modules.",
    }
    resource_priority = resource_priority_map.get(course_type, resource_priority_map["mixed"])

    objectives_str = "\n".join(f"  - {obj}" for obj in learning_objectives)

    return f"""You are an expert curriculum designer. Expand the following module skeleton into a full module with all required fields.

Course Context:
- Topic: {topic}
- Course Code: {course_code or "Not specified"}
- Level: {level}
- Target Audience: {audience}
- Accreditation: {accreditation_context or "None"}
- Course Type: {course_type}
- Design Approach: {design_approach_label}
- Total Modules in Course: {total_modules}

Module to Expand:
- Module Number: {module_number} of {total_modules}
- Title: {module_title}
- Complexity Level: {complexity_level}/5
- Learning Objectives:
{objectives_str}

Constraints:
- Bloom's Verb Constraint: {blooms_constraint}
- Session Duration: {session_constraint}
- Assessment Format: {assessment_format}
- Max 2 recommended readings. Each must have a clear rationale tied to this module's learning objectives.
- {resource_priority}
- Assignment task_description: MUST be specific and actionable (e.g. "Write a 500-word reflection comparing two case studies..."), NOT generic.
- Assignment rubric_highlights: MUST contain exactly 3-4 concrete criteria.
- Not every module requires an assignment. Only include one if it meaningfully fits this module.
- narrative_preview: A compelling 2-3 sentence narrative hook using metaphor, scenario, or challenge framing.{sources_context}

Return ONLY valid JSON for this single module (no markdown, no explanation):
{{
  "module_number": {module_number},
  "title": {json.dumps(module_title)},
  "complexity_level": {complexity_level},
  "learning_objectives": {json.dumps(learning_objectives)},
  {sam_field}
  "narrative_preview": "A compelling 2-3 sentence narrative hook.",
  "recommended_readings": [
    {{
      "title": "Full title of reading",
      "url": "https://real-url.com",
      "type": "academic | video | news",
      "estimated_time": "15 min read",
      "reading_type": "required | optional",
      "key_points": ["key point 1", "key point 2"],
      "rationale": "Why this reading is essential for this module."
    }}
  ],
  "assignments": [
    {{
      "type": "project | essay | quiz | discussion | presentation | lab | reflection",
      "title": "Short assignment title",
      "task_description": "2-3 sentence specific description of exactly what students must do.",
      "deliverable": "What they hand in",
      "estimated_time": "Realistic time given session duration",
      "covers_objectives": "Which specific learning objectives this addresses",
      "rubric_highlights": [
        "Criterion 1 — description of excellent work",
        "Criterion 2 — description of excellent work",
        "Criterion 3 — description of excellent work"
      ]
    }}
  ]
}}"""
