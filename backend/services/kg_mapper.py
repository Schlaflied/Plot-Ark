"""KG ↔ Curriculum Mapper — maps module objectives to KG concept nodes.

Given a curriculum (from DB) and a KG (from GraphML), this service:
1. Extracts all node labels from the GraphML.
2. For each module's learning_objectives, finds matching KG nodes (substring match).
3. Uses KG edges to infer cross-module concept dependencies.
"""

import os
import re
import json
import networkx as nx
from typing import Optional

from services.lightrag_service import get_graphml_path

# ── Helpers ─────────────────────────────────────────────────────────────────────

# Short labels to skip (author names, publishers, dates, etc.)
_SKIP_LABELS = {"person", "PERSON"}
_PERSON_PHRASES = ("a person", "a student", "a fictional")
_MIN_LABEL_LEN = 3  # skip labels shorter than this

# Known noisy short labels that cause false-positive matches
# (e.g. "Land" matching "landscape", "Term" matching "terms")
# Word-boundary regex prevents most of these, but some remain valid English words
# that appear in unrelated contexts.
_NOISE_LABELS = {
    "land", "term", "will", "bond", "firm", "house", "grant",
    "class 3", "group 7", "web 1.0", "web 2.0", "web 3.0",
    "france", "canada",
}

# Topic keywords → canonical subject slug used in _SUBJECT_ALIASES
# The uniqueness constraint is on the course name (case-insensitive).
_TOPIC_KEYWORDS: list[tuple[list[str], str]] = [
    (["language learning", "call", "computer-assisted"], "call"),
    (["business law", "law and ethics", "gender and law"], "business-law"),
    (["organizational behavior", "organisation", "organizational behaviour", "adms 2400"], "organizational-behavior"),
]


