import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { parseFeed } from "https://deno.land/x/rss/mod.ts";
import { ChatGoogleGenerativeAI } from "npm:@langchain/google-genai";
import { z } from "npm:zod";

import { type FeedConfig, FEEDS } from "./src/config.ts";
import { createFetchArticleTool } from "./src/tools.ts";
import {
  feedComposerPrompt,
  newsSummaryPrompt,
  skepticalCriticPrompt,
  summaryRepairPrompt,
  supportiveCriticPrompt,
  synthesisPrompt,
} from "./src/prompts.ts";
import {
  createAgentRunner,
  parseJsonWithSchema,
  runChatPrompt,
  runJsonPrompt,
} from "./src/agent.ts";
import { cleanText, isWithinLastDay, resolveTextField } from "./src/utils.ts";
import { initLogger, logDebug, logError, logInfo, logWarn } from "./src/log.ts";


const summarySchema = z.object({
  headline: z.string(),
  summary: z.string(),
  key_points: z.array(z.string()).max(5),
});

const composedArticleSchema = z.object({
  title: z.string(),
  body: z.string(),
});

const DEFAULT_FEED_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; JournalistAgent/1.0; +https://local.agent)",
  Accept:
    "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.7",
};

let loggerInitialized = false;
const ensureLogger = () => {
  if (!loggerInitialized) {
    initLogger();
    loggerInitialized = true;
  }
};

export const fetchFeedEntries = async (feed: FeedConfig) => {
  logDebug(`Fetching RSS feed: ${feed.title} (${feed.url})`);
  const response = await fetch(feed.url, {
    headers: {
      ...DEFAULT_FEED_HEADERS,
      ...feed.requestHeaders,
    },
  });
  if (!response.ok) {
    logError(
      `Failed to fetch RSS feed: ${feed.title} (${feed.url}) ${response.status} ${response.statusText}`,
    );
    throw new Error(
      `Failed to fetch RSS feed: ${response.status} ${response.statusText}`,
    );
  }
  const xml = await response.text();
  const { entries } = await parseFeed(xml);
  logDebug(`Fetched ${entries.length} entries from ${feed.title}`);
  return entries;
};

type FeedReportItem = {
  url: string;
  source_headline: string;
  source_published: string;
  headline: string;
  summary: string;
  key_points: string[];
  critiques: {
    positive: string;
    critical: string;
    synthesized_article: string;
  };
};

type FeedReport = {
  feed: {
    id: string;
    title: string;
    url: string;
    description?: string;
  };
  items: FeedReportItem[];
  composed_article: {
    title: string;
    body: string;
  };
};

