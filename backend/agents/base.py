"""
BaseNode and SharedMemory — Hive-style agent infrastructure for Plot-Ark A2A.

Design principles (from Hive framework):
- Each Node has execute() with reflexion pattern (try → judge → retry/fallback)
- SharedMemory is a dict-based store for inter-node communication
- NodeResult carries status + data for edge routing
- All agents have SQL-only fallback (Phase 1 MVP)
"""

import json
import time
import traceback
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class NodeResult:
    """Result of a node execution."""
    status: str  # "success" | "error" | "fallback"
    data: dict = field(default_factory=dict)
    agent_name: str = ""
    duration_ms: int = 0
    retries_used: int = 0
    error: Optional[str] = None
    # Token usage — populated when agent uses an LLM; zero for sql-only agents
    tokens_in: int = 0
    tokens_out: int = 0
    tokens_cache_read: int = 0
    tokens_cache_write: int = 0


class SharedMemory:
    """
    Redis-backed shared memory for inter-agent communication.
    Falls back to in-memory dict if Redis unavailable.
    """

    def __init__(self, session_id: str, redis_client=None):
        self.session_id = session_id
        self.redis = redis_client
        self._local: dict[str, Any] = {}

    def get(self, key: str, default=None):
        full_key = f"a2a:{self.session_id}:{key}"
        if self.redis:
            try:
                val = self.redis.get(full_key)
                if val is not None:
                    return json.loads(val)
            except Exception:
                pass
        return self._local.get(key, default)

    def set(self, key: str, value: Any, expire_seconds: int = 3600):
        full_key = f"a2a:{self.session_id}:{key}"
        self._local[key] = value
        if self.redis:
            try:
                self.redis.set(full_key, json.dumps(value, default=str), ex=expire_seconds)
            except Exception:
                pass

    def get_all(self) -> dict:
        """Return all data in shared memory."""
        return dict(self._local)

    def clear(self):
        self._local.clear()


def _validate_json_schema(data: dict, required_keys: list[str]) -> tuple[bool, str]:
    """
    L3 Judge: JSON Schema validation.
    Checks that all required keys are present and non-None.
    """
    missing = [k for k in required_keys if k not in data or data[k] is None]
    if missing:
        return False, f"Missing required keys: {missing}"

    # Check that lists are not empty where expected
    for k in required_keys:
        val = data[k]
        if isinstance(val, list) and len(val) == 0:
            return False, f"Key '{k}' is an empty list"
        if isinstance(val, dict) and len(val) == 0:
            return False, f"Key '{k}' is an empty dict"

    return True, "OK"


class BaseNode:
    """
    Base class for all A2A agent nodes.
    Implements Hive-style event_loop pattern: execute → judge → retry/fallback.
    """

    name: str = "base"
    description: str = ""
    model: str = "sql-only"  # Phase 1: no LLM
    max_retries: int = 3
    required_output_keys: list[str] = []  # For L3 JSON schema judge

    def execute(self, shared_memory: SharedMemory) -> NodeResult:
        """
        Main execution loop with reflexion pattern.
        Try → Judge → Retry / Accept / Escalate to fallback.
        """
        start = time.time()
        last_error = None

        for attempt in range(self.max_retries):
            try:
                result = self._run(shared_memory)

                # L3 Judge: JSON schema validation
                valid, msg = _validate_json_schema(result, self.required_output_keys)
                if valid:
                    duration = int((time.time() - start) * 1000)
                    # Write result to shared memory
                    shared_memory.set(f"{self.name}_result", result)
                    return NodeResult(
                        status="success",
                        data=result,
                        agent_name=self.name,
                        duration_ms=duration,
                        retries_used=attempt,
                    )
                else:
                    last_error = f"Judge L3 failed: {msg}"
                    print(f"  [{self.name}] Attempt {attempt+1} judge fail: {msg}")

            except Exception as e:
                last_error = str(e)
                print(f"  [{self.name}] Attempt {attempt+1} error: {e}")
                traceback.print_exc()

        # All retries exhausted → fallback to SQL
        print(f"  [{self.name}] All retries exhausted, falling back to SQL...")
        try:
            result = self._fallback_sql(shared_memory)
            duration = int((time.time() - start) * 1000)
            shared_memory.set(f"{self.name}_result", result)
            return NodeResult(
                status="fallback",
                data=result,
                agent_name=self.name,
                duration_ms=duration,
                retries_used=self.max_retries,
                error=last_error,
            )
        except Exception as e:
            duration = int((time.time() - start) * 1000)
            return NodeResult(
                status="error",
                data={},
                agent_name=self.name,
                duration_ms=duration,
                retries_used=self.max_retries,
                error=str(e),
            )

    def _run(self, shared_memory: SharedMemory) -> dict:
        """Override: main agent logic."""
        raise NotImplementedError

    def _fallback_sql(self, shared_memory: SharedMemory) -> dict:
        """Override: pure SQL fallback when LLM/main logic fails."""
        raise NotImplementedError

    def agent_card(self) -> dict:
        """A2A Agent Card (for future protocol compliance)."""
        return {
            "name": self.name,
            "description": self.description,
            "model": self.model,
            "capabilities": {"streaming": False},
        }
