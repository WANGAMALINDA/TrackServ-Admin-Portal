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

## GitHub Pages

The Admin Portal is configured for the `TrackServ-Admin-Portal` project site. The GitHub Actions workflow builds and deploys `dist` on pushes to `main`. After creating the public repository, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. The first successful workflow run publishes the site at `https://WANGAMALINDA.github.io/TrackServ-Admin-Portal/`.

Add that base URL to the Supabase Auth URL configuration's allowed redirect URLs so password recovery returns to the hosted portal.
