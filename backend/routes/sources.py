"""Source preview route."""

import json
from flask import Blueprint, request
from config import openai_client, redis_client
from services.research import research_sources, score_credibility

sources_bp = Blueprint("sources", __name__)


@sources_bp.route("/api/sources/preview", methods=["POST"])
def preview_sources():
    """Return Tavily sources for user review before curriculum generation."""
    data = request.get_json()
    topic = data.get("topic", "")
    level = data.get("level", "")
    audience = data.get("audience", "")

    if not all([topic, level, audience]):
        return {"error": "Missing required fields: topic, level, audience"}, 400

    cache_key = f"sources_preview:{topic}:{level}:{audience}"
    if redis_client is not None:
        try:
            cached = redis_client.get(cache_key)
            if cached:
                print(f"Redis cache hit: {cache_key}")
                return json.loads(cached)
        except Exception as redis_err:
            print(f"Redis get error (skipping cache check): {redis_err}")

    raw = research_sources(topic, level, audience)
    sources = []
    for r in raw:
        sources.append({
            "url": r.get("url", ""),
            "title": r.get("title", ""),
            "type": r.get("type", "other"),
            "snippet": r.get("content", ""),
            "credibility": score_credibility(r.get("url", ""), r.get("type", "")),
            "tags": [],
        })

    if sources:
        try:
            sources_for_tags = [{"title": s["title"], "snippet": s["snippet"]} for s in sources]
            tag_prompt = (
                "For each of the following academic sources, generate:\n"
                "1. 3-4 short keyword tags (1-3 words each)\n"
                "2. A clean one-sentence summary (max 20 words) describing what the source covers — no filler like 'This paper examines', just the actual content\n\n"
                "Return as JSON only, no explanation.\n\nSources:\n"
                + json.dumps(sources_for_tags)
                + '\n\nReturn format: {"results": [{"tags": ["tag1", "tag2"], "summary": "one sentence"}, ...]}\n'
                "Each object corresponds to one source in the same order."
            )

            tag_response = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": tag_prompt}],
                temperature=0.3,
                max_tokens=500,
            )
            raw_tags = tag_response.choices[0].message.content.strip()
            raw_tags = raw_tags.replace("```json", "").replace("```", "").strip()
            tag_data = json.loads(raw_tags)
            results_list = tag_data.get("results", [])
            for i, source in enumerate(sources):
                if i < len(results_list) and isinstance(results_list[i], dict):
                    source["tags"] = results_list[i].get("tags", [])
                    source["snippet"] = results_list[i].get("summary", source["snippet"])
        except Exception as tag_err:
            print(f"Tag generation failed (non-fatal): {tag_err}")

    if redis_client is not None:
        try:
            redis_client.setex(cache_key, 604800, json.dumps({"sources": sources}))
        except Exception as redis_err:
            print(f"Redis set error (skipping cache store): {redis_err}")

    return {"sources": sources}