def _slugify(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', name.strip().lower()).strip('-')


def _resolve_graphml_for_topic(topic: str) -> str | None:
    """Resolve a course topic to its GraphML path.

    Resolution order:
    1. Match topic against known keyword patterns (_TOPIC_KEYWORDS)
    2. Slugify topic directly and check _SUBJECT_ALIASES
    3. Try slugified topic as-is in get_graphml_path
    """
    topic_lower = topic.lower()

    # Tier 1: keyword-based matching
    for keywords, subject_slug in _TOPIC_KEYWORDS:
        if any(kw in topic_lower for kw in keywords):
            path = get_graphml_path(subject_slug)
            if path and os.path.exists(path):
                return path

    # Tier 2: direct slug
    slug = _slugify(topic)
    path = get_graphml_path(slug)
    if path and os.path.exists(path):
        return path

    return None


def _load_kg_nodes_edges(graphml_path: str):
    """Return (nodes_dict, edges_list) from a GraphML file.

    nodes_dict: {label_lower: {id, label, description, entity_type}}
    edges_list: [(source_label_lower, target_label_lower, relation)]
    """
    G = nx.read_graphml(graphml_path)

    # Build id→label lookup
    id_to_label = {}
    nodes = {}
    for nid, attrs in G.nodes(data=True):
        label = attrs.get("label", str(nid))
        entity_type = attrs.get("entity_type", "")
        desc = attrs.get("description", "")

        # Skip person nodes
        if entity_type in _SKIP_LABELS:
            continue
        if desc and any(p in desc.lower() for p in _PERSON_PHRASES):
            continue
        # Skip very short labels
        if len(label) < _MIN_LABEL_LEN:
            continue

        # Detect source layer from description tags
        source_layer = "hot"  # default for existing KG data
        if "[layer: warm]" in desc:
            source_layer = "warm"
        elif "[layer: cold]" in desc:
            source_layer = "cold"

        id_to_label[str(nid)] = label
        label_lower = label.lower().strip()
        nodes[label_lower] = {
            "id": str(nid),
            "label": label,
            "description": desc.split("<SEP>")[0].strip() if "<SEP>" in desc else desc,
            "entity_type": entity_type,
            "source_layer": source_layer,
        }

    edges = []
    for src, tgt, attrs in G.edges(data=True):
        src_label = id_to_label.get(str(src))
        tgt_label = id_to_label.get(str(tgt))
        if src_label and tgt_label:
            relation = attrs.get("label", attrs.get("relation", ""))
            edges.append((src_label.lower().strip(), tgt_label.lower().strip(), relation))

    return nodes, edges


# ── Core Mapper ─────────────────────────────────────────────────────────────────

def map_objectives_to_kg(modules: list, graphml_path: str, min_label_len: int = 4):
    """Map each module's content to KG concept nodes via word-boundary matching.

    Uses \\b word-boundary regex to avoid partial-word false positives
    (e.g. "Writ" should NOT match "Write", "Land" should NOT match "Landscape").

    For labels with parenthesized abbreviations like "Mobile-Assisted Language Learning (MALL)",
    we also generate a pattern for the base form without the abbreviation.

    Returns:
        module_concepts: {module_number: [{label, id, definition, source, source_text}, ...]}
        concept_dependencies: [{from_module, to_module, from_concept, to_concept, relation}, ...]
    """
    nodes, edges = _load_kg_nodes_edges(graphml_path)

    # Sort labels longest-first so we match the most specific concept
    sorted_labels = sorted(nodes.keys(), key=len, reverse=True)
    # Only consider labels long enough to be meaningful
    sorted_labels = [l for l in sorted_labels if len(l) >= min_label_len and l not in _NOISE_LABELS]

    # Pre-compile word-boundary regex for each label
    # For labels with parenthesized suffixes like "XYZ (ABC)", also match just "XYZ"
    label_patterns: list[tuple[str, re.Pattern]] = []
    for label in sorted_labels:
        try:
            pattern = re.compile(r'\b' + re.escape(label) + r'\b', re.IGNORECASE)
            label_patterns.append((label, pattern))
        except re.error:
            continue

        # Also try stripped version: "Mobile-Assisted Language Learning (MALL)" → "Mobile-Assisted Language Learning"
        stripped = re.sub(r'\s*\([^)]+\)\s*$', '', label).strip()
        if stripped and stripped != label and len(stripped) >= min_label_len:
            try:
                alt_pattern = re.compile(r'\b' + re.escape(stripped) + r'\b', re.IGNORECASE)
                label_patterns.append((label, alt_pattern))  # still maps to original label
            except re.error:
                continue

    # ── Step 1: Map module content → KG nodes ──────────────────────────────
    module_concepts: dict[int, list[dict]] = {}

    for idx, mod in enumerate(modules):
        # Use 1-based index (module_number may not exist in stored data)
        mod_num = mod.get("module_number", idx + 1)
        if isinstance(mod_num, str):
            try:
                mod_num = int(mod_num)
            except ValueError:
                mod_num = idx + 1

        matched = []
        seen_labels = set()

        # Collect ALL searchable text from this module
        text_sources: list[tuple[str, str]] = []  # (category, text)

        # Learning objectives
        for obj in mod.get("learning_objectives", []):
            if obj:
                text_sources.append(("objective", obj))

        # Module title
        title = mod.get("title", "")
        if title:
            text_sources.append(("title", title))

        # Narrative preview
        narrative = mod.get("narrative_preview", "")
        if narrative:
            text_sources.append(("narrative", narrative))

        # Assignment titles and descriptions (may be dict or plain string)
        for assign in mod.get("assignments", []):
            if isinstance(assign, str):
                if assign:
                    text_sources.append(("assignment", assign))
            elif isinstance(assign, dict):
                if assign.get("title"):
                    text_sources.append(("assignment", assign["title"]))
                if assign.get("task_description"):
                    text_sources.append(("assignment", assign["task_description"]))
                if assign.get("coverage"):
                    text_sources.append(("assignment", assign["coverage"]))

        # Reading titles and rationale (may be dict or plain string)
        for reading in mod.get("recommended_readings", []):
            if isinstance(reading, str):
                if reading:
                    text_sources.append(("reading", reading))
            elif isinstance(reading, dict):
                if reading.get("title"):
                    text_sources.append(("reading", reading["title"]))
                if reading.get("rationale"):
                    text_sources.append(("reading", reading["rationale"]))
                for kp in reading.get("key_points", []):
                    if kp:
                        text_sources.append(("reading", kp))

        # Teaching/learning suggestions
        for sug in mod.get("teaching_suggestions", []):
            if sug:
                text_sources.append(("suggestion", sug))
        for sug in mod.get("learning_suggestions", []):
            if sug:
                text_sources.append(("suggestion", sug))

        # Match each text source against KG labels using word-boundary regex
        for category, text in text_sources:
            for label, pattern in label_patterns:
                if label in seen_labels:
                    continue
                if pattern.search(text):
                    seen_labels.add(label)
                    node = nodes[label]
                    matched.append({
                        "label": node["label"],
                        "id": node["id"],
                        "definition": node["description"],
                        "source": category,
                        "source_text": text,
                        "source_layer": node.get("source_layer", "hot"),
                    })

        module_concepts[mod_num] = matched

    # ── Step 1.5: Reverse lookup for modules with 0 matches ────────────────
    # For modules that got 0 hits, try reverse: extract significant words from
    # module title and search KG labels that *contain* those words.
    # This bridges vocabulary gaps (e.g. "Regulatory" ↔ "Regulation").
    _STOPWORDS = {"and", "the", "for", "with", "from", "into", "that", "this",
                  "are", "was", "has", "been", "will", "how", "what", "its",
                  "not", "but", "can", "all", "may", "law", "business"}

    for mod_num, matched in module_concepts.items():
        if matched:  # already has matches, skip
            continue
        mod = modules[mod_num - 1] if mod_num - 1 < len(modules) else None
        if not mod:
            continue

        title = mod.get("title", "")
        # Build combined text from title + objectives for word extraction
        objs_text = " ".join(mod.get("learning_objectives", []))
        combined = f"{title} {objs_text}"
        # Extract significant words (>= 5 chars, not stopwords)
        title_words = list(dict.fromkeys([  # dedupe, preserve order
            w.lower() for w in re.findall(r'[A-Za-z]+', combined)
            if len(w) >= 5 and w.lower() not in _STOPWORDS
        ]))

        reverse_seen = set()
        for word in title_words:
            # Search KG labels containing this word (substring in label)
            word_pat = re.compile(re.escape(word[:6]), re.IGNORECASE)  # use first 6 chars as stem
            for label_lower, node_info in nodes.items():
                if label_lower in reverse_seen or label_lower in _NOISE_LABELS:
                    continue
                if len(label_lower) < min_label_len:
                    continue
                if word_pat.search(label_lower):
                    reverse_seen.add(label_lower)
                    matched.append({
                        "label": node_info["label"],
                        "id": node_info["id"],
                        "definition": node_info["description"],
                        "source": "title",
                        "source_text": title,
                    })
                    if len(matched) >= 3:  # cap reverse matches per module
                        break
            if len(matched) >= 3:
                break

        module_concepts[mod_num] = matched

    # ── Step 1b: Graph traversal expansion (1-2 hops from seed concepts) ──────
    # For each module that has seed concepts, traverse KG neighbours and
    # attribute them to the same module — as long as the neighbour isn't
    # already attributed to a *different* module.
    already_attributed: dict[str, int] = {}  # node_id_lower → first module that claimed it
    for mod_num, concepts in module_concepts.items():
        for c in concepts:
            already_attributed[c["id"].lower()] = mod_num

    G = None
    try:
        G = nx.read_graphml(graphml_path)
    except Exception:
        pass

    if G is not None:
        MAX_HOPS = 2
        MAX_EXPAND_PER_MODULE = 8  # cap so one module doesn't swallow the whole graph

        for mod_num, seed_concepts in list(module_concepts.items()):
            if not seed_concepts:
                continue

            seed_ids = {c["id"] for c in seed_concepts}
            visited: set[str] = set(seed_ids)
            frontier: set[str] = set(seed_ids)
            expanded: list[dict] = []

            for _hop in range(MAX_HOPS):
                next_frontier: set[str] = set()
                for node_id in frontier:
                    if node_id not in G:
                        continue
                    for neighbor_id in list(G.neighbors(node_id)) + list(G.predecessors(node_id) if G.is_directed() else []):
                        if neighbor_id in visited:
                            continue
                        visited.add(neighbor_id)
                        nid_lower = neighbor_id.lower()
                        # Skip if already firmly attributed to a different module
                        if nid_lower in already_attributed and already_attributed[nid_lower] != mod_num:
                            continue
                        attrs = G.nodes[neighbor_id]
                        n_label = attrs.get("label", neighbor_id)
                        if len(n_label) < _MIN_LABEL_LEN or n_label.lower() in _NOISE_LABELS:
                            continue
                        expanded.append({
                            "label": n_label,
                            "id": neighbor_id,
                            "definition": attrs.get("description", ""),
                            "source": f"graph_hop_{_hop + 1}",
                            "source_text": "",
                        })
                        already_attributed[nid_lower] = mod_num
                        next_frontier.add(neighbor_id)
                        if len(expanded) >= MAX_EXPAND_PER_MODULE:
                            break
                    if len(expanded) >= MAX_EXPAND_PER_MODULE:
                        break
                frontier = next_frontier
                if not frontier or len(expanded) >= MAX_EXPAND_PER_MODULE:
                    break

            module_concepts[mod_num] = seed_concepts + expanded

    print(f"[KG Mapper] Total matches (after expansion): {sum(len(v) for v in module_concepts.values())} across {sum(1 for v in module_concepts.values() if v)}/{len(modules)} modules")

    # ── Step 2: Infer cross-module dependencies via KG edges ───────────────
    # Build reverse lookup: concept_label_lower → [module_numbers]
    concept_to_modules: dict[str, list[int]] = {}
    for mod_num, concepts in module_concepts.items():
        for c in concepts:
            key = c["label"].lower().strip()
            concept_to_modules.setdefault(key, []).append(mod_num)

    dependencies = []
    seen_deps = set()

    for src_label, tgt_label, relation in edges:
        src_mods = concept_to_modules.get(src_label, [])
        tgt_mods = concept_to_modules.get(tgt_label, [])

        for sm in src_mods:
            for tm in tgt_mods:
                if sm != tm:
                    dep_key = (sm, tm, src_label, tgt_label)
                    if dep_key not in seen_deps:
                        seen_deps.add(dep_key)
                        dependencies.append({
                            "from_module": sm,
                            "to_module": tm,
                            "from_concept": nodes.get(src_label, {}).get("label", src_label),
                            "to_concept": nodes.get(tgt_label, {}).get("label", tgt_label),
                            "relation": relation,
                        })

    # Sort dependencies by from_module, then to_module
    dependencies.sort(key=lambda d: (d["from_module"], d["to_module"]))

    return module_concepts, dependencies


def get_kg_mapping_for_course(course_id: int) -> Optional[dict]:
    """Full pipeline: load course from DB → find matching KG → run mapper.

    Returns None if no KG is available for this course's topic.
    """
    from db import get_db

    conn = get_db()
    if not conn:
        return None

    try:
        cur = conn.cursor()
        cur.execute("SELECT topic, modules FROM curricula WHERE id = %s", (course_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()

        if not row:
            return None

        topic = row[0]
        modules_raw = row[1]
        if isinstance(modules_raw, str):
            modules = json.loads(modules_raw)
        else:
            modules = modules_raw or []

        # Resolve KG path from topic — multi-tier resolution
        graphml_path = _resolve_graphml_for_topic(topic)

        if not graphml_path or not os.path.exists(graphml_path):
            return None

        module_concepts, dependencies = map_objectives_to_kg(modules, graphml_path)

        # Summary stats
        total_matched = sum(len(v) for v in module_concepts.values())
        modules_with_hits = sum(1 for v in module_concepts.values() if v)

        return {
            "course_id": course_id,
            "topic": topic,
            "kg_path": graphml_path,
            "total_concepts_matched": total_matched,
            "modules_with_matches": modules_with_hits,
            "total_modules": len(modules),
            "module_concepts": {
                str(k): v for k, v in module_concepts.items()
            },
            "dependencies": dependencies,
        }

    except Exception as e:
        print(f"KG mapping error for course {course_id}: {e}")
        return None
