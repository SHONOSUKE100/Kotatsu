"""
CLI entry point for the offline article generation agent.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT.parent) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT.parent))

from agent_script.db import persist_generation_result
from agent_script.logger import init_logger, log_error, log_info
from agent_script.llm_client import GeminiClient
from agent_script.observability import LangSmithObserver
from agent_script.reporter import generate_reports, generation_result_to_dict
from agent_script.utils import load_env_file

DEFAULT_ENV_PATH = Path(__file__).resolve().parents[1] / "functions" / "create-article" / ".env"
DEFAULT_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate government news reports using Gemini.")
    parser.add_argument("--env-file", default=str(DEFAULT_ENV_PATH), help="Path to .env file containing GOOGLE_API_KEY.")
    parser.add_argument("--model", default="gemini-2.5-flash-lite", help="Gemini model name.")
    parser.add_argument("--feeds", nargs="*", help="Optional feed IDs to process (default: all).")
    parser.add_argument("--output", help="Path to write JSON output (default: stdout).")
    parser.add_argument("--log-level", default="INFO", help="Logging level (DEBUG, INFO, WARNING, ERROR).")
    parser.add_argument(
        "--database-url",
        default=os.getenv("DATABASE_URL", DEFAULT_DB_URL),
        help="PostgreSQL connection URL (defaults to local Supabase instance).",
    )
    parser.add_argument(
        "--skip-db",
        action="store_true",
        help="Skip inserting results into the database.",
    )
    parser.add_argument(
        "--rpm-limit",
        type=int,
        default=15,
        help="Maximum Gemini requests per minute (default: 15). When reached the script sleeps until safe.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    init_logger(args.log_level)
    if args.env_file:
        load_env_file(args.env_file)
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        log_error("GOOGLE_API_KEY is not set. Provide it via environment variable or --env-file.")
        raise SystemExit(1)
    
    # Initialize LangSmith observer from environment
    observer = LangSmithObserver.from_env()
    
    client = GeminiClient(model_name=args.model, api_key=api_key, rpm_limit=args.rpm_limit)
    result = generate_reports(client, feed_ids=args.feeds, observer=observer)
    if not args.skip_db and args.database_url:
        persist_generation_result(result, database_url=args.database_url)
    payload_dict = generation_result_to_dict(result)
    payload = json.dumps(payload_dict, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(payload, encoding="utf-8")
        log_info("Report written to file", {"path": args.output})
    else:
        print(payload)


if __name__ == "__main__":
    main()