const processFeed = async (
  feed: FeedConfig,
  model: ChatGoogleGenerativeAI,
  now: Date,
): Promise<FeedReport | null> => {
  logInfo(`Processing feed: ${feed.title}`);
  const fetchArticleTool = createFetchArticleTool();
  const tools = [fetchArticleTool];
  const summaryAgent = createAgentRunner({
    model,
    tools,
    prompt: newsSummaryPrompt,
  });

  const entries = await fetchFeedEntries(feed);
  const recentEntries = entries.filter((entry) =>
    isWithinLastDay(entry.published ?? entry.updated, now)
  );

  if (recentEntries.length === 0) {
    logInfo(`No entries within last day for feed: ${feed.title}`);
    return null;
  }

  const items: FeedReportItem[] = [];

  for (const entry of recentEntries) {
    logDebug(`Processing entry: ${String(entry.title ?? "(untitled)")}`);
    const targetUrl = entry.links?.[0]?.href;
    if (!targetUrl) {
      logWarn("Entry skipped due to missing URL.");
      continue;
    }
    const entryRecord = entry as unknown as Record<string, unknown>;
    const titleText = cleanText(resolveTextField(entry.title)) || "無題";
    const categories = entry.categories?.map((c) => c.label ?? c.term).join(
      ", ",
    ) ?? "不明";
    const rawContentCandidates = [
      entry.content,
      entry.description,
      entryRecord["content:encoded"],
    ];
    const rssContentSource =
      rawContentCandidates.map(resolveTextField).find((value) => value) ?? "";
    const rssContent = cleanText(rssContentSource) || "RSS提供情報なし";
    let articleText: string;
    try {
      logDebug(`Fetching article content: ${targetUrl}`);
      const fetched = await fetchArticleTool.invoke({ url: targetUrl });
      articleText = typeof fetched === "string"
        ? fetched
        : JSON.stringify(fetched);
      if (!articleText) {
        logWarn("記事本文の取得結果が空でした。", { url: targetUrl });
        console.error("記事本文の取得結果が空でした:", targetUrl);
        continue;
      }
      logDebug(
        `Fetched article content length: ${articleText.length}`,
      );
    } catch (error) {
      logError("記事本文の取得に失敗しました。", { url: targetUrl, error });
      console.error("記事本文の取得に失敗しました:", error);
      continue;
    }
    const articleExcerpt = articleText.slice(0, 8000);
    const summaryInput = {
      feedTitle: feed.title,
      title: titleText,
      published: entry.publishedRaw ?? entry.updatedRaw ?? "不明",
      categories,
      url: targetUrl,
      rssContent,
      requirements:
        "実行時点から24時間以内の記事のみ対象。事実に基づき、読者が状況を理解できるようにまとめてください。",
    };
    let summaryResult;
    let rawSummaryOutput = "";
    try {
      rawSummaryOutput = await summaryAgent(summaryInput);
      summaryResult = parseJsonWithSchema(rawSummaryOutput, summarySchema);
    } catch (error) {
      logWarn(
        "サマリー生成のJSON解析に失敗しました。再フォーマットを試みます。",
        { feedId: feed.id, articleUrl: targetUrl, error },
      );
      console.warn(
        "サマリー生成のJSON解析に失敗しました。再フォーマットを試みます。",
        error,
      );
      try {
        summaryResult = await runJsonPrompt(
          summaryRepairPrompt,
          model,
          {
            feedTitle: feed.title,
            title: titleText,
            article: articleExcerpt,
            rawOutput: rawSummaryOutput || String(error),
          },
          summarySchema,
        );
      } catch (repairError) {
        logError("サマリー生成に失敗しました。", {
          feedId: feed.id,
          articleUrl: targetUrl,
          error: repairError,
        });
        console.error("サマリー生成に失敗しました:", repairError);
        continue;
      }
    }

    const keyPointsText = summaryResult.key_points.length > 0
      ? summaryResult.key_points.join(" / ")
      : "ポイント情報なし";

    let positiveView: string;
    try {
      logDebug("Generating positive critique...");
      positiveView = await runChatPrompt(supportiveCriticPrompt, model, {
        feedTitle: feed.title,
        headline: summaryResult.headline,
        article: articleExcerpt,
        summary: summaryResult.summary,
        keyPoints: keyPointsText,
      });
    } catch (error) {
      logError("肯定的論評の生成に失敗しました。", {
        feedId: feed.id,
        articleUrl: targetUrl,
        error,
      });
      console.error("肯定的論評の生成に失敗しました:", error);
      positiveView = "肯定的な論評の生成に失敗しました。";
    }

    let criticalView: string;
    try {
      logDebug("Generating critical critique...");
      criticalView = await runChatPrompt(skepticalCriticPrompt, model, {
        feedTitle: feed.title,
        headline: summaryResult.headline,
        article: articleExcerpt,
        summary: summaryResult.summary,
        keyPoints: keyPointsText,
      });
    } catch (error) {
      logError("批判的論評の生成に失敗しました。", {
        feedId: feed.id,
        articleUrl: targetUrl,
        error,
      });
      console.error("批判的論評の生成に失敗しました:", error);
      criticalView = "批判的な論評の生成に失敗しました。";
    }

    let synthesizedArticle: string;
    try {
      logDebug("Generating synthesized article...");
      synthesizedArticle = await runChatPrompt(synthesisPrompt, model, {
        feedTitle: feed.title,
        headline: summaryResult.headline,
        summary: summaryResult.summary,
        keyPoints: keyPointsText,
        positive: positiveView,
        critical: criticalView,
      });
    } catch (error) {
      logError("統合記事の生成に失敗しました。", {
        feedId: feed.id,
        articleUrl: targetUrl,
        error,
      });
      console.error("統合記事の生成に失敗しました:", error);
      synthesizedArticle =
        "肯定・批判の論評を踏まえた統合記事の生成に失敗しました。";
    }

    items.push({
      url: targetUrl,
      source_headline: titleText,
      source_published: entry.publishedRaw ?? entry.updatedRaw ?? "不明",
      headline: summaryResult.headline,
      summary: summaryResult.summary,
      key_points: summaryResult.key_points,
      critiques: {
        positive: positiveView,
        critical: criticalView,
        synthesized_article: synthesizedArticle,
      },
    });
  }

  if (items.length === 0) {
    return null;
  }

  let composedArticle: { title: string; body: string };
  try {
    logDebug("Generating daily digest article for feed...");
    const itemSummaries = items.map((item, index) => {
      const points = item.key_points.length > 0
        ? item.key_points.join(" / ")
        : "ポイント情報なし";
      return `(${
        index + 1
      }) ${item.headline}\n要約: ${item.summary}\n重要ポイント: ${points}`;
    }).join("\n\n");

    const positiveHighlights = items.map((item, index) =>
      `(${index + 1}) ${item.critiques.positive}`
    ).join("\n");
    const criticalHighlights = items.map((item, index) =>
      `(${index + 1}) ${item.critiques.critical}`
    ).join("\n");
    const synthesizedHighlights = items.map((item, index) =>
      `(${index + 1}) ${item.critiques.synthesized_article}`
    ).join("\n");

    composedArticle = await runJsonPrompt(
      feedComposerPrompt,
      model,
      {
        feedTitle: feed.title,
        date: now.toISOString(),
        itemCount: items.length,
        itemSummaries,
        positiveHighlights,
        criticalHighlights,
        synthesizedHighlights,
      },
      composedArticleSchema,
    );
  } catch (error) {
    logError("日次ダイジェスト記事の生成に失敗しました。", {
      feedId: feed.id,
      error,
    });
    console.error("日次ダイジェスト記事の生成に失敗しました:", error);
    composedArticle = {
      title: `${feed.title} 日次ダイジェスト`,
      body: "日次ダイジェスト記事の生成に失敗しました。",
    };
  }

  return {
    feed: {
      id: feed.id,
      title: feed.title,
      url: feed.url,
      description: feed.description,
    },
    items,
    composed_article: composedArticle,
  };
};

