# Finance App

Net worth tracking, FIRE planning, shared household access, and an investment planner built with React, TypeScript, Vite, Supabase, and Tailwind CSS.

## Local Setup

1. Install dependencies.
2. Copy `.env.example` to `.env.local`.
3. Fill in your Supabase and Finnhub values.
4. Run `npm run dev`.

Environment variables:

```bash
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_FINNHUB_API_KEY=your-finnhub-api-key
VITE_MAGIC_LINK_REDIRECT_URL=http://localhost:5173/
```

The investment planner fetches live quotes from Finnhub in the browser.

## Supabase Setup

Run the schema in [supabase/schema.sql](supabase/schema.sql) inside the Supabase SQL editor.

This creates the tables and row-level security policies for:

- Net worth categories and monthly values
- FIRE settings and retirement system config
- Investment planner assets
- Shared household accounts, collaborators, and invitations

Shared household flow:

1. The owner signs in and opens `Sharing`.
2. The owner invites a collaborator by email.
3. The collaborator signs in with that same email.
4. The app auto-claims the invitation and exposes the shared account in the account switcher.

## Deployment Checklist

1. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_FINNHUB_API_KEY` in your hosting provider.
2. Run `npm run build` and make sure `dist/` is generated cleanly.
3. Deploy the built Vite app as a static site.
4. In Supabase Auth, add both your local URL and deployed URL to the redirect allow list.
5. In Supabase Auth, make the site URL match your production domain.

If the app starts without the required env vars, it now renders a setup screen instead of crashing during startup.

## Hosting Notes

- This is a client-side Vite app, so your host should serve `index.html` for app routes.
- The production build output directory is `dist`.
- Magic-link auth redirects back to the current origin and pathname, so the deployed URL must be present in Supabase redirect settings.
- If you want local development to always force localhost as the magic-link return target, set `VITE_MAGIC_LINK_REDIRECT_URL=http://localhost:5173/` in `.env.local`.
- In Supabase Auth -> URL Configuration, add `http://localhost:5173/**` to Redirect URLs.
- If you customized the Supabase email template, make sure it uses `{{ .RedirectTo }}` instead of `{{ .SiteURL }}` or Supabase will keep sending users to the production site URL.
- iPhone home-screen installs run in a separate browser context from Safari. If Mail opens the magic link in Safari, copy the full sign-in link from the email and paste it into the app's sign-in screen to complete auth in the installed app.

## GitHub Pages

This repo now includes a GitHub Pages workflow at `.github/workflows/deploy.yml`.

Steps to finish deployment:

1. Push this repo to GitHub on the `main` branch.
2. In GitHub, open `Settings` -> `Pages` and set the source to `GitHub Actions`.
3. In GitHub, open `Settings` -> `Secrets and variables` -> `Actions` and add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_FINNHUB_API_KEY`
4. Push to `main` or manually run the `Deploy to GitHub Pages` workflow.
5. Open the deployed site at `https://<your-github-username>.github.io/<your-repo-name>/`.

Important notes:

- The Vite base path is set automatically during GitHub Actions builds using the repository name, so local development still runs at `/`.
- In Supabase Auth, add your production Pages URL to the redirect allow list and set the site URL to that same deployed URL.
- `VITE_FINNHUB_API_KEY` is a client-side key. On GitHub Pages it will be embedded in the built app and can be viewed by users. If that is not acceptable, move quote fetching behind a server-side proxy or function.

## Commands

```bash
npm run dev
npm run build
npm run preview
```
