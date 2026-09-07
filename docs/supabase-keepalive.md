# Supabase keepalive

The `Supabase Keepalive` GitHub Actions workflow generates regular user database
activity for the Frank project. It runs daily at 12:17 UTC and makes three
read-only requests to a single non-sensitive row through the Supabase Data API.

The workflow uses these GitHub Actions repository secrets:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

It intentionally uses a publishable key, never a secret or service-role key.
The `public.keepalive` table grants only `SELECT` to `anon` and `authenticated`,
has RLS enabled, and cannot contain an id other than `1`.

## Verification

Open **GitHub → Actions → Supabase Keepalive**. A successful run ends with:

```text
Supabase keepalive completed successfully.
```

GitHub can disable scheduled workflows in a public repository after 60 days
without repository activity. GitHub normally sends a notification when it does.
Supabase also describes activity as a heuristic rather than a guarantee; a paid
Supabase plan is the documented way to guarantee that a project is not paused.
