# My Tasks: personal daily and monthly task tracker

React + Vite + Supabase. Dark mode, no login, Excel download.

## 1. Create the database
1. Create a free project at https://supabase.com
2. Open **SQL Editor > New query**, paste everything from `supabase.sql`, and click **Run**.
3. Open **Project Settings > API** and copy the **Project URL** and the **anon public** key.

## 2. Run it on your computer
```bash
cp .env.example .env      # then paste your URL and anon key into .env
npm install
npm run dev
```
Open the address shown in the terminal (usually http://localhost:5173).

## 3. Put it online (optional, free)
Push this folder to GitHub, then import it on Vercel or Netlify.
- Build command: `npm run build`
- Output folder: `dist`
- Environment variables: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

## Notes
- There is no login. Anyone with your site URL and the key in the page can edit your tasks, so keep the URL private.
- **Board view:** switch List/Board. Click Doing (or To do / Done) on a card, or drag it, to move it between columns.
- **Status links:** All / To do / Doing / Done filter the list, and in Board view show only that column.
- **Search** looks through every day (or month), not just the one on screen.
- **Report tab:** monthly donut charts, yearly totals and a per-month bar chart. Click a month to open it.
- **Download Excel:** sheets Report (live formulas + charts), Daily and Monthly.
- Click a task's status badge to cycle To do, Doing, Done. Use Edit to change the title, date, time, status or notes.
