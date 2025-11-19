## Journalist Frontend

This UI provides a shadcn/ui based dashboard to trigger the Deno backend and inspect the generated RSS summaries.

### Development

```bash
npm install
NEXT_PUBLIC_BACKEND_URL="http://localhost:8000" npm run dev
# Supabase（ローカル CLI を使う場合の例）
# NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
# NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-or-service-key"
```

Open [http://localhost:3000](http://localhost:3000) to access the dashboard.

### Pages

- `/`: Dashboard with run trigger + latest runs list
- `/runs/[id]`: Detailed view for a specific auto-generated report (open by clicking a run card)

### Environment Variables

- `NEXT_PUBLIC_BACKEND_URL` (optional): Backend endpoint root. Defaults to `http://localhost:8000` for local development. When running under Docker Compose it is automatically set to `http://backend:8000`.
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Used to fetch the latest entries from
  `daily_report_runs` と `daily_report_items`。These can point to a local Supabase CLI instance or a hosted project. If not set, the dashboard simply hides the DB-backed sections.
