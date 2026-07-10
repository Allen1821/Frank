# GitHub review pipeline

This repo has a GitHub Actions workflow at `.github/workflows/review-gate.yml`.

It runs whenever a pull request targets `main`.

## What the pipeline does

1. Installs Node dependencies with `npm ci`.
2. Runs `npm run check`.
3. Validates JavaScript syntax.
4. Validates `content/site-content.json`, including editable class and recertification dates.
5. Confirms the class pages still have the expected dynamic date hooks.
6. Sends a review email through Resend when notification secrets are configured.

## GitHub secrets for email notifications

Add these in GitHub:

`Settings` → `Secrets and variables` → `Actions` → `New repository secret`

Required for email:

- `RESEND_API_KEY`
- `PIPELINE_NOTIFY_EMAIL`

Optional:

- `PIPELINE_FROM_EMAIL`

Recommended values:

- `PIPELINE_NOTIFY_EMAIL`: the email address that should receive review notices.
- `PIPELINE_FROM_EMAIL`: `DARPA SOLUTIONS LLC <contact@darpasolutionsllc.net>`

If the email secrets are missing, the validation job still runs. The email job will simply skip notification.

## Protect `main`

To make sure you review changes before they merge:

1. Open the GitHub repo.
2. Go to `Settings` → `Branches`.
3. Add a branch protection rule for `main`.
4. Enable `Require a pull request before merging`.
5. Enable `Require status checks to pass before merging`.
6. Select the required check named `Validate site`.
7. Save the rule.

After this, changes should go to a branch first, then a pull request into `main`.

## Admin content workflow

For the admin page, keep `GITHUB_BRANCH` pointed at your working branch, such as `Demo`, not `main`.

That means:

1. Admin saves update the working branch.
2. You open a pull request from the working branch into `main`.
3. GitHub runs the review gate.
4. You get the email.
5. You review and merge to `main`.
