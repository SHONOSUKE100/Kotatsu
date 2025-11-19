"""
RSS and article fetching helpers.
"""

from __future__ import annotations

import datetime as dt
from collections import deque
from dataclasses import dataclass
from io import BytesIO
from typing import Iterable, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

import feedparser  # type: ignore
import requests
from bs4 import BeautifulSoup  # type: ignore
from pdfminer.high_level import extract_text as extract_pdf_text  # type: ignore

from agent_script.config import DEFAULT_FEED_HEADERS, FeedConfig
from agent_script.logger import log_debug, log_error, log_warning
from agent_script.utils import clean_text, parse_struct_time, resolve_text_field


class ArticleFetchError(RuntimeError):
    pass


@dataclass
class FeedEntry:
    title: str
    link: str
    published: Optional[dt.datetime]
    published_raw: str
    categories: str
    rss_content: str


@dataclass
class LinkContext:
    url: str
    title: str
    depth: int
    media_type: str
    snippet: str


def fetch_feed_entries(feed: FeedConfig) -> List[FeedEntry]:
    headers = {**DEFAULT_FEED_HEADERS, **(feed.request_headers or {})}
    log_debug("Fetching RSS feed", {"feed": feed.id, "url": feed.url})
    response = requests.get(feed.url, headers=headers, timeout=30)
    response.raise_for_status()
    parsed = feedparser.parse(response.content)
    entries: List[FeedEntry] = []
    for entry in parsed.entries:
        link = ""
        if entry.get("links"):
            link = entry.links[0].get("href", "")
        link = entry.get("link", link)
        if not link:
            log_warning("Entry skipped due to missing URL", {"feed": feed.id})
            continue
        categories = ", ".join(cat.get("label") or cat.get("term") for cat in entry.get("tags", [])) or "不明"
        rss_content = (
            clean_text(resolve_text_field(entry.get("summary")))
            or clean_text(resolve_text_field(entry.get("description")))
            or "RSS提供情報なし"
        )
        published = parse_struct_time(
            entry.get("published_parsed")
            or entry.get("updated_parsed")
            or entry.get("published")
            or entry.get("updated")
        )
        published_raw = (
            entry.get("published")
            or entry.get("updated")
            or entry.get("published_parsed")
            or entry.get("updated_parsed")
            or "不明"
        )
        entries.append(
            FeedEntry(
                title=clean_text(entry.get("title", "") or "無題"),
                link=link,
                published=published,
                published_raw=str(published_raw),
                categories=categories,
                rss_content=rss_content,
            )
        )
    log_debug("Fetched entries", {"feed": feed.id, "count": len(entries)})
    return entries


MAIN_SELECTORS = ["article", "main", "#main", ".main", ".article-body"]
TEXT_SELECTORS = ["p", "h2", "h3", "li"]
MAX_ARTICLE_CHARS = 12000
MAX_RELATED_LINKS = 6
MAX_LINK_DEPTH = 3
MAX_LINKS_PER_LEVEL = 3


def fetch_article_text(url: str) -> str:
    log_debug("Fetching article", {"url": url})
    main_text, soup = _fetch_html_content(url)
    related_links = _analyze_related_links(url, soup)
    if not related_links:
        return main_text[:MAX_ARTICLE_CHARS]
    related_section = _format_related_links(related_links)
    enriched = f"{main_text}\n\n[関連リンク分析]\n{related_section}"
    return enriched[:MAX_ARTICLE_CHARS]


def _fetch_html_content(url: str) -> Tuple[str, BeautifulSoup]:
    response = requests.get(url, timeout=30)
    if not response.ok:
        raise ArticleFetchError(f"Failed to fetch article: {response.status_code}")
    soup = BeautifulSoup(response.text, "html.parser")
    content = _extract_text_from_soup(soup)
    if not content:
        raise ArticleFetchError("記事本文を抽出できませんでした。")
    return content, soup


def _extract_text_from_soup(soup: BeautifulSoup) -> str:
    main = None
    for selector in MAIN_SELECTORS:
        main = soup.select_one(selector)
        if main is not None:
            break
    if main is None:
        main = soup.body or soup
    elements = main.select(",".join(TEXT_SELECTORS))
    paragraphs = [clean_text(node.get_text(separator=" ", strip=True)) for node in elements]
    return clean_text("\n".join(line for line in paragraphs if line))


