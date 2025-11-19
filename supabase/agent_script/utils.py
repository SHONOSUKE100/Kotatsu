"""
Shared utilities for text cleanup, date handling, and JSON parsing.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Optional


ONE_DAY = dt.timedelta(days=1)


def is_within_last_day(target: Optional[dt.datetime], *, now: Optional[dt.datetime] = None) -> bool:
    if target is None:
        return False
    now = now or dt.datetime.now(dt.timezone.utc)
    if target.tzinfo is None:
        target = target.replace(tzinfo=dt.timezone.utc)
    return now - target <= ONE_DAY


WHITESPACE_RE = re.compile(r"\s+")


def clean_text(value: str) -> str:
    value = value.replace("\u00a0", " ")
    value = WHITESPACE_RE.sub(" ", value)
    return value.strip()


def resolve_text_field(field: Any) -> str:
    if isinstance(field, str):
        return field
    if isinstance(field, Mapping) and "value" in field and isinstance(field["value"], str):
        return field["value"]
    return ""


def parse_struct_time(value: Any) -> Optional[dt.datetime]:
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        return value
    if isinstance(value, dt.date):
        return dt.datetime.combine(value, dt.time.min, tzinfo=dt.timezone.utc)
    if hasattr(value, "tm_year"):
        try:
            return dt.datetime(
                value.tm_year,
                value.tm_mon,
                value.tm_mday,
                value.tm_hour,
                value.tm_min,
                value.tm_sec,
                tzinfo=dt.timezone.utc,
            )
        except Exception:
            return None
    if isinstance(value, str):
        for fmt in ("%a, %d %b %Y %H:%M:%S %Z", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d %H:%M:%S"):
            try:
                return dt.datetime.strptime(value, fmt)
            except ValueError:
                continue
    return None


def load_env_file(path: str | os.PathLike[str]) -> Dict[str, str]:
    env_path = Path(path)
    if not env_path.exists():
        return {}
    data: Dict[str, str] = {}
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)
        data[key] = value
    return data


CODE_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)


def strip_code_fence(text: str) -> str:
    match = CODE_FENCE_RE.search(text)
    if match:
        return match.group(1).strip()
    return text.strip()


def generate_json_candidates(text: str) -> List[str]:
    stripped = strip_code_fence(text.strip())
    candidates = {stripped}
    first = stripped.find("{")
    last = stripped.rfind("}")
    if first != -1 and last != -1 and last > first:
        candidates.add(stripped[first : last + 1])
    def convert_single_quotes(value: str) -> str:
        return re.sub(r"'([^']*)'", lambda m: json.dumps(m.group(1))[1:-1], value)
    more = set()
    for candidate in candidates:
        if "'" in candidate:
            more.add(convert_single_quotes(candidate))
    candidates |= more
    return [c for c in candidates if c]


class JsonParsingError(RuntimeError):
    def __init__(self, message: str, raw_text: Optional[str] = None):
        super().__init__(message)
        self.raw_text = raw_text


def parse_json_with_candidates(text: str) -> Any:
    candidates = generate_json_candidates(text)
    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue
    raise JsonParsingError("Failed to parse JSON output", raw_text=text)


def dataclass_to_dict(value: Any) -> Any:
    if is_dataclass(value):
        return {key: dataclass_to_dict(val) for key, val in asdict(value).items()}
    if isinstance(value, list):
        return [dataclass_to_dict(item) for item in value]
    if isinstance(value, dict):
        return {key: dataclass_to_dict(val) for key, val in value.items()}
    return value
