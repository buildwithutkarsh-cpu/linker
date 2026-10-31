# Linker

URL shortener on **Cloudflare Workers** (Worker + KV + Static Assets).

## Deploy

```bash
npm install
npx wrangler login
npx wrangler kv namespace create LINKS
```

Copy the printed `id` into `wrangler.jsonc` (`kv_namespaces[0].id`), then:

```bash
npm run deploy
```

Your app is live at `https://linker.<your-subdomain>.workers.dev`.

## Custom domain
In `wrangler.jsonc`, uncomment `routes` and set your hostname (the domain must be on Cloudflare), then redeploy.

## Local dev
```bash
npm run dev
```

## How it works
- `POST /api/shorten` `{ url, alias? }` → `{ code, url, key }`
- `GET /:code` → 302 redirect
- `DELETE /api/links/:code` with header `x-key` (returned on creation, kept in the creator’s browser)
- Your own link list is stored in your browser; links themselves live in KV.

## Notes
- KV is eventually consistent: a brand-new link can take a few seconds to resolve in other regions.
- Add Cloudflare rate limiting / Turnstile if the public form gets abused.
