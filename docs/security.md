# Security

The admin area has to be reachable from any device without exposing it to the world. It is
protected in several layers.

## Hidden admin

- The admin only answers at a secret path (`ADMIN_PATH`, e.g. `/k-…` with 16 random characters),
  stored as a Cloudflare secret, never in the repository.
- `/admin`, `/admin/*` and every `/api/*` request without a valid session return a plain **404**,
  exactly like a page that doesn't exist.
- Admin pages send `noindex`, are left out of the sitemap, and use `Referrer-Policy: same-origin`
  so the secret path is never leaked to other sites through links.
- Public pages never contain the secret path; it is only rendered for signed-in requests.

Hiding the path is an extra layer, not the protection itself. The real protection is:

## Sign-in

- **Password**, stored only as a PBKDF2-SHA256 hash (100,000 iterations, random salt).
- **TOTP code** from an authenticator app (RFC 6238, 30-second codes, ±1 step for clock drift).
  Both must be correct; the response doesn't say which one was wrong.
- **Rate limiting**: 5 failed attempts per IP address, or 30 overall, per 15 minutes.

## Sessions

- Random 256-bit token in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie. Only its SHA-256
  hash is stored in the database.
- Valid for 30 days after last use. **Settings → Log out of all devices** revokes every session.
- Changing data requires the request to come from the site itself (`Origin` check), on top of
  `SameSite=Strict`.

## Content safety

- Drafts are filtered in SQL for every request that isn't signed in.
- Editor content is rendered on the server with escaping and an allow-list of links, colours
  and embed hosts.
- Drawings are converted to SVG on the server from validated stroke data. Files under `/files/`
  are served with `X-Content-Type-Options: nosniff` and a strict, sandboxed
  Content-Security-Policy (except PDFs, which browsers refuse to show when sandboxed).
- Uploads are limited to images and PDFs up to 20 MB, stored under random names.

## Secrets checklist

- `.dev.vars` (local secrets) is git-ignored. Production values are set with `wrangler secret put`.
- Use different values locally and in production.
- If you think a secret leaked: run `npm run setup-admin`, store the new values, then log out
  of all devices.

## Reporting

See [SECURITY.md](../SECURITY.md).
