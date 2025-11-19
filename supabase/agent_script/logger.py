"""
Lightweight logging helpers for the offline agent workflow.
"""

from __future__ import annotations

import logging
import sys
from typing import Any, Mapping, Optional


def init_logger(level: str = "INFO") -> logging.Logger:
    """Initializes a root logger that prints JSON-like payloads to stdout."""

    logger = logging.getLogger("agent")
    if logger.handlers:
        logger.setLevel(level.upper())
        return logger

    handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter(
        "%(asctime)s %(levelname)s %(name)s - %(message)s", "%Y-%m-%dT%H:%M:%S"
    )
    handler.setFormatter(formatter)

    logger.addHandler(handler)
    logger.setLevel(level.upper())
    logger.propagate = False
    return logger


def _format_attrs(attributes: Optional[Mapping[str, Any]]) -> str:
    if not attributes:
        return ""
    try:
        items = ", ".join(f"{key}={value!r}" for key, value in attributes.items())
    except Exception:
        return ""
    return f" {{{items}}}"


def _log(level: int, message: str, attributes: Optional[Mapping[str, Any]] = None):
    logger = logging.getLogger("agent")
    logger.log(level, "%s%s", message, _format_attrs(attributes))


def log_debug(message: str, attributes: Optional[Mapping[str, Any]] = None):
    _log(logging.DEBUG, message, attributes)


def log_info(message: str, attributes: Optional[Mapping[str, Any]] = None):
    _log(logging.INFO, message, attributes)


def log_warning(message: str, attributes: Optional[Mapping[str, Any]] = None):
    _log(logging.WARNING, message, attributes)


def log_error(message: str, attributes: Optional[Mapping[str, Any]] = None):
    _log(logging.ERROR, message, attributes)
