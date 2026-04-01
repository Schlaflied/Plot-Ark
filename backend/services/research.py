"""Tavily source research and credibility scoring."""

from config import tavily_client
from constants import RESOURCE_TYPES, ACADEMIC_DOMAINS, NEWS_DOMAINS, VIDEO_DOMAINS


def research_sources(topic, level, audience):
    """Step 1: Agent searches for real sources by type before generation."""
    try:
        results = []
        for source_type, config in RESOURCE_TYPES.items():
            for query_template in config["queries"]:
                query = query_template.format(topic=topic, level=level, audience=audience)
                search_kwargs = {
                    "query": query,
                    "search_depth": "basic",
                    "max_results": config["max_per_query"],
                    "include_domains": config["domains"],
                }
                if source_type == "news":
                    search_kwargs["days"] = 365
                response = tavily_client.search(**search_kwargs)
                for r in response.get("results", []):
                    results.append({
                        "title": r.get("title", ""),
                        "url": r.get("url", ""),
                        "content": r.get("content", "")[:300],
                        "type": source_type,
                    })
        # Deduplicate by URL
        seen = set()
        unique = []
        for r in results:
            if r["url"] not in seen:
                seen.add(r["url"])
                unique.append(r)
        # Filter: drop sources with no title or content clearly unrelated to topic
        topic_keywords = set(topic.lower().split())
        def is_relevant(r):
            if not r["title"]:
                return False
            combined = (r["title"] + " " + r["content"]).lower()
            return any(kw in combined for kw in topic_keywords)
        filtered = [r for r in unique if is_relevant(r)]
        if len(filtered) < 3:
            filtered = unique  # fallback: keep all if filter too aggressive
        print(f"Tavily found {len(unique)} sources, {len(filtered)} passed relevance filter for: {topic}")
        return filtered[:10]
    except Exception as e:
        print(f"Tavily research error: {e}")
        return []


def score_credibility(url: str, source_type: str) -> str:
    """Return 'high', 'medium', or 'low' credibility based on domain heuristics."""
    url_lower = url.lower()
    if source_type == "academic":
        if any(d in url_lower for d in ACADEMIC_DOMAINS):
            return "high"
    if source_type == "news":
        if any(d in url_lower for d in NEWS_DOMAINS):
            return "medium"
    if source_type == "video":
        if any(d in url_lower for d in VIDEO_DOMAINS):
            return "medium"
    if any(d in url_lower for d in ACADEMIC_DOMAINS):
        return "high"
    if any(d in url_lower for d in NEWS_DOMAINS + VIDEO_DOMAINS):
        return "medium"
    return "low"
