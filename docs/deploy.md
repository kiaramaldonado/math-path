# Deploying to Cloudflare

The site runs as a single Cloudflare Worker with a D1 database (content) and an R2 bucket
(uploads and drawings). A personal journal fits comfortably in Cloudflare's free tier.

## 1. One-time setup

You need the `kiaramaldonado.com` DNS zone on your Cloudflare account (for the custom subdomain).

```bash
npx wrangler login
npx wrangler d1 create math-path
```

Copy the `database_id` it prints into `wrangler.json` (replace `REPLACE_WITH_D1_DATABASE_ID`). Then:

```bash
npx wrangler r2 bucket create math-path-files
npm run db:migrate:remote
```

## 2. Admin secrets

```bash
npm run setup-admin -- --deploy
```

It asks for your password (twice), shows a QR code to scan with your authenticator app, and stores
the three secrets (`ADMIN_PATH`, `ADMIN_PASSWORD_HASH`, `TOTP_SECRET`) in Cloudflare for you.
Without `--deploy` it only prints them, to store yourself with `npx wrangler secret put <NAME>`.

Bookmark `https://math-path.kiaramaldonado.com/<ADMIN_PATH>` on each device you write from.
**Use different values from your local `.dev.vars`.**

## 3. Deploy

```bash
npm run deploy
```

The `routes` entry in `wrangler.json` attaches the Worker to `math-path.kiaramaldonado.com`
and Cloudflare creates the DNS record and certificate automatically.

### Automatic deploys

In the Cloudflare dashboard: **Workers & Pages → math-path → Settings → Builds → Connect** to the
GitHub repository, branch `main`, build command `npm run build`, deploy command `npx wrangler deploy`.
Every push to `main` then deploys.

## 4. New database migrations

When a new file appears in `migrations/`, apply it before (or right after) deploying:

```bash
npm run db:migrate:remote
```

## Backups

Your notes live in D1 and R2, not in git. Back them up from time to time:

```bash
npx wrangler d1 export math-path --remote --output backup-$(date +%F).sql
```

D1 also keeps 30 days of point-in-time history (**Time Travel**), see
`npx wrangler d1 time-travel --help`.

## Changing the password or authenticator

Run `npm run setup-admin -- --deploy` again. All three change
(including the secret path), so update your bookmarks. To sign out every device, use
**Admin → Settings → Log out of all devices**.
