"""
Feed configuration shared between the TypeScript edge function and the Python agent.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Mapping, Optional


@dataclass(frozen=True)
class FeedConfig:
    id: str
    title: str
    url: str
    description: Optional[str] = None
    request_headers: Optional[Mapping[str, str]] = None


DEFAULT_FEED_HEADERS: Dict[str, str] = {
    "User-Agent": "Mozilla/5.0 (compatible; JournalistAgent/1.0; +https://local.agent)",
    "Accept": "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.7",
}

DEFAULT_ARTICLE_HEADERS: Dict[str, str] = {
    "User-Agent": "Mozilla/5.0 (compatible; JournalistAgent/1.0; +https://local.agent)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


FEEDS: Dict[str, FeedConfig] = {
    # "kantei": FeedConfig(
    #     id="kantei",
    #     title="首相官邸",
    #     url="https://www.kantei.go.jp/index-jnews.rdf",
    #     description="首相官邸の公式ニュースリリース",
    # ),
    # "mof": FeedConfig(
    #    id="mof",
    #    title="財務省",
    #    url="https://www.mof.go.jp/news.rss",
    #    description="財務省の公式ニュース・報道発表",
    #  ),
    #  "naikakuhu": FeedConfig(
    #    id="naikakuhu",
    #    title="内閣府",
    #    url="https://www.cao.go.jp/rss/news.rdf",
    #    description="内閣府の公式ニュース・報道発表",
    #  ),
    #  "houmu": FeedConfig(
    #    id="houmu",
    #    title="法務省",
    #    url="https://www.moj.go.jp/news.xml",
    #    description="法務省の公式ニュース・報道発表",
    #  ),
     "soumu": FeedConfig(
       id="soumu",
       title="総務省",
       url="https://www.soumu.go.jp/news.rdf",
       description="総務省 ホームページ新着情報",
     ),
    #  "mext": FeedConfig(
    #    id="mext",
    #    title="文部科学省",
    #    url="https://www.mext.go.jp/b_menu/news/index.rdf",
    #    description="文部科学省の公式ニュース・報道発表",
    #  ),
    #  "meti": FeedConfig(
    #    id="meti",
    #    title="経済産業省",
    #    url="http://www.meti.go.jp/ml_index_release_atom.xml",
    #    description="経済産業省の公式ニュース・報道発表",
    #  ),
    #  "mod": FeedConfig(
    #    id="mod",
    #    title="防衛省",
    #    url="https://www.mod.go.jp/j/rss/news.xml",
    #    description="防衛省の公式ニュース・報道発表",
    #  ),
    #  "digital": FeedConfig(
    #    id="digital",
    #    title="デジタル庁",
    #    url="https://www.digital.go.jp/rss/news.xml",
    #    description="デジタル庁の公式ニュース・報道発表",
    #  ),
    #  "mhlw": FeedConfig(
    #    id="mhlw",
    #    title="厚生労働省",
    #    url="https://www.mhlw.go.jp/stf/news.rdf",
    #    description="厚生労働省の公式ニュース・報道発表",
    #  ),
    #  "maff": FeedConfig(
    #    id="maff",
    #    title="農林水産省",
    #    url="https://www.maff.go.jp/j/press/rss.xml",
    #    description="農林水産省の公式ニュース・報道発表",
    #  ),
    #  "mlit": FeedConfig(
    #    id="mlit",
    #    title="国土交通省",
    #    url="https://www.mlit.go.jp/pressrelease.rdf",
    #    description="国土交通省の公式ニュース・報道発表",
    #  ),
    #  "fsa": FeedConfig(
    #    id="fsa",
    #    title="金融庁",
    #    url="https://www.fsa.go.jp/fsaNewsListAll_rss2.xml",
    #    description="金融庁の公式ニュース・報道発表",
    #  ),
    #  "caa": FeedConfig(
    #    id="caa",
    #    title="消費者庁",
    #    url="https://www.caa.go.jp/news.rss",
    #    description="消費者庁の公式ニュース・報道発表",
    #  ),
    #  "chushokigyo": FeedConfig(
    #    id="chushokigyo",
    #    title="中小企業庁",
    #    url="https://www.chusho.meti.go.jp/rss/index.xml",
    #    description="中小企業庁の公式ニュース・報道発表",
    #  ),
    #  "seihukouhou": FeedConfig(
    #    id="seihukouhou",
    #    title="政府広報オンライン",
    #    url="https://www.gov-online.go.jp/rss/index.rdf",
    #    description="政府広報オンラインの公式ニュース・報道発表",
    #  ),
}