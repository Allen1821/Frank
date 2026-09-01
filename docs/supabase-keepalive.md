# Supabase keepalive

Supabase pauses free plan projects after about seven days without activity, which
is why the project has to be woken up by hand every week. The `Supabase Keepalive`
workflow does that instead: twice a week it reads a single row from the database
through the REST API, which counts as activity and resets the inactivity clock.

## What was added

| File | Purpose |
| --- | --- |
| `supabase/migrations/20260901133858_keepalive_ping.sql` | Creates `public.keepalive`, a one row table that the ping reads. |
| `scripts/supabase-keepalive.js` | Sends the request and retries transient network failures. |
| `.github/workflows/supabase-keepalive.yml` | Runs the script every Monday and Thursday at 12:00 UTC. |

The `keepalive` table holds one row with an id and a creation timestamp, so the
public read policy on it exposes nothing about students or staff. No other table
is touched, and the ping only reads, never writes.

## Setup

1. **Run the migration** against the project, the same way the other migrations in
   `supabase/migrations/` were applied. Alternatively, paste the file contents into
   the SQL editor in the Supabase dashboard and run it once.
2. **Add two repository secrets** under Settings, Secrets and variables, Actions,
   New repository secret:
   - `SUPABASE_URL` — for example `https://your-project-ref.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY` — the publishable (anon) key from Project Settings,
     API keys. This is the same key the browser already uses, not the service role key.
3. **Run it once by hand** from the Actions tab: open `Supabase Keepalive`, choose
   `Run workflow`, and confirm the run finishes green. The log ends with
   `Supabase keepalive succeeded`.

To test from a terminal instead, set the same two variables and run `npm run keepalive`.

## Things worth knowing

- **GitHub disables scheduled workflows after 60 days of no repository activity.**
  GitHub emails a warning first, and the workflow can be re-enabled with one click
  from the Actions tab. Normal commits to the repository reset that 60 day counter.
- **Scheduled runs can be delayed** when GitHub is busy, and are occasionally
  dropped altogether. Two runs a week leaves three to four days of margin against
  the seven day pause, so one missed run is harmless.
- **A failed run sends an email** to the repository owner by default, so a broken
  key or a paused project does not go unnoticed.
- The table name can be changed with a `SUPABASE_KEEPALIVE_TABLE` repository
  variable if `keepalive` is ever renamed.

## If a run fails

| Log message | Cause |
| --- | --- |
| `Missing required environment variables` | The repository secrets are not set, or are set on the wrong repository. |
| `404` | The migration has not been run yet, so `public.keepalive` does not exist. |
| `401` or `403` | The publishable key does not match the project, or the grant and policy in the migration are missing. |
| Repeated timeouts | The project is already paused. Resume it from the Supabase dashboard, then re-run the workflow. |
