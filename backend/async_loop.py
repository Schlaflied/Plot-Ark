"""Persistent background event loop for async operations (e.g. LightRAG)."""

import asyncio
import threading


bg_loop = asyncio.new_event_loop()
_bg_thread = threading.Thread(target=bg_loop.run_forever, daemon=True)
_bg_thread.start()


def run_async(coro):
    """Submit a coroutine to the persistent background event loop and wait for result."""
    future = asyncio.run_coroutine_threadsafe(coro, bg_loop)
    return future.result(timeout=120)