def _detect_media_type(url: str, content_type: Optional[str]) -> str:
    lowered = (content_type or "").lower()
    url_lower = url.lower()
    if "pdf" in lowered or url_lower.endswith(".pdf"):
        return "pdf"
    if lowered.startswith("image/") or url_lower.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg")):
        return "image"
    if lowered.startswith("video/") or url_lower.endswith((".mp4", ".mov", ".m4v", ".wmv")):
        return "video"
    if lowered.startswith("application/json"):
        return "api"
    return "html"


def _fetch_resource_content(url: str) -> Tuple[str, Optional[BeautifulSoup], str]:
    response = requests.get(url, timeout=30)
    if not response.ok:
        raise ArticleFetchError(f"Failed to fetch resource: {response.status_code}")
    media_type = _detect_media_type(url, response.headers.get("Content-Type"))
    if media_type == "pdf":
        try:
            text = clean_text(extract_pdf_text(BytesIO(response.content)))
        except Exception as error:  # pylint: disable=broad-except
            raise ArticleFetchError("PDFのテキスト抽出に失敗しました。") from error
        return text, None, media_type
    if media_type == "image":
        description = response.headers.get("content-description") or response.headers.get("x-image-meta")
        text = f"画像リソース。{description or '付随するテキスト情報は提供されていません。'}"
        return text, None, media_type
    if media_type == "video":
        text = "動画リソース。字幕や説明文の取得には対応していません。"
        return text, None, media_type
    if media_type == "api":
        return clean_text(response.text), None, media_type
    soup = BeautifulSoup(response.text, "html.parser")
    return _extract_text_from_soup(soup), soup, media_type


def _analyze_related_links(base_url: str, soup: BeautifulSoup) -> List[LinkContext]:
    base_host = urlparse(base_url).netloc.lower()
    candidates = _extract_candidate_links(soup, base_url)
    queue = deque([(link_url, text, 1) for link_url, text in candidates[:MAX_LINKS_PER_LEVEL]])
    visited = {base_url}
    related: List[LinkContext] = []
    while queue and len(related) < MAX_RELATED_LINKS:
        link_url, link_text, depth = queue.popleft()
        if link_url in visited or not _should_follow_link(base_host, link_url):
            continue
        visited.add(link_url)
        try:
            text, child_soup, media_type = _fetch_resource_content(link_url)
        except ArticleFetchError as error:
            log_debug("関連リンクの取得に失敗", {"url": link_url, "error": str(error)})
            continue
        snippet = clean_text(text[:600]) if text else "関連リンクからテキストを取得できませんでした。"
        title = link_text or "関連リンク"
        related.append(LinkContext(url=link_url, title=title, depth=depth, media_type=media_type, snippet=snippet))
        if child_soup is not None and depth < MAX_LINK_DEPTH:
            child_candidates = _extract_candidate_links(child_soup, link_url)
            for child_url, child_text in child_candidates[:MAX_LINKS_PER_LEVEL]:
                if child_url not in visited:
                    queue.append((child_url, child_text, depth + 1))
    return related


def _should_follow_link(base_host: str, candidate_url: str) -> bool:
    parsed = urlparse(candidate_url)
    if parsed.scheme not in {"http", "https"}:
        return False
    target_host = parsed.netloc.lower()
    if not target_host:
        return False
    if target_host == base_host or target_host.endswith(f".{base_host}"):
        return True
    if base_host.endswith(".go.jp") and target_host.endswith(".go.jp"):
        return True
    if target_host.endswith(".lg.jp"):
        return True
    return False


def _extract_candidate_links(soup: BeautifulSoup, base_url: str) -> List[Tuple[str, str]]:
    candidates: List[Tuple[str, str]] = []
    seen: set[str] = set()
    for anchor in soup.find_all("a"):
        href = anchor.get("href")
        if not href:
            continue
        href = href.strip()
        if not href or href.startswith("#") or href.lower().startswith("javascript:"):
            continue
        absolute = urljoin(base_url, href)
        if absolute in seen:
            continue
        seen.add(absolute)
        text = clean_text(anchor.get_text(" ", strip=True))
        candidates.append((absolute, text))
    return candidates


def _format_related_links(links: List[LinkContext]) -> str:
    lines = []
    for link in links:
        lines.append(
            f"- 深さ{link.depth} / 種別: {link.media_type} / {link.title}\n  URL: {link.url}\n  概要: {link.snippet}"
        )
    return "\n\n".join(lines)
