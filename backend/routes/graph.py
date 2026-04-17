"""Knowledge graph routes: data retrieval and RAG query."""

import os
import re
import json
from flask import Blueprint, request, jsonify
from extensions import redis_client
from async_loop import run_async
from services.lightrag_service import (
    get_lightrag_instance, get_graphml_path, get_all_graphml_paths,
    build_graph_response, _initialized_instances,
)

graph_bp = Blueprint("graph", __name__)


@graph_bp.route("/api/graph/kg-mapping/<int:course_id>", methods=["GET"])
def get_kg_mapping(course_id):
    """Return KG concept ↔ module objective mapping and cross-module dependencies."""
    from services.kg_mapper import get_kg_mapping_for_course

    result = get_kg_mapping_for_course(course_id)
    if result is None:
        return jsonify({
            "status": "no_kg",
            "message": "No knowledge graph available for this course.",
        })
    return jsonify({"status": "ok", **result})


@graph_bp.route("/api/graph", methods=["GET"])
def get_graph():
    """Return knowledge graph nodes and edges from the LightRAG graphml file(s)."""
    import networkx as nx
    subject = request.args.get("subject", "all")

    try:
        if subject == "all":
            paths = get_all_graphml_paths()
            existing_paths = [p for p in paths if os.path.exists(p)]
            if not existing_paths:
                return {"nodes": [], "edges": [], "status": "not_ready"}
            graphs = [nx.read_graphml(p) for p in existing_paths]
        else:
            graphml_path = get_graphml_path(subject)
            if graphml_path is None or not os.path.exists(graphml_path):
                return {"nodes": [], "edges": [], "status": "not_ready"}
            graphs = [nx.read_graphml(graphml_path)]

        nodes, edges = build_graph_response(graphs)
        return {"nodes": nodes, "edges": edges, "status": "ready"}

    except Exception as e:
        print(f"Graph read error: {e}")
        return {"nodes": [], "edges": [], "status": "error", "error": str(e)}, 500


