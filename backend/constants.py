"""Instructional design constants: Bloom's taxonomy, session constraints, assessment formats, resource types."""

import re

# ---------------------------------------------------------------------------
# Bloom's Taxonomy mapping
# ---------------------------------------------------------------------------

BLOOMS_BY_LEARNER_LEVEL = {
    "beginner": {
        "label": "Remember and Understand",
        "verbs": "define, identify, recall, describe, explain, summarize",
        "constraint": "Learning objectives MUST use only Remember and Understand verbs: define, identify, recall, describe, explain, summarize. Do NOT use Apply, Analyze, Evaluate, or Create verbs.",
    },
    "intermediate": {
        "label": "Apply and Analyze",
        "verbs": "apply, demonstrate, differentiate, compare, examine, solve",
        "constraint": "Learning objectives MUST use only Apply and Analyze verbs: apply, demonstrate, differentiate, compare, examine, solve. Do NOT use Remember, Understand, Evaluate, or Create verbs.",
    },
    "advanced": {
        "label": "Evaluate and Create",
        "verbs": "assess, critique, design, construct, argue, justify, synthesize",
        "constraint": "Learning objectives MUST use only Evaluate and Create verbs: assess, critique, design, construct, argue, justify, synthesize. Do NOT use Remember, Understand, Apply, or Analyze verbs.",
    },
}

LEVEL_TO_BLOOMS = {
    "undergraduate-year-1": "beginner",
    "undergraduate-year-2": "beginner",
    "undergraduate-year-3": "intermediate",
    "undergraduate-year-4": "intermediate",
    "master-year-1": "advanced",
    "master-year-2": "advanced",
    "master-year-3": "advanced",
    "doctoral": "advanced",
    "professional-beginner": "beginner",
    "professional-intermediate": "intermediate",
    "professional-advanced": "advanced",
    "esl-beginner": "beginner",
    "esl-intermediate": "intermediate",
    "esl-advanced": "advanced",
    "k12-elementary": "beginner",
    "k12-middle": "beginner",
    "k12-highschool": "intermediate",
}

_BLOOMS_TO_NARRATIVE = {
    "beginner": "Remember and Understand — definitions, identification, basic comprehension",
    "intermediate": "Apply and Analyze — case analysis, pattern recognition, comparative evaluation",
    "advanced": "Analyze, Evaluate, and Create — synthesis, critique, independent judgment, original work",
}


def get_blooms_level(course_code, level):
    if str(level) in LEVEL_TO_BLOOMS:
        return _BLOOMS_TO_NARRATIVE[LEVEL_TO_BLOOMS[str(level)]]
    num_match = re.search(r'\d{3}', str(course_code).upper())
    if num_match:
        num = int(num_match.group())
        if num < 200:
            return "Remember and Understand — definitions, identification, basic comprehension"
        elif num < 300:
            return "Understand and Apply — using concepts in familiar contexts, worked examples"
        elif num < 400:
            return "Apply and Analyze — case analysis, pattern recognition, comparative evaluation"
        else:
            return "Analyze, Evaluate, and Create — synthesis, critique, independent judgment, original work"
    level_lower = str(level).lower()
    if any(k in level_lower for k in ['graduate', 'phd', 'doctoral', 'master']):
        return "Analyze, Evaluate, and Create — advanced critical synthesis and original contribution"
    elif any(k in level_lower for k in ['senior', '4th', 'advanced']):
        return "Apply, Analyze, and Evaluate — critical analysis with some synthesis"
    return "Understand and Apply — foundational understanding with practical application"


