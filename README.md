# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.
You can also try [the experimental native React Compiler support in plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md#rust-react-compiler) by using `compiler: true` in the plugin options instead of using the Babel plugin.

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Admin account creation

The User Management page can create staff, manager, and admin accounts with an administrator-supplied temporary password. Account creation runs in the Supabase Edge Function at `supabase/functions/create-account/index.ts`; do not move the service-role key into the Vite app or any `VITE_*` variable. The function confirms the email address when creating an account; administrators must verify addresses before creating privileged accounts.

Deploy the function to the Supabase project used by this portal:

```sh
supabase functions deploy create-account --project-ref YOUR_PROJECT_REF
```

The hosted function needs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in its server-side environment. Supabase supplies the project URL and anon key to hosted functions; if the service-role key is not already available, set it only as a server-side function secret:

```sh
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY --project-ref YOUR_PROJECT_REF
```

Never put that key in frontend code, `.env` variables prefixed with `VITE_`, or browser storage. Share the temporary password with the user over a secure channel and ask them to change it after signing in. The portal does not send or display the password after account creation.

The existing profile role constraint has `staff`, `moderator`, and `admin`, but no `manager`. The UI maps Manager to `moderator`; no schema change is needed for that option. The function verifies the caller is an admin before using the service-role API to create the new auth user and matching `profiles` row.

## Manager and staff profiles

Admins can set full name, phone, office/service area, about text, and an optional JPEG, PNG, or WebP profile picture (up to 3 MB) when creating staff and manager accounts. Existing staff and manager profiles can be edited from User Management. Profile pictures are saved in the existing public `Profile` Storage bucket under the account's ID.

Deploy both account functions after changing them:

```sh
supabase functions deploy create-account --project-ref YOUR_PROJECT_REF
supabase functions deploy update-account-profile --project-ref YOUR_PROJECT_REF
```

`update-account-profile` independently verifies the signed-in user's `admin` role before updating a manager or staff profile. Both functions require the `SUPABASE_SERVICE_ROLE_KEY` secret to remain configured server-side.

## Admin analysis

The Admin Portal's Analysis page summarizes service reports, account roles, active team workload, and community posts and engagement. Average resolution time, advertising, and local-service listings, reviews, and payments are intentionally excluded. Apply `supabase/admin_portal_security_settings.sql` in the Supabase SQL Editor to add the admin-only read policies required for these database-backed analytics.

## Admin operations pages

The portal also includes Community Moderation, Service Issue Oversight, and Audit Log pages. Moderation can mark a flagged post as removed, dismiss a report, or move it into review. Each decision applies to all open reports for that post and writes feedback to each distinct reporter's profile activity timeline. Service Issue Oversight shows four unresolved issues per page and supports raising a report's severity to High or de-escalating it to Low; these are valid `reports.severity` values. Routine assignments and status workflows remain in the Manager Portal.

The Admin Security Settings panel configures automatic sign-out after 5, 10, 15, or 30 minutes of inactivity. The setting is saved in `admin_security_settings` and applied by the portal's session timer; automatic sign-out affects only the current browser session. Apply `supabase/admin_security_session_timeout.sql` in the Supabase SQL Editor to add the setting column. Until the SQL is applied, the portal retains its secure 5-minute default.

Reapply `supabase/admin_portal_security_settings.sql` in the Supabase SQL Editor to enable the required admin-only report/post update policies and audit log. The migration also allows `post_removed` as a community moderation action while preserving the other action values currently accepted by `user_reports_action_check`. Database triggers record account, service-report, community-post, and moderation-report changes, including changed operational fields without storing profile contact details, post/report text, or record IDs. Reapplying this migration drops the existing `audit_logs.record_id` column and its values. Audit history begins when the migration is applied; it does not backfill older changes. Authenticated actors are recorded when available, otherwise the event is attributed to the system.

Apply `../../Users/TrackServ/supabase/profile_activity_and_moderation.sql` to the same Supabase project after the Admin Portal security SQL and the community post-reporting SQL. It creates the profile activity feed and the admin-only moderation/report-count RPCs. Deploy the account moderation function after applying the SQL:

```sh
supabase functions deploy moderate-account --project-ref YOUR_PROJECT_REF
```

The function verifies the administrator and rechecks reporter counts on the server. Warnings require reports from at least four distinct people; permanent account deletion is available only after reports from at least five distinct people and a separate confirmation. Administrator accounts cannot be warned or deleted using this action. The existing server-side `SUPABASE_SERVICE_ROLE_KEY` secret is required.

## GitHub Pages

The Admin Portal is configured for the `TrackServ-Admin-Portal` project site. The GitHub Actions workflow builds and deploys `dist` on pushes to `main`. After creating the public repository, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. The first successful workflow run publishes the site at `https://WANGAMALINDA.github.io/TrackServ-Admin-Portal/`.

Add that base URL to the Supabase Auth URL configuration's allowed redirect URLs so password recovery returns to the hosted portal.
