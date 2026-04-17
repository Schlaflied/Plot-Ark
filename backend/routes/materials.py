"""Materials ingestion routes (LightRAG)."""

import os
import uuid
import asyncio
import threading as _t
from flask import Blueprint, request, jsonify
from async_loop import bg_loop
from services.file_parser import extract_text_from_bytes
from services.lightrag_service import (
    get_lightrag_instance, slug, _ingest_jobs, _initialized_instances,
)

materials_bp = Blueprint("materials", __name__)


@materials_bp.route("/api/materials/ingest", methods=["POST"])
def start_ingest():
    """Accept uploaded files + subject name, kick off LightRAG ingestion in the background."""
    if "files[]" not in request.files:
        return jsonify({"error": "No files[] field in request"}), 400

    subject = request.form.get("subject", "").strip()
    if not subject:
        return jsonify({"error": "Missing subject field"}), 400

    uploaded = request.files.getlist("files[]")
    if not uploaded:
        return jsonify({"error": "No files uploaded"}), 400

    file_data = []
    for f in uploaded:
        name = f.filename or "unknown"
        ext = os.path.splitext(name.lower())[1]
        if ext not in (".pdf", ".pptx", ".docx"):
            continue
        file_data.append((name, f.read()))

    if not file_data:
        return jsonify({"error": "No valid PDF/PPTX/DOCX files found"}), 400

    job_id = str(uuid.uuid4())
    _ingest_jobs[job_id] = {"status": "running", "progress": "Starting…", "message": ""}

    subject_slug = slug(subject)
    layer = request.form.get("layer", "hot").strip().lower()
    if layer not in ("hot", "warm"):
        layer = "hot"

    from services.lightrag_service import _SUBJECT_ALIASES
    storage_subdir = _SUBJECT_ALIASES.get(subject_slug, f"lightrag_storage_{subject_slug}")

    backend_dir = os.path.dirname(os.path.abspath(__file__))
    storage_dir = os.path.normpath(os.path.join(backend_dir, "..", "data", storage_subdir))
    os.makedirs(storage_dir, exist_ok=True)

    def _run_ingest():
        total = len(file_data)
        try:
            async def _do_ingest():
                rag = get_lightrag_instance(storage_dir)
                if storage_dir not in _initialized_instances:
                    await rag.initialize_storages()
                    _initialized_instances.add(storage_dir)
                for i, (fname, content) in enumerate(file_data, start=1):
                    _ingest_jobs[job_id]["progress"] = f"Ingesting file {i}/{total}: {fname}"
                    text = extract_text_from_bytes(fname, content)
                    if not text.strip():
                        continue
                    tagged_text = (
                        f"[source: {subject_slug} / {fname}] [layer: {layer}]\n\n{text}"
                    )
                    try:
                        doc_id = f"doc-{subject_slug}__{os.path.splitext(fname)[0]}"
                        await rag.ainsert(tagged_text, ids=[doc_id])
                    except TypeError:
                        await rag.ainsert(tagged_text)

            future = asyncio.run_coroutine_threadsafe(_do_ingest(), bg_loop)
            future.result(timeout=600)
            _ingest_jobs[job_id]["status"] = "done"
            _ingest_jobs[job_id]["progress"] = f"Done — {total} file(s) ingested."
        except Exception as exc:
            print(f"Ingest job {job_id} failed: {exc}")
            _ingest_jobs[job_id]["status"] = "error"
            _ingest_jobs[job_id]["message"] = str(exc)

    _t.Thread(target=_run_ingest, daemon=True).start()

    return jsonify({"job_id": job_id, "status": "running"})


@materials_bp.route("/api/materials/ingest/status/<job_id>", methods=["GET"])
def ingest_status(job_id):
    """Return the current status of an ingestion job."""
    job = _ingest_jobs.get(job_id)
    if job is None:
        return jsonify({"status": "not_found"}), 404
    if job["status"] == "running":
        return jsonify({"status": "running", "progress": job.get("progress", "")})
    if job["status"] == "done":
        return jsonify({"status": "done"})
    return jsonify({"status": "error", "message": job.get("message", "Unknown error")})