def get_session_constraints(minutes):
    """Return a prompt instruction string based on session duration in minutes."""
    if minutes <= 75:
        return (
            "Session length: 75 minutes. "
            "Each module must be completable in 75 minutes. "
            "Max 1 required reading per module (≤15 min read). "
            "Assignments must be short and focused (≤30 min completion time). "
            "Prefer in-class discussion or quick reflection over lengthy projects."
        )
    elif minutes <= 90:
        return (
            "Session length: 90 minutes. "
            "Each module fits a standard 90-minute university class. "
            "Max 1-2 required readings per module (≤20 min read each). "
            "Assignments should be completable in 45-60 minutes."
        )
    else:
        return (
            f"Session length: {minutes} minutes (extended format). "
            "Each module covers more ground with deeper engagement. "
            "Up to 2-3 readings allowed per module. "
            "Assignments can include workshop components, group activities, or multi-part tasks. "
            "Include at least one in-class activity suggestion per module."
        )


def get_blooms_constraint(level):
    """Return Bloom's verb constraint based on beginner/intermediate/advanced learner level."""
    if str(level) in LEVEL_TO_BLOOMS:
        return BLOOMS_BY_LEARNER_LEVEL[LEVEL_TO_BLOOMS[str(level)]]["constraint"]
    level_lower = str(level).lower()
    if level_lower in BLOOMS_BY_LEARNER_LEVEL:
        return BLOOMS_BY_LEARNER_LEVEL[level_lower]["constraint"]
    if any(k in level_lower for k in ['begin', 'intro', 'foundation', '100', '1st', 'first']):
        return BLOOMS_BY_LEARNER_LEVEL["beginner"]["constraint"]
    if any(k in level_lower for k in ['advanc', 'senior', 'graduate', 'expert', 'master', 'phd', 'doctoral']):
        return BLOOMS_BY_LEARNER_LEVEL["advanced"]["constraint"]
    return BLOOMS_BY_LEARNER_LEVEL["intermediate"]["constraint"]


# ---------------------------------------------------------------------------
# Assessment formats by course type
# ---------------------------------------------------------------------------

ASSESSMENT_FORMATS = {
    "project": "project-based assignments (group projects, case studies, presentations, portfolios)",
    "essay": "essay-based assessments (argumentative essays, reflective journals, research papers)",
    "debate": "discussion-based formats (structured debates, Socratic seminars, roleplay scenarios)",
    "lab": "lab and simulation work (experiments, technical projects, lab reports, prototypes)",
    "mixed": "varied formats across modules (rotate between essays, projects, discussions, and activities)",
}

# ---------------------------------------------------------------------------
# Resource types for Tavily search
# ---------------------------------------------------------------------------

RESOURCE_TYPES = {
    "academic": {
        "domains": ["jstor.org", "researchgate.net", "academia.edu", "ncbi.nlm.nih.gov",
                    "springer.com", "tandfonline.com", "sagepub.com", "wiley.com",
                    "oxfordhandbooks.com", "cambridge.org", "scholar.google.com"],
        "queries": [
            "{topic} academic research {level}",
            "{topic} {audience} course materials",
            "{topic} key concepts textbook",
        ],
        "max_per_query": 3,
    },
    "video": {
        "domains": ["youtube.com", "ted.com", "coursera.org", "edx.org", "khanacademy.org"],
        "queries": [
            "{topic} lecture video course",
            "{topic} TED talk introduction",
        ],
        "max_per_query": 2,
    },
    "news": {
        "domains": ["hbr.org", "economist.com", "nytimes.com", "theguardian.com",
                    "mit.edu", "stanford.edu", "bbc.com"],
        "queries": [
            "{topic} analysis report {level}",
        ],
        "max_per_query": 2,
    },
}

# ---------------------------------------------------------------------------
# Credibility scoring domains
# ---------------------------------------------------------------------------

ACADEMIC_DOMAINS = [
    "jstor.org", "springer.com", "researchgate.net", "sciencedirect.com",
    "wiley.com", "pubmed.ncbi.nlm.nih.gov", "scholar.google.com", ".edu",
]
NEWS_DOMAINS = [
    "nytimes.com", "economist.com", "hbr.org", "theguardian.com",
    "bbc.com", "reuters.com", ".gov", ".gc.ca",
]
VIDEO_DOMAINS = [
    "youtube.com", "ted.com", "coursera.org", "edx.org",
]
