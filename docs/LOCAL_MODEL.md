# Local model mode (optional)

For deployments where learner data must not leave the institution's own machines, Plot Ark can run its LLM steps against an Ollama-compatible endpoint instead of a hosted model. **The default is unchanged** (`AI_PROVIDER=openai`).

## Enable

```env
AI_PROVIDER=local
LOCAL_LLM_BASE_URL=http://localhost:11434   # inside Docker use http://host.docker.internal:11434 or the service name
LOCAL_LLM_MODEL=llama3.1:8b
LOCAL_LLM_TIMEOUT=120
```

- On startup the backend logs `[AI] Local model mode: <model> at <host>...`.
- **Settings → AI Models** shows the active mode and whether the endpoint is reachable (`GET /api/ai/status?check=1`).
- In local mode no OpenAI/Gemini client is created, so a misrouted call fails instead of reaching a hosted service.

## Failure behaviour (no silent fallback)

If the endpoint is unreachable, times out, or the output is not the expected structure, the step **reports the error and stops**. It never retries against a hosted model.

| Step | Unreachable endpoint | Malformed output |
|---|---|---|
| Syllabus parse (`/api/syllabus/parse`) | HTTP 503 + message | HTTP 502 + message |
| Source tagging (`/api/sources/preview`) | `tagging_error` in response, result not cached | `tagging_error` in response, result not cached |
| Curriculum generate / skeleton / expand (SSE) | `{"type":"error","message":...}` event | `{"type":"error",...}` event, nothing saved |

## Which steps suit a small local model

The status column reflects the structure of each step (short vs. long output, strict JSON vs. prose) and the synthetic-fixture tests in `backend/tests/test_local_llm.py`, which stub the endpoint. **These tests verify routing and failure handling, not model quality.** Output quality of a particular small model has not been benchmarked here; run your own check on synthetic data before relying on a model. Small local models are not claimed to match hosted models.

| Step | Output shape | Small local model (7–8B) | Notes |
|---|---|---|---|
| Source tagging / one-line summaries | short, JSON | Generally acceptable | Failures are non-blocking; tags stay empty |
| Syllabus field extraction | medium, JSON | Acceptable with review | Check extracted modules/assignments |
| Curriculum skeleton | medium, JSON | Mixed | Module count / complexity ordering may be wrong |
| Curriculum generate / module expand | long, strict JSON | Not recommended | Long structured output often breaks; use a larger model |
| Knowledge graph (LightRAG) | needs hosted embeddings | **Disabled in local mode** | Fails with a clear message |
| A2A analytics agents | SQL only | n/a | No LLM involved |

## Privacy note

**Stays local:** every prompt and completion for the steps above go only to `LOCAL_LLM_BASE_URL`. Prompts contain the course/syllabus/curriculum text you submit.

**May still leave the deployment:**
- **Tavily web search** (source research for curriculum generation and source preview) sends the topic, level and audience strings to Tavily when a Tavily key is configured. Omit the key to avoid this; research then returns no sources.
- Anything else you have configured outside this mode (e.g. LMS/LTI traffic, your own hosting) is unaffected by this switch.
- If `LOCAL_LLM_BASE_URL` points to a remote host, data goes there; keep it inside your network.

Do not put real learner data in tests or fixtures; this repo's local-mode tests use synthetic data only.
