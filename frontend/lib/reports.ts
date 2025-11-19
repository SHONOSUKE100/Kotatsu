import "server-only";

import { createClient } from "@supabase/supabase-js";

import type {
  DailyReportItem,
  DailyReportRun,
  ReportRunWithItems,
} from "@/lib/report-types";

type LatestReportsResult<TData> = {
  data: TData;
  error?: string;
};

const getSupabaseConfig = () => {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    "";
  return { url, anonKey };
};

const createSupabaseClientSafe = () => {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    const errorMessage = "Supabase の接続情報が設定されていません。";
    console.warn("[SupabaseClient] " + errorMessage);
    return {
      client: null,
      error: errorMessage,
    };
  }
  const client = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  return { client };
};

export async function fetchLatestReportRuns(
  limit = 5,
): Promise<LatestReportsResult<DailyReportRun[]>> {
  const { client, error } = createSupabaseClientSafe();
  if (!client || error) {
    return { data: [], error };
  }

  try {
    const { data, error: queryError } = await client
      .from("daily_report_runs")
      .select(
        "id, feed_title, composed_title, composed_body, generated_at, item_count",
      )
      .order("generated_at", { ascending: false })
      .limit(limit);

    if (queryError) {
      console.error("[fetchLatestReportRuns] Supabase query failed:", queryError);
      return { data: [], error: queryError.message };
    }

    return { data: data ?? [] };
  } catch (err) {
    console.error("[fetchLatestReportRuns] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return { data: [], error: message };
  }
}

const normalizeKeyPoints = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry ?? "").trim())
      .filter((entry) => entry.length > 0);
  }
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed)
      ? parsed
          .map((entry) => String(entry ?? "").trim())
          .filter((entry) => entry.length > 0)
      : [];
  } catch {
    return [String(value)];
  }
};

export async function fetchRecentReportItems(
  limit = 6,
): Promise<LatestReportsResult<DailyReportItem[]>> {
  const { client, error } = createSupabaseClientSafe();
  if (!client || error) {
    return { data: [], error };
  }

  try {
    const { data, error: queryError } = await client
      .from("daily_report_items")
      .select(
        `
        id,
        run_id,
        source_url,
        source_headline,
        source_published,
        summary_headline,
        summary_body,
        key_points,
        positive_view,
        critical_view,
        synthesized_view,
        created_at,
        daily_report_runs!inner (
          feed_title,
          generated_at
        )
      `,
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (queryError) {
      console.error("[fetchRecentReportItems] Supabase query failed:", queryError);
      return { data: [], error: queryError.message };
    }

    const items =
      data?.map((item) => ({
        id: item.id,
        run_id: item.run_id,
        feed_title: item.daily_report_runs?.feed_title ?? "不明なフィード",
        generated_at:
          item.daily_report_runs?.generated_at ?? item.created_at ?? "",
        created_at: item.created_at,
        source_url: item.source_url,
        source_headline: item.source_headline,
        source_published: item.source_published,
        summary_headline: item.summary_headline,
        summary_body: item.summary_body,
        key_points: normalizeKeyPoints(item.key_points),
        positive_view: item.positive_view,
        critical_view: item.critical_view,
        synthesized_view: item.synthesized_view,
      })) ?? [];

      return { data: items };
    } catch (err) {
      console.error("[fetchRecentReportItems] Unexpected error:", err);
      const message = err instanceof Error ? err.message : "Unknown error";
      return { data: [], error: message };
    }
  }

export async function fetchReportRunWithItems(
  runId: string,
): Promise<LatestReportsResult<ReportRunWithItems | null>> {
  const { client, error } = createSupabaseClientSafe();
  if (!client || error) {
    return { data: null, error };
  }

  try {
    const { data, error: queryError } = await client
      .from("daily_report_runs")
      .select(
        `
        id,
        feed_title,
        composed_title,
        composed_body,
        generated_at,
        item_count,
        daily_report_items (
          id,
          run_id,
          source_url,
          source_headline,
          source_published,
          summary_headline,
          summary_body,
          key_points,
          positive_view,
          critical_view,
          synthesized_view,
          created_at
        )
      `,
      )
      .eq("id", runId)
      .maybeSingle();

    if (queryError) {
      console.error("[fetchReportRunWithItems] Supabase query failed:", queryError);
      const message =
        queryError.message ||
        queryError.details ||
        "エントリの取得中に問題が発生しました。";
      return { data: null, error: message };
    }

    if (!data) {
      return { data: null, error: "指定したレポートが見つかりませんでした。" };
    }

    const run: DailyReportRun = {
      id: data.id,
      feed_title: data.feed_title,
      composed_title: data.composed_title,
      composed_body: data.composed_body,
      generated_at: data.generated_at,
      item_count: data.item_count,
    };

    const items =
      data.daily_report_items?.map((item: Record<string, unknown>) => ({
        id: String(item.id),
        run_id: String(item.run_id),
        feed_title: run.feed_title,
        generated_at: run.generated_at,
        created_at: String(item.created_at ?? ""),
        source_url: String(item.source_url ?? ""),
        source_headline: String(item.source_headline ?? ""),
        source_published: item.source_published
          ? String(item.source_published)
          : null,
        summary_headline: String(item.summary_headline ?? ""),
        summary_body: String(item.summary_body ?? ""),
        key_points: normalizeKeyPoints(item.key_points),
        positive_view: item.positive_view ? String(item.positive_view) : null,
        critical_view: item.critical_view ? String(item.critical_view) : null,
        synthesized_view: item.synthesized_view
          ? String(item.synthesized_view)
          : null,
      })) ?? [];

    return { data: { run, items } };
  } catch (err) {
    console.error("[fetchReportRunWithItems] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return { data: null, error: message };
  }
}
