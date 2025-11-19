export type DailyReportRun = {
  id: string;
  feed_title: string;
  composed_title: string;
  composed_body: string;
  generated_at: string;
  item_count: number;
};

export type DailyReportItem = {
  id: string;
  run_id: string;
  feed_title: string;
  generated_at: string;
  created_at: string;
  source_url: string;
  source_headline: string;
  source_published: string | null;
  summary_headline: string;
  summary_body: string;
  key_points: string[];
  positive_view: string | null;
  critical_view: string | null;
  synthesized_view: string | null;
};

export type ReportRunWithItems = {
  run: DailyReportRun;
  items: DailyReportItem[];
};
