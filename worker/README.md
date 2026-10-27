# Answer corrections (Cloudflare Worker)

Users tap "Повідомити про помилку у відповіді" in the app → the correction lands here (D1).
The admin opens `https://<worker>/admin`, sees corrections grouped by question with vote counts
and comments, and clicks "Прийняти «x»" → the worker commits the new letter to
`source/answers/<cat>.txt` on GitHub → Pages redeploys in 1–2 minutes.

Until accepted, the person's correction only applies on their own device.

## API
- `POST /api/suggestions` — `{cat, n, letter, current, comment, name, clientId}` (`letter` = correct letters, e.g. `"ad"`); one vote per device per question, 40/hour per IP.
- `GET /api/admin/suggestions?status=pending|done`, `POST /api/admin/accept {cat,n,letter}`, `POST /api/admin/reject {cat,n}` — `Authorization: Bearer <ADMIN_TOKEN>`.

## Deploy

`worker/.env` (not committed):
```
CLOUDFLARE_API_TOKEN=...   # template "Edit Cloudflare Workers" + Account → D1 → Edit
GITHUB_TOKEN=...           # fine-grained, this repo only, Contents: Read and write
```

```
cd worker && npm install
npx wrangler d1 create medtests-feedback      # put database_id into wrangler.toml
npm run db:init
npx wrangler deploy
npx wrangler secret put ADMIN_TOKEN            # admin page password
npx wrangler secret put GITHUB_TOKEN
```
Then set `FEEDBACK_URL` in `public/app.js` to the worker URL and push.

## Local
```
printf 'ADMIN_TOKEN=test\nGITHUB_TOKEN=x\n' > .dev.vars
npm run db:init:local && npm run dev
```
