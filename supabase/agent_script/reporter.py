"""
Core orchestration logic for fetching feeds and generating reports.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence

from agent_script import prompts
from agent_script.article_fetcher import (
    ArticleFetchError,
    FeedEntry,
    fetch_article_text,
    fetch_feed_entries,
)
from agent_script.config import FEEDS, FeedConfig
from agent_script.llm_client import GeminiClient
from agent_script.logger import log_debug, log_error, log_info, log_warning
from agent_script.utils import JsonParsingError, clean_text, dataclass_to_dict, is_within_last_day


@dataclass
class Critiques:
    positive: str
    critical: str
    synthesized_article: str


@dataclass
class FeedReportItem:
    url: str
    source_headline: str
    source_published: str
    headline: str
    summary: str
    key_points: List[str]
    critiques: Critiques


@dataclass
class FeedInfo:
    id: str
    title: str
    url: str
    description: str


@dataclass
class ComposedArticle:
    title: str
    body: str


@dataclass
class FeedReport:
    feed: FeedInfo
    items: List[FeedReportItem]
    composed_article: ComposedArticle


@dataclass
class GenerationResult:
    generated_at: dt.datetime
    feeds_processed: int
    reports: List[FeedReport]


def _summarize_entry(
    feed: FeedConfig,
    entry: FeedEntry,
    article_text: str,
    client: GeminiClient,
) -> Dict[str, object]:
    article_excerpt = article_text[:8000]
    prompt = prompts.news_summary_prompt(
        feed_title=feed.title,
        title=entry.title,
        published=entry.published_raw,
        categories=entry.categories,
        url=entry.link,
        rss_content=entry.rss_content,
        requirements="実行時点から24時間以内の記事のみ対象。事実に基づき、読者が状況を理解できるようにまとめてください。",
        article_excerpt=article_excerpt,
    )
    try:
        summary = client.generate_json(prompt)
    except JsonParsingError as error:
        log_warning("Summary JSON parsing failed, attempting repair", {"feed": feed.id, "url": entry.link})
        repair_prompt = prompts.summary_repair_prompt(
            feed_title=feed.title,
            title=entry.title,
            article=article_excerpt,
            raw_output=error.raw_text or "",
        )
        summary = client.generate_json(repair_prompt)
    summary.setdefault("key_points", [])
    if not isinstance(summary["key_points"], list):
        summary["key_points"] = [clean_text(str(summary["key_points"]))]
    summary["key_points"] = [clean_text(str(point)) for point in summary["key_points"] if clean_text(str(point))]
    return summary


def _generate_critiques(
    feed: FeedConfig,
    summary: Dict[str, object],
    article_excerpt: str,
    client: GeminiClient,
) -> Critiques:
    key_points_text = " / ".join(summary.get("key_points", [])) or "ポイント情報なし"
    positive = client.generate_text(
        prompts.supportive_critic_prompt(
            feed_title=feed.title,
            headline=summary.get("headline"),
            article=article_excerpt,
            summary=summary.get("summary"),
            key_points=key_points_text,
        ),
        temperature=0.4,
    )
    critical = client.generate_text(
        prompts.skeptical_critic_prompt(
            feed_title=feed.title,
            headline=summary.get("headline"),
            article=article_excerpt,
            summary=summary.get("summary"),
            key_points=key_points_text,
        ),
        temperature=0.4,
    )
    synthesized = client.generate_text(
        prompts.synthesis_prompt(
            feed_title=feed.title,
            headline=summary.get("headline"),
            summary=summary.get("summary"),
            key_points=key_points_text,
            positive=positive,
            critical=critical,
        ),
        temperature=0.3,
    )
    return Critiques(
        positive=positive or "肯定的な論評の生成に失敗しました。",
        critical=critical or "批判的な論評の生成に失敗しました。",
        synthesized_article=synthesized or "肯定・批判の論評を踏まえた統合記事の生成に失敗しました。",
    )


def _compose_daily_digest(
    feed: FeedConfig,
    items: List[FeedReportItem],
    client: GeminiClient,
    now: dt.datetime,
) -> ComposedArticle:
    item_summaries = []
    positive_hl = []
    critical_hl = []
    synthesized_hl = []
    for index, item in enumerate(items, start=1):
        points = " / ".join(item.key_points) if item.key_points else "ポイント情報なし"
        item_summaries.append(f"({index}) {item.headline}\n要約: {item.summary}\n重要ポイント: {points}")
        positive_hl.append(f"({index}) {item.critiques.positive}")
        critical_hl.append(f"({index}) {item.critiques.critical}")
        synthesized_hl.append(f"({index}) {item.critiques.synthesized_article}")
    prompt = prompts.feed_composer_prompt(
        feed_title=feed.title,
        date=now.isoformat(),
        item_count=len(items),
        item_summaries="\n\n".join(item_summaries),
        positive_highlights="\n".join(positive_hl),
        critical_highlights="\n".join(critical_hl),
        synthesized_highlights="\n".join(synthesized_hl),
    )
    try:
        article = client.generate_json(prompt)
        return ComposedArticle(
            title=article.get("title", f"{feed.title} 日次ダイジェスト"),
            body=article.get("body", "日次ダイジェスト記事の生成に失敗しました。"),
        )
    except JsonParsingError:
        log_error("Daily digest generation failed, returning fallback", {"feed": feed.id})
        return ComposedArticle(
            title=f"{feed.title} 日次ダイジェスト",
            body="日次ダイジェスト記事の生成に失敗しました。",
        )


def _process_entry(feed: FeedConfig, entry: FeedEntry, client: GeminiClient) -> Optional[FeedReportItem]:
    try:
        article_text = fetch_article_text(entry.link)
    except ArticleFetchError as error:
        log_error("記事本文の取得に失敗しました", {"url": entry.link, "error": str(error)})
        return None
    summary = _summarize_entry(feed, entry, article_text, client)
    critiques = _generate_critiques(feed, summary, article_text[:8000], client)
    return FeedReportItem(
        url=entry.link,
        source_headline=entry.title,
        source_published=entry.published_raw,
        headline=summary.get("headline", entry.title),
        summary=summary.get("summary", ""),
        key_points=list(summary.get("key_points", [])),
        critiques=critiques,
    )


def process_feed(feed: FeedConfig, client: GeminiClient, now: dt.datetime) -> Optional[FeedReport]:
    log_info("Processing feed", {"feed": feed.id})
    entries = fetch_feed_entries(feed)
    recent_entries = [entry for entry in entries if is_within_last_day(entry.published, now=now)]
    if not recent_entries:
        log_info("No recent entries", {"feed": feed.id})
        return None

    items: List[FeedReportItem] = []
    for entry in recent_entries:
        log_debug("Processing entry", {"feed": feed.id, "title": entry.title})
        item = _process_entry(feed, entry, client)
        if item:
            items.append(item)
    if not items:
        return None

    composed_article = _compose_daily_digest(feed, items, client, now)
    return FeedReport(
        feed=FeedInfo(
            id=feed.id,
            title=feed.title,
            url=feed.url,
            description=feed.description or "",
        ),
        items=items,
        composed_article=composed_article,
    )


def generate_reports(
    client: GeminiClient,
    *,
    now: Optional[dt.datetime] = None,
    feed_ids: Optional[Sequence[str]] = None,
) -> GenerationResult:
    now = now or dt.datetime.now(dt.timezone.utc)
    selected_feeds: List[FeedConfig]
    if feed_ids:
        selected_feeds = [FEEDS[feed_id] for feed_id in feed_ids if feed_id in FEEDS]
    else:
        selected_feeds = list(FEEDS.values())
    reports: List[FeedReport] = []
    for feed in selected_feeds:
        try:
            report = process_feed(feed, client, now)
        except Exception as error:  # pylint: disable=broad-except
            log_error("フィード処理中にエラーが発生しました", {"feed": feed.id, "error": str(error)})
            continue
        if report:
            reports.append(report)
            log_info("Feed processed successfully", {"feed": feed.id, "items": len(report.items)})
    return GenerationResult(
        generated_at=now,
        feeds_processed=len(reports),
        reports=reports,
    )


def generation_result_to_dict(result: GenerationResult) -> Dict[str, object]:
    return {
        "generatedAt": result.generated_at.isoformat(),
        "feedsProcessed": result.feeds_processed,
        "reports": [dataclass_to_dict(report) for report in result.reports],
    }
