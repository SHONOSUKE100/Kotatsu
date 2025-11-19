import { LatestReportRuns } from "@/components/latest-report-runs";
import { RunReportPanel } from "@/components/run-report-panel";
import { fetchLatestReportRuns } from "@/lib/reports";

export default async function Home() {
  const { data: latestRuns, error: latestRunsError } = await fetchLatestReportRuns(5);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
        <section className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            Journalist Agent Dashboard
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            shadcn/ui を使ったシンプルなモニター画面です。バックエンドのコマンドを即時実行して、
            RSS から生成された記事サマリーを確認できます。
          </p>
        </section>
        <RunReportPanel />
        <LatestReportRuns reports={latestRuns} error={latestRunsError} />
      </main>
    </div>
  );
}
