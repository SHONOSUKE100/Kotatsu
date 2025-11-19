import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, FileText } from "lucide-react";

import { ArticleDetailsList } from "@/components/article-details-list";
import { fetchReportRunWithItems } from "@/lib/reports";

type RunDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function RunDetailPage({ params }: RunDetailPageProps) {
  const { id } = await params;
  const { data, error } = await fetchReportRunWithItems(id);

  if (error && !data) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            ダッシュボードに戻る
          </Link>
          <section className="space-y-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-center text-destructive shadow">
            <h1 className="text-2xl font-semibold">レポートを読み込めませんでした</h1>
            <p className="text-sm">{error}</p>
          </section>
        </main>
      </div>
    );
  }

  if (!data) {
    notFound();
  }

  const { run, items } = data;
  const runGeneratedAt = new Date(run.generated_at).toLocaleString("ja-JP");

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          ダッシュボードに戻る
        </Link>

        <section className="space-y-3 rounded-2xl border border-border/70 bg-card p-6 shadow">
          <p className="text-sm uppercase tracking-wide text-muted-foreground">
            {run.feed_title}
          </p>
          <h1 className="text-3xl font-semibold leading-tight text-foreground">
            {run.composed_title}
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            {run.composed_body}
          </p>
          <div className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 p-3">
              <CalendarDays className="h-4 w-4" aria-hidden />
              <span>生成時刻: {runGeneratedAt}</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 p-3">
              <FileText className="h-4 w-4" aria-hidden />
              <span>記事件数: {run.item_count} 件</span>
            </div>
          </div>
        </section>

        <ArticleDetailsList
          articles={items}
          header={{
            title: "記事ごとの詳細",
            description: `${run.feed_title} の RSS から生成された記事サマリーと AI 評価です。`,
          }}
        />
      </main>
    </div>
  );
}
