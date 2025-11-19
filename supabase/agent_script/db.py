"""
Persistence helpers for writing generation results into PostgreSQL.
"""

from __future__ import annotations

import os
import uuid
from typing import Optional

import psycopg
from psycopg.types.json import Json

from agent_script.logger import log_error, log_info, log_warning
from agent_script.reporter import GenerationResult
from agent_script.utils import dataclass_to_dict

DEFAULT_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"


def persist_generation_result(
    result: GenerationResult,
    *,
    database_url: Optional[str] = None,
) -> None:
    if result.feeds_processed == 0:
        log_warning("No feed reports generated; skipping DB persistence.")
        return
    db_url = database_url or os.getenv("DATABASE_URL") or DEFAULT_DB_URL
    log_info("Persisting reports to database", {"url": db_url})
    try:
        with psycopg.connect(db_url) as conn:
            with conn.cursor() as cur:
                for report in result.reports:
                    run_id = uuid.uuid4()
                    cur.execute(
                        """
                        insert into daily_report_runs (
                            id, feed_id, feed_title, feed_url, feed_description,
                            generated_at, item_count, composed_title, composed_body, raw_report
                        ) values (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                        )
                        """,
                        (
                            run_id,
                            report.feed.id,
                            report.feed.title,
                            report.feed.url,
                            report.feed.description,
                            result.generated_at,
                            len(report.items),
                            report.composed_article.title,
                            report.composed_article.body,
                            Json(dataclass_to_dict(report)),
                        ),
                    )
                    for item in report.items:
                        cur.execute(
                            """
                            insert into daily_report_items (
                                id, run_id, source_url, source_headline, source_published,
                                summary_headline, summary_body, key_points,
                                positive_view, critical_view, synthesized_view
                            ) values (
                                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                            )
                            """,
                            (
                                uuid.uuid4(),
                                run_id,
                                item.url,
                                item.source_headline,
                                item.source_published,
                                item.headline,
                                item.summary,
                                Json(item.key_points),
                                item.critiques.positive,
                                item.critiques.critical,
                                item.critiques.synthesized_article,
                            ),
                        )
            conn.commit()
        log_info("Reports persisted successfully", {"runs": result.feeds_processed})
    except Exception as error:  # pylint: disable=broad-except
        log_error("Failed to persist reports to database", {"error": str(error)})
        raise
