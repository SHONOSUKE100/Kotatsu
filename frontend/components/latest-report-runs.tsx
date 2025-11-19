import Link from "next/link";
import { ArrowRight, CalendarDays, FileText } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { DailyReportRun } from "@/lib/report-types";

type LatestReportRunsProps = {
  reports: DailyReportRun[];
  error?: string;
};

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

const formatGeneratedAt = (input: string) => {
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? input : dateFormatter.format(date);
};

export function LatestReportRuns({ reports, error }: LatestReportRunsProps) {
  const hasReports = reports.length > 0;

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold">
          最新の自動生成レポート
        </CardTitle>
        <CardDescription>
          Supabase の
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
            daily_report_runs
          </code>
          テーブルから直近の出力を表示します。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            DB の読み込みに失敗しました: {error}
          </p>
        ) : null}

        {hasReports ? (
          <ul className="space-y-3">
            {reports.map((run) => (
              <li key={run.id}>
                <Link
                  href={`/runs/${run.id}`}
                  className="group block rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm transition hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                        {run.feed_title}
                      </p>
                      <p className="text-xl font-semibold leading-tight text-foreground sm:text-2xl">
                        {run.composed_title}
                      </p>
                    </div>
                    <div className="text-right text-base text-muted-foreground">
                      <p className="font-semibold text-foreground">
                        {formatGeneratedAt(run.generated_at)}
                      </p>
                      <p>
                        記事数:{" "}
                        <span className="font-semibold text-foreground">
                          {run.item_count}
                        </span>
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 line-clamp-3 text-base leading-relaxed text-muted-foreground">
                    {run.composed_body}
                  </p>

                  <div className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" aria-hidden />
                      {formatGeneratedAt(run.generated_at)}
                    </span>
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4" aria-hidden />
                      {run.item_count} 件の記事
                    </span>
                    <span className="flex items-center gap-2 font-semibold text-primary">
                      詳細を開く
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
            まだ DB に保存されたレポートがありません。Python エージェントやバックエンドを実行して
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
              daily_report_runs
            </code>
            を埋めてください。
          </p>
        )}
      </CardContent>
    </Card>
  );
}