@graph_bp.route("/api/graph/query", methods=["POST"])
def query_graph():
    """Query the LightRAG knowledge graph and return an answer."""
    data = request.get_json()
    question = data.get("question", "").strip()
    mode = data.get("mode", "hybrid")
    subject = data.get("subject", "business-law")

    if not question:
        return {"error": "Missing 'question' field."}, 400

    graphml_path = get_graphml_path(subject)
    if graphml_path is None or not os.path.exists(graphml_path):
        return {"answer": "Knowledge graph not initialized yet.", "subject": subject, "matched_node_id": None}

    def clean_answer(text: str) -> str:
        text = re.sub(r'#{1,6}\s*', '', text)
        text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
        text = re.sub(r'\*(.*?)\*', r'\1', text)
        text = re.sub(r'\[\d+\]', '', text)
        text = re.sub(r'(?m)^\s*[-*•]\s+', '', text)
        text = re.sub(r'\n{2,}', ' ', text)
        text = re.sub(r'[ \t]+', ' ', text)
        text = text.strip()
        sentences = re.split(r'(?<=[.!?])\s+', text)
        sentences = [s.strip() for s in sentences if s.strip() and len(s.strip()) > 10]
        result = ' '.join(sentences[:3])
        if result and result[-1] not in '.!?':
            result += '.'
        return result

    normalized_q = question.lower().strip()
    cache_key = f"graph_query:{subject}:{normalized_q}"
    if redis_client is not None:
        try:
            cached = redis_client.get(cache_key)
            if cached:
                print(f"Redis cache hit: {cache_key}")
                cached_node_id = None
                try:
                    import networkx as nx
                    _G = nx.read_graphml(graphml_path)
                    _q = question.lower().strip()
                    for _nid, _attrs in _G.nodes(data=True):
                        _lbl = _attrs.get("label", str(_nid)).lower()
                        if _lbl == _q or _lbl.startswith(_q) or _q in _lbl:
                            cached_node_id = str(_nid)
                            break
                except Exception:
                    pass
                return {"answer": cached, "subject": subject, "matched_node_id": cached_node_id, "cached": True}
        except Exception as redis_err:
            print(f"Redis get error (skipping cache): {redis_err}")

    try:
        try:
            from lightrag import QueryParam
        except ImportError:
            return {"answer": "Query engine not available in this environment. Run the backend locally with lightrag installed.", "subject": subject, "matched_node_id": None}

        backend_dir = os.path.dirname(os.path.abspath(__file__))
        if subject == "call":
            storage_dir = os.path.normpath(os.path.join(backend_dir, "..", "data", "lightrag_storage_call"))
        else:
            storage_dir = os.path.normpath(os.path.join(backend_dir, "..", "data", "lightrag_storage"))

        def _expand_abbreviation(q: str, gpath: str) -> str:
            q_stripped = q.strip()
            try:
                import networkx as nx
                G = nx.read_graphml(gpath)
                node_labels = [attrs.get("label", str(node_id)) for node_id, attrs in G.nodes(data=True)]
                if q_stripped in node_labels:
                    return q_stripped
                q_lower = q_stripped.lower()
                starts_with = [n for n in node_labels if n.lower().startswith(q_lower)]
                if starts_with:
                    best = min(starts_with, key=len)
                    return f"What is {best}? {q_stripped}"
                contains = [n for n in node_labels if q_lower in n.lower()]
                if contains:
                    best = min(contains, key=len)
                    return f"What is {best}? {q_stripped}"
                for n in node_labels:
                    if f"({q_stripped})" in n or f"({q_stripped.upper()})" in n:
                        return f"What is {n}? {q_stripped}"
            except Exception:
                pass
            return q_stripped

        expanded_question = _expand_abbreviation(question, graphml_path)

        async def _run_query():
            rag = get_lightrag_instance(storage_dir)
            if storage_dir not in _initialized_instances:
                await rag.initialize_storages()
                _initialized_instances.add(storage_dir)
            return await rag.aquery(expanded_question, param=QueryParam(mode=mode))

        raw_answer = run_async(_run_query())
        answer = clean_answer(raw_answer)

        NO_INFO_PHRASES = [
            "not have enough information",
            "don't have enough information",
            "cannot answer",
            "no information",
        ]
        matched_node_id = None
        answer_lower = answer.lower()
        is_no_info = any(phrase in answer_lower for phrase in NO_INFO_PHRASES)

        try:
            import networkx as nx
            G = nx.read_graphml(graphml_path)
            q_lower = question.lower()

            best_node_id = None
            best_node_label = None
            best_node_desc = None

            for node_id, attrs in G.nodes(data=True):
                label = attrs.get("label", str(node_id))
                if label.lower() == q_lower:
                    best_node_id = node_id
                    best_node_label = label
                    best_node_desc = attrs.get("description", "")
                    break

            if best_node_id is None:
                candidates = [
                    (node_id, attrs.get("label", str(node_id)), attrs.get("description", ""))
                    for node_id, attrs in G.nodes(data=True)
                    if attrs.get("label", str(node_id)).lower().startswith(q_lower)
                ]
                if candidates:
                    best_node_id, best_node_label, best_node_desc = min(candidates, key=lambda x: len(x[1]))

            if best_node_id is None:
                candidates = [
                    (node_id, attrs.get("label", str(node_id)), attrs.get("description", ""))
                    for node_id, attrs in G.nodes(data=True)
                    if q_lower in attrs.get("label", str(node_id)).lower()
                ]
                if candidates:
                    best_node_id, best_node_label, best_node_desc = min(candidates, key=lambda x: len(x[1]))

            if best_node_id is not None:
                matched_node_id = str(best_node_id)
                if is_no_info and best_node_desc:
                    answer = f"Based on the knowledge graph: {best_node_desc}"
        except Exception as fallback_err:
            print(f"Node matching error: {fallback_err}")

        if redis_client is not None:
            try:
                redis_client.set(cache_key, answer)
            except Exception as redis_err:
                print(f"Redis set error (skipping cache store): {redis_err}")

        return {"answer": answer, "subject": subject, "matched_node_id": matched_node_id}
    except Exception as e:
        print(f"Graph query error: {e}")
        return {"answer": f"Query failed: {str(e)}"}, 500
