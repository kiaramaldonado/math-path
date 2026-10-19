# Math Path

My public journal of learning mathematics: **math-path.kiaramaldonado.com**.
It holds my notebooks (organised into sections and pages, with formulas, drawings and images), blog posts, projects, certificates and a roadmap.
I write everything from a hidden admin area that works on any device.

Built with Astro on Cloudflare Workers, using D1 for content and R2 for files.

## Local development

```bash
npm install
git config core.hooksPath .githooks     # blocks AI co-author lines in commits
npm run setup-admin -- --local          # creates .dev.vars (password + authenticator QR)
npm run db:migrate:local
npm run dev
```

Open `http://localhost:4321<ADMIN_PATH>` (the path is printed by `setup-admin` and saved in `.dev.vars`).

## First deploy

1. In Cloudflare, make sure the `kiaramaldonado.com` zone is on your account.
2. Create the database and bucket:
   ```bash
   npx wrangler d1 create math-path        # paste the database_id into wrangler.json
   npx wrangler r2 bucket create math-path-files
   npm run db:migrate:remote
   ```
3. Create the admin secrets: `npm run setup-admin` (follow the printed `wrangler secret put` commands).
4. Deploy with `npm run deploy`, or connect the GitHub repo in **Workers → Settings → Builds** to deploy on every push to `main`.

## Commits

Use `scripts/commit.sh "message"` and `scripts/push.sh`. The rules they enforce are described in `CLAUDE.md`.
