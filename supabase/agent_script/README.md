# Agent Script

Python 版の記事生成フロー。Supabase Edge Function（Deno）で実装していたロジックをローカルスクリプトとして実行し、結果を PostgreSQL（Supabase ローカルDB）に保存します。

## セットアップ

```bash
cd supabase/agent_script
uv sync  # もしくは uv pip install -r pyproject.toml
```

必要 env:

- `GOOGLE_API_KEY` …… Gemini 用
- `DATABASE_URL` …… Postgres 接続文字列（未設定時は `postgresql://postgres:postgres@127.0.0.1:54322/postgres` を使用）

任意 env:

- `LANGSMITH_API_KEY` …… LangSmith の API キー。設定すると自動で実行ログを送信
- `LANGSMITH_PROJECT` …… ログを紐付ける LangSmith プロジェクト名（未指定時は `agent-script`）
- `LANGSMITH_TRACING` …… `false`/`0` で強制オフ。未設定 or `true` で有効
- `LANGSMITH_ENDPOINT` …… Self-host している場合のエンドポイント URL

`.env` ファイル（Supabase Edge Function 用）をそのまま使う場合は `--env-file` オプションで指定できます。

## 実行例

```bash
uv run python -m agent_script.main \
  --env-file ../functions/create-article/.env \
  --database-url postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  --log-level INFO
```

### 主なオプション

| オプション | 説明 |
| --- | --- |
| `--feeds kantei ...` | 処理対象フィードを限定するときに指定 |
| `--output report.json` | 生成結果を JSON ファイルとして保存 |
| `--skip-db` | DB への INSERT をスキップ |
| `--rpm-limit 15` | Gemini API への 1 分あたりのリクエスト上限。超過しそうな場合は待機して調整 |

実行後、`daily_report_runs` / `daily_report_items` テーブルに保存されます。JSON 形式のレポートは標準出力、または `--output` で指定したファイルに出力されます。

```mermaid
---
config:
      theme: redux
---
flowchart TD
    Start["AI Agent"]
    GetRSS["RSS取得"]
    RSSList{{"RSSリスト"}}
    DataStruct["タイトル<br>日時<br>リンク<br>説明"]
    Filter{"日時が<br>24時間以内？"}
    RecentList["24時間以内リスト"]

    %% 深さ1処理
    FetchLink1["リンク先情報取得(深さ1)"]
    HasMoreLinks1{"さらにリンクあり？(深さ1)"}
    FetchLink2a["リンク先情報取得(深さ2)"]
    HasMoreLinks2a{"さらにリンクあり？(深さ2)"}
    FetchLink3a["リンク先情報取得(深さ3)"]
    CollectSubLinks1["深さ1ごとに<br>深さ2,3以降を集約"]

    %% 深さ2/3 他分岐(表現上1つで省略)
    HasMoreLinks2a -- Yes --> FetchLink3a
    HasMoreLinks2a -- No --> CollectSubLinks1
    FetchLink3a --> CollectSubLinks1
    HasMoreLinks1 -- No --> CollectSubLinks1

    HasOtherLists{さらに他の記事リストあり？}
    HasMoreLinks1 -- No --> HasOtherLists
    HasOtherLists -- Yes --> RecentList
    HasMoreLinks2a -- No --> HasOtherLists
    HasMoreLinks2a -- Yes --> RecentList
    FetchLink3a -- No --> HasOtherLists
    FetchLink3a -- Yes --> RecentList
    
    %% 残りフロー
    ParseArticle["記事解析"]
    End(["完了"])

    Start --> GetRSS --> RSSList
    RSSList --> DataStruct
    DataStruct --> Filter
    Filter -- Yes --> RecentList --> FetchLink1
    Filter -- No --> End

    FetchLink1 --> HasMoreLinks1
    HasMoreLinks1 -- Yes --> FetchLink2a
    FetchLink2a --> HasMoreLinks2a

    CollectSubLinks1 --> ParseArticle
```

## 更新後

```mermaid
---
config:
      theme: redux
---
flowchart TD

    Start[Start] --> LoadRSSConfig[RSSフィード一覧のロード]

    LoadRSSConfig --> FetchRSSAll[RSSを全て取得]
    FetchRSSAll --> FilterByDate[直近1日のアイテムに絞る]
    
    FilterByDate --> ExtractRSSItem[RSSアイテムの抽出]

    ExtractRSSItem --> CheckMainLink{メインリンクあり？}
    CheckMainLink -->|No| SummarizeRSSOnly[RSS本文のみで要約]
    CheckMainLink -->|Yes| IdentifyType[リンク先タイプ判定「HTML/PDF/動画/画像/API」]

    IdentifyType -->|HTML| FetchHTML[HTML本文の取得]
    IdentifyType -->|PDF| FetchPDF[PDFのテキスト抽出またはOCR]
    IdentifyType -->|動画| FetchVideoMeta[動画字幕や説明の抽出]
    IdentifyType -->|画像| FetchImageOCR[画像OCR]
    IdentifyType -->|その他| FetchOther[その他のデータ取得]

    FetchHTML --> NormalizeContent
    FetchPDF --> NormalizeContent
    FetchVideoMeta --> NormalizeContent
    FetchImageOCR --> NormalizeContent
    FetchOther --> NormalizeContent
    SummarizeRSSOnly --> NormalizeContent

    NormalizeContent[抽出結果の構造化] --> AnalyzeContent[重要論点の抽出と分析]

    AnalyzeContent --> GeneratePartialArticle[部分記事の生成]

    GeneratePartialArticle --> CheckAdditionalLinks{関連リンクあり？}
    CheckAdditionalLinks -->|Yes| LoopLinks[関連リンクを処理] --> NormalizeContent
    CheckAdditionalLinks -->|No| AppendToFeedSummary[フィードごとのまとめに追加]

    AppendToFeedSummary --> CheckNextItem{次のRSSアイテム？}
    CheckNextItem -->|Yes| ExtractRSSItem
    CheckNextItem -->|No| GenerateGlobalArticle[全体記事の生成]

    GenerateGlobalArticle --> End[End]

```

### リンク追跡による追加分析

- 記事本文から抽出したリンクを深さ3まで辿り、PDF/HTML/API/画像/動画などリソース種別を判別。
- 取得したサブリンクの本文を要約し、メイン記事の末尾へ `[関連リンク分析]` セクションとして追記。
- RSS にリンクが無い場合は取得済みの RSS 本文のみで要約処理を継続。
- PDF など構造化されていないデータも `pdfminer` によりテキスト抽出し、要約に活用できるようにしました。

### LangSmith でのオブザーバビリティ

- `LANGSMITH_API_KEY` を設定すると、CLI 実行ごとに LangSmith RunTree として入力／出力が記録されます。
- 追跡対象には処理対象フィード、モデル名、RPM 設定、生成された日次レポート JSON が含まれます。
- `LANGSMITH_PROJECT` を指定すると LangSmith 側のプロジェクトを切り替え可能です。
- トレースを一時的に停止したい場合は `LANGSMITH_TRACING=false` を環境変数にセットしてください。
