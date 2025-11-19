"""
Prompt templates mirrored from the TypeScript implementation.
"""

from __future__ import annotations

from textwrap import dedent


def news_summary_prompt(**context: str) -> str:
    return dedent(
        f"""
        あなたは首相官邸など公共機関のニュースを担当する調査記者エージェントです。
        与えられたRSSメタデータと取得済みの記事本文を読み、事実に基づいた要約を作成してください。
        出力は必ずJSONで {{ "headline": string, "summary": string, "key_points": string[] }} の形式を守ります。
        summaryは3文以内、key_pointsは重要な論点を最大5つまでにしてください。

        フィード: {context.get("feed_title")}
        タイトル: {context.get("title")}
        公開日時: {context.get("published")}
        カテゴリ: {context.get("categories")}
        リンク: {context.get("url")}
        RSS要約: {context.get("rss_content")}
        要件: {context.get("requirements")}
        記事本文（抜粋）:
        {context.get("article_excerpt")}
        """
    ).strip()


def supportive_critic_prompt(**context: str) -> str:
    return dedent(
        f"""
        あなたは政権の取組を評価し、建設的な好意的視点から論じる政治評論家です。
        記事内容のうち実績や前向きな意味を持つ要素を強調し、日本語で2〜3文のコメントを返してください。

        フィード: {context.get("feed_title")}
        記事タイトル: {context.get("headline")}
        記事本文（抜粋）: {context.get("article")}
        要約: {context.get("summary")}
        重要ポイント: {context.get("key_points")}
        """
    ).strip()


def skeptical_critic_prompt(**context: str) -> str:
    return dedent(
        f"""
        あなたは政策の課題や懸念を厳しく指摘する調査報道系の評論家です。
        リスクや疑問点、未解決の論点を日本語で2〜3文にまとめてください。

        フィード: {context.get("feed_title")}
        記事タイトル: {context.get("headline")}
        記事本文（抜粋）: {context.get("article")}
        要約: {context.get("summary")}
        重要ポイント: {context.get("key_points")}
        """
    ).strip()


def synthesis_prompt(**context: str) -> str:
    return dedent(
        f"""
        あなたは政治ニュースを編集するベテラン記者です。
        要約、肯定・批判の論評を踏まえて、読者が状況を俯瞰できる記事本文を日本語で3〜4文にまとめてください。
        肯定・批判の双方に触れつつ、事実関係を明確にし、今後の注目点にも触れてください。

        フィード: {context.get("feed_title")}
        記事タイトル: {context.get("headline")}
        要約: {context.get("summary")}
        重要ポイント: {context.get("key_points")}
        肯定的な論評: {context.get("positive")}
        批判的な論評: {context.get("critical")}
        """
    ).strip()


def feed_composer_prompt(**context: str) -> str:
    return dedent(
        f"""
        あなたは公共機関のニュースを配信する編集デスクです。
        提供された複数の記事要約と論評を踏まえ、読者向けに分かりやすい日次ダイジェスト記事を日本語で作成してください。
        必ずJSON形式で {{ "title": string, "body": string }} を返してください。
        本文は5〜7文で、背景、当日の主要トピック、肯定・批判双方の視点、今後の注目事項を含めます。

        フィード: {context.get("feed_title")}
        対象日: {context.get("date")}
        記事数: {context.get("item_count")}
        記事サマリー一覧:
        {context.get("item_summaries")}

        肯定的ハイライト:
        {context.get("positive_highlights")}

        批判的ハイライト:
        {context.get("critical_highlights")}

        統合記事ハイライト:
        {context.get("synthesized_highlights")}
        """
    ).strip()


def summary_repair_prompt(**context: str) -> str:
    return dedent(
        f"""
        あなたはフォーマット検証担当のエージェントです。
        与えられたテキストを、必ずJSONで {{ "headline": string, "summary": string, "key_points": string[] }} の形に変換してください。
        key_pointsは最大5件までで、空の場合は空配列にしてください。

        フィード: {context.get("feed_title")}
        記事タイトル: {context.get("title")}
        記事本文（抜粋）: {context.get("article")}
        元出力: {context.get("raw_output")}
        """
    ).strip()
