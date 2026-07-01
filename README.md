# Streaks

A small personal habit tracker built as a static Today-only web app.

## Run locally

Open `index.html` directly in a browser, or serve the folder with any static file server.

## Storage

The app stores habits and completion records in Supabase when `config.js` is
configured. Until then, it falls back to `localStorage` in the current browser.
Dates are stored as `YYYY-MM-DD` calendar strings, and the app calculates Today
in the `Europe/Oslo` timezone.

Each habit day is stored in `data.habitDays` with a `status` of either `done`
or `not_done`. The app creates `not_done` records by default, including skipped
days since a habit was created, so future history views can render from explicit
database data instead of guessing from missing records.

## Supabase setup

1. Create a free Supabase project.
2. Open the SQL editor and run `supabase.sql`.
3. Open `config.js`.
4. Paste your project URL into `supabaseUrl`.
5. Paste your public anon key into `supabaseAnonKey`.
6. Optionally change `stateId` to any private-ish string.

This setup is intentionally simple. The public app can read and write the
single state document if someone inspects the published source.

## Deploy

This project has no build step. Deploy the folder to GitHub Pages or any other
static host.

For GitHub Pages, publish these files from the repository root:

- `index.html`
- `styles.css`
- `app.js`
- `config.js`
- `supabase.sql` can stay in the repo as setup documentation, but the app does
  not load it.
