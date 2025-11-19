"""
LangSmith observability helpers for the offline agent.
"""

from __future__ import annotations

import os
from contextlib import AbstractContextManager
from typing import Any, Dict, Mapping, Optional

from agent_script.logger import log_debug, log_warning

def _is_disabled(flag: Optional[str]) -> bool:
    if flag is None:
        return False
    return flag.strip().lower() in {"0", "false", "off", "no"}


try:
    from langsmith.run_trees import RunTree
except Exception:  # pragma: no cover
    RunTree = None  # type: ignore


class _LangSmithRun(AbstractContextManager["_LangSmithRun"]):
    """Wraps a LangSmith RunTree with safe lifecycle helpers."""

    def __init__(self, run_tree: Optional["RunTree"]):
        self._run_tree = run_tree
        self._closed = False

    def finish(self, outputs: Optional[Mapping[str, Any]] = None):
        if not self._run_tree or self._closed:
            return
        self._run_tree.end(outputs=dict(outputs or {}))
        self._run_tree.post()
        self._closed = True

    def __exit__(self, exc_type, exc, exc_tb):
        if not self._run_tree or self._closed:
            return False
        if exc:
            self._run_tree.end(error=str(exc))
        else:
            self._run_tree.end()
        self._run_tree.post()
        self._closed = True
        return False


class _NullRun(AbstractContextManager["_NullRun"]):
    """No-op context manager when LangSmith is disabled."""

    def finish(self, outputs: Optional[Mapping[str, Any]] = None):
        return None

    def __exit__(self, exc_type, exc, exc_tb):
        return False


class LangSmithObserver:
    """Tiny facade to create LangSmith traces when credentials are provided."""

    def __init__(
        self,
        *,
        enabled: bool,
        project_name: str,
        tags: Optional[list[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.enabled = enabled and RunTree is not None
        self.project_name = project_name
        self.tags = tags or ["agent-script"]
        self.metadata = metadata or {}

    @classmethod
    def from_env(cls) -> "LangSmithObserver":
        api_key = os.getenv("LANGSMITH_API_KEY")
        tracing_flag = os.getenv("LANGSMITH_TRACING")
        enabled = bool(api_key) and not _is_disabled(tracing_flag) and RunTree is not None
        project_name = os.getenv("LANGSMITH_PROJECT", "agent-script")
        metadata = {}
        endpoint = os.getenv("LANGSMITH_ENDPOINT")
        if endpoint:
            metadata["endpoint"] = endpoint
        if not enabled and api_key and RunTree is None:
            log_warning("LangSmith package is unavailable despite API key being set.")
        return cls(enabled=enabled, project_name=project_name, metadata=metadata)

    def track_run(self, name: str, inputs: Optional[Mapping[str, Any]] = None):
        if not self.enabled:
            return _NullRun()
        run_tree = RunTree(
            name=name,
            run_type="chain",
            project_name=self.project_name,
            inputs=dict(inputs or {}),
            tags=self.tags,
            metadata=self.metadata,
        )
        log_debug("LangSmith run started", {"name": name, "project": self.project_name})
        return _LangSmithRun(run_tree)
