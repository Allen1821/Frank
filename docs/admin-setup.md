# Admin Setup

Student roster setup is documented separately in student-portal-setup.md.

The admin page is at `/admin/`. It edits `content/site-content.json`, then commits that file to GitHub through the server-side `/api/admin-content` route.

After login, **Edit Website** contains the editable page and date controls. **Students** contains pending account requests, distinct student counts by class session, renewal and expiration editing, reversible portal deactivation, and the private Google Drive folder connection workflow.

## Required Services

Use Supabase Auth for login and GitHub for content commits.

1. Create a Supabase project.
2. Enable email/password authentication.
3. Create the admin user in Supabase Auth.
4. Add the admin user's email to `ADMIN_EMAILS`.
5. Create a GitHub fine-grained token for `Allen1821/Frank` with repository Contents read/write permission.
6. Add the environment variables below in Vercel.

## Vercel Environment Variables

```text
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
ADMIN_EMAILS=admin@example.com
GITHUB_REPO=Allen1821/Frank
GITHUB_BRANCH=Demo
GITHUB_TOKEN=your-github-token
ADMIN_COOKIE_SECURE=true
```

Optional:

```text
VERCEL_DEPLOY_HOOK_URL=your-vercel-deploy-hook-url
```

If the Vercel project is already connected to GitHub and deploys the `Demo` branch, the GitHub commit should trigger a deployment. Add `VERCEL_DEPLOY_HOOK_URL` if you want the admin save endpoint to explicitly trigger a deploy hook too.

## Security Notes

- Do not expose `GITHUB_TOKEN` in browser code.
- Do not use the Supabase service role key in browser code.
- Admin writes are restricted to `content/site-content.json`.
- Saved content is plain text only and is rendered with `textContent`, not `innerHTML`.
- Admin state-changing requests require same-origin requests and a CSRF token.
