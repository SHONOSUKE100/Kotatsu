"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCcw,
  Server,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

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

type RunReportPayload =
  | RunReportSuccess
  | {
      ok: false;
      error?: string;
    };

const isRunReportSuccess = (payload: RunReportPayload): payload is RunReportSuccess => {
  return (
    payload?.ok === true &&
    typeof payload.generatedAt === "string" &&
    typeof payload.elapsedMs === "number" &&
    typeof payload.feedsProcessed === "number" &&
    Array.isArray(payload.reports)
  );
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

type RunReportSuccess = {
  ok: true;
  generatedAt: string;
  feedsProcessed: number;
  reports: FeedReport[];
  elapsedMs: number;
};

export function RunReportPanel() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<RunReportSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "バックエンドの呼び出しに失敗しました。");
      }

      const payload = (await response.json()) as RunReportPayload;
      if (!isRunReportSuccess(payload)) {
        throw new Error(
          payload?.error || "バックエンドの処理がエラーで終了しました。",
        );
      }

      setResult(payload);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "予期しないエラーが発生しました。";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const hasReports = (result?.reports?.length ?? 0) > 0;
  const reportList =
    result?.reports.map((report) => ({
      id: report.feed.id,
      title: report.feed.title,
      count: report.items.length,
    })) ?? [];

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl">
          <Server className="h-6 w-6 text-primary" aria-hidden />
          レポート実行モニター
        </CardTitle>
        <CardDescription>
          バックエンドのコマンドを実行して、生成されたレポートを確認できます。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button onClick={handleRun} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                実行中…
              </>
            ) : (
              <>
                <RefreshCcw className="mr-2 h-4 w-4" aria-hidden />
                最新レポートを取得
              </>
            )}
          </Button>
          <p className="text-sm text-muted-foreground">
            環境変数
            <code className="mx-1 rounded bg-muted px-1 py-0.5">
              NEXT_PUBLIC_BACKEND_URL
            </code>
            を設定すると、リクエスト先を変更できます。
          </p>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4" aria-hidden />
            <p>{error}</p>
          </div>
        ) : null}

        {result ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/30 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
                <span>実行が完了しました</span>
              </div>
              <div className="flex flex-col gap-1 text-muted-foreground sm:flex-row sm:items-center sm:gap-4">
                <span>
                  実行時刻:{" "}
                  <time dateTime={result.generatedAt}>
                    {new Date(result.generatedAt).toLocaleString()}
                  </time>
                </span>
                <span>処理時間: {result.elapsedMs}ms</span>
                <span>フィード数: {result.feedsProcessed}</span>
              </div>
            </div>

            {reportList.length > 0 ? (
              <div className="rounded-lg border border-border/60 bg-background p-4">
                <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                  処理対象フィード
                </h3>
                <ul className="grid gap-2 text-sm">
                  {reportList.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between rounded-md border border-border/60 bg-card/80 px-3 py-2"
                    >
                      <span className="font-medium">{entry.title}</span>
                      <span className="text-muted-foreground">
                        {entry.count}件
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="rounded-md border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
                最新24時間以内の記事は見つかりませんでした。
              </p>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  生データ
                </h3>
                <span className="text-xs text-muted-foreground">
                  表示専用です
                </span>
              </div>
              <Textarea
                value={JSON.stringify(result, null, 2)}
                readOnly
                className="font-mono text-xs leading-5"
                rows={hasReports ? 16 : 10}
              />
            </div>
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
            ボタンを押してレポート生成を実行すると、ここに結果が表示されます。
          </p>
        )}
      </CardContent>
    </Card>
  );
}
