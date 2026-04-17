"""LightRAG instance management and graph utilities."""

import os
import re


# Module-level caches
_rag_instances = {}       # key: storage_dir path → LightRAG instance
_initialized_instances = set()  # storage_dirs that have had initialize_storages() called
_ingest_jobs = {}         # key: job_id → {"status": "running"|"done"|"error", "progress": str, "message": str}


def get_lightrag_instance(storage_dir: str = None):
    """Return a cached LightRAG instance (not yet initialized — init happens inside async context)."""
    from lightrag import LightRAG
    from lightrag.llm.openai import gpt_4o_mini_complete, openai_embed
    from lightrag.utils import EmbeddingFunc

    if storage_dir is None:
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        storage_dir = os.path.normpath(os.path.join(backend_dir, "..", "..", "data", "lightrag_storage"))

    if storage_dir in _rag_instances:
        return _rag_instances[storage_dir]

    rag = LightRAG(
        working_dir=storage_dir,
        llm_model_func=gpt_4o_mini_complete,
        embedding_func=EmbeddingFunc(
            embedding_dim=1536,
            max_token_size=8192,
            func=lambda texts: openai_embed(texts, model="text-embedding-3-small"),
        ),
    )
    _rag_instances[storage_dir] = rag
    return rag


# Subject alias map: normalise various slug forms to canonical storage directory names
_SUBJECT_ALIASES: dict[str, str] = {
    "call":                       "lightrag_storage_call",
    "business-law":               "lightrag_storage",
    # OB — multiple slug variants all point to the canonical directory
    "organizational-behavior":    "lightrag_storage_organizational-behavior",
    "organization-behavior":      "lightrag_storage_organizational-behavior",
    "adms-2400":                  "lightrag_storage_organizational-behavior",
    "mgmt-301":                   "lightrag_storage_organizational-behavior",
}


def get_graphml_path(subject: str = "all") -> str | None:
    """Return the path to the graphml file for a specific (non-all) subject."""
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    base_data = os.path.normpath(os.path.join(backend_dir, "..", "..", "data"))
    storage_dir = _SUBJECT_ALIASES.get(subject, f"lightrag_storage_{subject}")
    return os.path.normpath(
        os.path.join(base_data, storage_dir, "graph_chunk_entity_relation.graphml")
    )


def get_all_graphml_paths() -> list:
    """Return paths for all known graph files used in the 'all' merged view."""
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.normpath(os.path.join(backend_dir, "..", "..", "data"))
    return [
        os.path.join(data_dir, "lightrag_storage", "graph_chunk_entity_relation.graphml"),
        os.path.join(data_dir, "lightrag_storage_call", "graph_chunk_entity_relation.graphml"),
        os.path.join(data_dir, "lightrag_storage_organizational-behavior", "graph_chunk_entity_relation.graphml"),
    ]


def slug(text: str) -> str:
    """Convert a subject name to a filesystem-safe slug (e.g. 'CALL 201' → 'call-201')."""
    return re.sub(r'[^a-z0-9]+', '-', text.strip().lower()).strip('-')


def build_graph_response(graphs):
    """Merge one or more networkx graphs and return filtered {nodes, edges} dicts."""
    PERSON_TYPES = {"person", "PERSON"}
    PERSON_DESC_PHRASES = ("a person", "a student", "a fictional")

    merged_nodes = {}
    merged_edges = {}

    for G in graphs:
        for node_id, attrs in G.nodes(data=True):
            nid = str(node_id)
            if nid not in merged_nodes or len(attrs) > len(merged_nodes[nid]):
                merged_nodes[nid] = dict(attrs)

        for source, target, attrs in G.edges(data=True):
            relation = attrs.get("relation", attrs.get("label", ""))
            key = (str(source), str(target), relation)
            if key not in merged_edges:
                merged_edges[key] = dict(attrs)

    _DATE_FULL_RE = re.compile(
        r'^(January|February|March|April|May|June|July|August|September|October|November|December)'
        r'\s+\d{1,2},?\s+\d{4}$',
        re.IGNORECASE,
    )
    _DATE_YEAR_RE = re.compile(r'^\d{4}$')

    filtered_node_ids = set()
    nodes = []
    for node_id, attrs in merged_nodes.items():
        entity_type = attrs.get("entity_type", "")
        raw_desc = attrs.get("description", "")
        if raw_desc and "<SEP>" in raw_desc:
            raw_desc = raw_desc.split("<SEP>")[0].strip()

        if entity_type in PERSON_TYPES:
            filtered_node_ids.add(node_id)
            continue
        if raw_desc and any(phrase in raw_desc.lower() for phrase in PERSON_DESC_PHRASES):
            filtered_node_ids.add(node_id)
            continue

        node_label = attrs.get("label", node_id)
        if _DATE_FULL_RE.match(str(node_label)) or _DATE_YEAR_RE.match(str(node_label)):
            filtered_node_ids.add(node_id)
            continue

        # Detect source layer from description tags
        source_layer = "hot"  # default for existing KG data
        full_desc = attrs.get("description", "")
        if "[layer: warm]" in full_desc:
            source_layer = "warm"
        elif "[layer: cold]" in full_desc:
            source_layer = "cold"

        nodes.append({
            "id": node_id,
            "label": node_label,
            "entity_type": entity_type,
            "description": raw_desc,
            "source_layer": source_layer,
        })

    edges = []
    for (source, target, relation), attrs in merged_edges.items():
        if source in filtered_node_ids or target in filtered_node_ids:
            continue
        edges.append({
            "source": source,
            "target": target,
            "label": attrs.get("label", relation),
        })

    return nodes, edges
