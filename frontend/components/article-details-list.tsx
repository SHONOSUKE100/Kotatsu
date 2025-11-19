import {
  AlertTriangle,
  ArrowUpRight,
  ExternalLink,
  Sparkles,
  ThumbsUp,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { DailyReportItem } from "@/lib/report-types";

type ArticleDetailsHeader = {
  title: string;
  description?: string;
};

type ArticleDetailsListProps = {
  articles: DailyReportItem[];
  error?: string;
  header?: ArticleDetailsHeader;
};

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

const formatDate = (value: string) => {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return value;
  return dateFormatter.format(timestamp);
};

type OpinionBlockProps = {
  title: string;
  body?: string | null;
  icon: React.ReactNode;
};

const OpinionBlock = ({ title, body, icon }: OpinionBlockProps) => (
  <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm">
    <div className="mb-2 flex items-center gap-2 font-medium text-muted-foreground">
      {icon}
      <span>{title}</span>
    </div>
    <p className="text-muted-foreground">{body || "まだコメントがありません。"} </p>
  </div>
);

const DEFAULT_HEADER: ArticleDetailsHeader = {
  title: "記事ごとの詳細",
  description:
    "AI が生成した要約と論評を含む最新の記事ブロックです。参照元リンクや肯定・批判視点を合わせて確認できます。",
};

export function ArticleDetailsList({
  articles,
  error,
  header = DEFAULT_HEADER,
}: ArticleDetailsListProps) {
  const hasArticles = articles.length > 0;

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold">{header.title}</CardTitle>
        {header.description ? (
          <CardDescription>{header.description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            記事データの取得に失敗: {error}
          </p>
        ) : null}

        {hasArticles ? (
          <ul className="space-y-4">
            {articles.map((article) => (
              <li
                key={article.id}
                className="rounded-xl border border-border/60 bg-card/80 p-4 shadow-sm"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {article.feed_title}
                    </p>
                    <h3 className="text-lg font-semibold text-foreground">
                      {article.summary_headline}
                    </h3>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <time dateTime={article.generated_at}>
                      {formatDate(article.generated_at)}
                    </time>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  <a
                    href={article.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {article.source_headline || article.source_url}
                  </a>
                  {article.source_published ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs uppercase tracking-wide text-muted-foreground">
                      <ArrowUpRight className="h-3 w-3" aria-hidden />
                      {article.source_published}
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {article.summary_body}
                </p>

                {article.key_points.length > 0 ? (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Key Points
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                      {article.key_points.map((point) => (
                        <li
                          key={point}
                          className="rounded-full bg-muted px-3 py-1 text-muted-foreground"
                        >
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <OpinionBlock
                    title="肯定的視点"
                    body={article.positive_view}
                    icon={<ThumbsUp className="h-4 w-4 text-emerald-500" aria-hidden />}
                  />
                  <OpinionBlock
                    title="批判的視点"
                    body={article.critical_view}
                    icon={
                      <AlertTriangle className="h-4 w-4 text-rose-500" aria-hidden />
                    }
                  />
                  <OpinionBlock
                    title="統合コメント"
                    body={article.synthesized_view}
                    icon={<Sparkles className="h-4 w-4 text-indigo-500" aria-hidden />}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
            詳細を表示できる記事サマリーがまだありません。エージェントを実行して
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
              daily_report_items
            </code>
            を最新化してください。
          </p>
        )}
      </CardContent>
    </Card>
  );
}
