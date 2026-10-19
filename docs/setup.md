# Local setup

## Requirements

- Node.js 22 or newer
- npm
- A Cloudflare account is **not** needed for local development: Wrangler emulates D1 and R2 on your machine.

## First run

```bash
git clone https://github.com/kiaramaldonado/math-path.git
cd math-path
npm install
git config core.hooksPath .githooks       # blocks AI co-author lines in commits
npm run setup-admin -- --local            # asks for a password, shows a QR code, writes .dev.vars
npm run db:migrate:local                  # creates the local database
npm run dev
```

`setup-admin` prints:

- a **QR code**: scan it with an authenticator app (1Password, Google Authenticator, Authy, Microsoft Authenticator…);
- your **secret admin path**, e.g. `/k-abcd1234efgh5678`.

Open `http://localhost:4321` for the public site and `http://localhost:4321/<your secret path>` to sign in.

`.dev.vars` holds your local secrets and is git-ignored. Never commit it.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload, local D1 and R2 |
| `npm test` | Unit tests (auth, renderer, content queries) |
| `npm run check` | Build + type checks + Cloudflare dry-run deploy |
| `npm run preview` | Production build served by Wrangler |
| `npm run db:migrate:local` | Apply new migrations to the local database |
| `npm run cf-typegen` | Regenerate `worker-configuration.d.ts` after changing `wrangler.json` |

Local data lives in `.wrangler/state`. Delete that folder to start from an empty database
(then run `npm run db:migrate:local` again).

## Troubleshooting

- **Editor doesn't load, console shows "504 Outdated Optimize Dep"**: Vite's cache is stale.
  Stop the server, run `rm -rf node_modules/.vite`, start again.
- **Login says "Too many attempts"**: 5 wrong tries from one address lock it for 15 minutes.
  Locally you can clear it with `npx wrangler d1 execute math-path --local --command "DELETE FROM login_attempts"`.
- **Codes are always wrong**: check your computer's and phone's clocks are set automatically.