export const generateReports = async (now = new Date()) => {
  ensureLogger();
  const apiKey = "AIzaSyBS4LHxZ67duWBoCP-pYxa_L_IdYEAjgBs";
  if (!apiKey) {
    const message = "GOOGLE_API_KEY is not set in environment";
    logError(message);
    throw new Error(message);
  }
  const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash-lite",
    apiKey,
  });

  const reports: FeedReport[] = [];

  for (const feed of Object.values(FEEDS)) {
    try {
      const report = await processFeed(feed, model, now);
      if (report) {
        logInfo(
          `Feed processed successfully: ${feed.title}, items: ${report.items.length}`,
        );
        reports.push(report);
      }
    } catch (error) {
      logError(
        `フィード処理中にエラーが発生しました (${feed.title}): ${error}`,
        { feedId: feed.id, error },
      );
      console.error(
        `フィード処理中にエラーが発生しました (${feed.title}):`,
        error,
      );
    }
  }

  if (reports.length === 0) {
    logWarn("最新24時間以内の記事は見つかりませんでした。");
    return {
      generatedAt: now.toISOString(),
      feedsProcessed: 0,
      reports,
    };
  }

  logInfo(
    `Completed processing. Generated ${reports.length} feed reports.`,
  );
  return {
    generatedAt: now.toISOString(),
    feedsProcessed: reports.length,
    reports,
  };
};

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};

Deno.serve(async (request) => {
  ensureLogger();
  logInfo("Edge function request received", {
    method: request.method,
    url: request.url,
  });

  try {
    const report = await generateReports();
    logInfo("Edge function request completed", {
      feedsProcessed: report.feedsProcessed,
    });
    return new Response(JSON.stringify(report), {
      headers: jsonHeaders,
    });
  } catch (rawError) {
    const errorInfo =
      rawError instanceof Error
        ? { message: rawError.message, stack: rawError.stack }
        : { message: String(rawError) };
    logError("Edge function request failed", { error: errorInfo });
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
