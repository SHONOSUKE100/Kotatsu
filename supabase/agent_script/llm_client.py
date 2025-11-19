"""
Thin wrapper around the google-generativeai SDK.
"""

from __future__ import annotations

import os
import time
from collections import deque
from typing import Any, Deque, Dict, Optional

import google.generativeai as genai  # type: ignore

from agent_script.logger import log_debug, log_warning
from agent_script.utils import JsonParsingError, parse_json_with_candidates

try:  # pragma: no cover - optional dependency at runtime
    from langsmith import wrappers as langsmith_wrappers
except Exception:  # pragma: no cover
    langsmith_wrappers = None  # type: ignore


class _RateLimiter:
    """Simple RPM limiter that blocks when the quota is exhausted."""

    def __init__(self, rpm: int):
        self.window_seconds = 60.0
        self.capacity = max(1, rpm)
        self._calls: Deque[float] = deque()

    def acquire(self) -> None:
        now = time.monotonic()
        window_start = now - self.window_seconds
        while self._calls and self._calls[0] < window_start:
            self._calls.popleft()
        if len(self._calls) >= self.capacity:
            sleep_for = self._calls[0] + self.window_seconds - now
            if sleep_for > 0:
                time.sleep(sleep_for)
            now = time.monotonic()
            window_start = now - self.window_seconds
            while self._calls and self._calls[0] < window_start:
                self._calls.popleft()
        self._calls.append(now)


class GeminiClient:
    def __init__(
        self,
        model_name: str,
        api_key: str,
        temperature: float = 0.2,
        rpm_limit: int = 15,
    ):
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(model_name)
        self.model = _wrap_with_langsmith(model)
        self.temperature = temperature
        self._rate_limiter = _RateLimiter(rpm_limit) if rpm_limit > 0 else None

    def _render_text(self, response: Any) -> str:
        if hasattr(response, "text"):
            return response.text  # type: ignore[attr-defined]
        if getattr(response, "candidates", None):
            parts = []
            for candidate in response.candidates:
                for part in getattr(candidate, "content", {}).get("parts", []):  # type: ignore[attr-defined]
                    if hasattr(part, "text"):
                        parts.append(part.text)
            return "\n".join(parts)
        if getattr(response, "parts", None):
            return "".join(getattr(part, "text", "") for part in response.parts)
        return str(response)

    def generate_text(self, prompt: str, *, temperature: Optional[float] = None) -> str:
        generation_config = {"temperature": temperature if temperature is not None else self.temperature}
        if self._rate_limiter:
            self._rate_limiter.acquire()
        response = self.model.generate_content(prompt, generation_config=generation_config)
        text = self._render_text(response)
        log_debug("LLM response received", {"chars": len(text)})
        return text.strip()

    def generate_json(self, prompt: str, *, temperature: Optional[float] = None) -> Dict[str, Any]:
        text = self.generate_text(prompt, temperature=temperature)
        return parse_json_with_candidates(text)


def _wrap_with_langsmith(model: Any) -> Any:
    api_key = os.getenv("LANGSMITH_API_KEY")
    tracing_flag = os.getenv("LANGSMITH_TRACING")
    if not api_key or _is_disabled(tracing_flag) or langsmith_wrappers is None:
        if api_key and langsmith_wrappers is None:
            log_warning("LangSmith wrappers unavailable despite LANGSMITH_API_KEY being set.")
        return model
    return langsmith_wrappers.wrap_gemini(model)


def _is_disabled(flag: Optional[str]) -> bool:
    if flag is None:
        return False
    return flag.strip().lower() in {"0", "false", "off", "no"}
