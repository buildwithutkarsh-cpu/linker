// Linker – URL shortener on Cloudflare Workers + KV + Static Assets
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const RESERVED = new Set(["api", "icon", "index", "assets", "favicon", "robots", "static", "admin"]);
const MAX_URL = 2048;

const rand = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((x) => ALPHABET[x % ALPHABET.length]).join("");
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

function cleanUrl(raw, host) {
  let v = String(raw || "").trim();
  if (!v || v.length > MAX_URL) return null;
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;
  try {
    const u = new URL(v);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".") || u.host === host) return null;
    return u.href;
  } catch { return null; }
}

const page404 = () =>
  new Response(
    `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Not found</title><link rel=icon href=/icon.svg>
<style>html,body{height:100%;margin:0;background:#000;color:#fff;font-family:"Helvetica Neue",Arial,sans-serif}body{display:grid;place-items:center;text-align:center}
b{font-size:clamp(90px,26vw,380px);font-weight:800;letter-spacing:-.06em;line-height:.85;display:block}p{color:#9a9a9a;margin:14px 0}a{color:#fff}</style>
<div><b>404</b><p>That short link doesn’t exist.</p><a href=/>Make a new one ↗</a></div>`,
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }
  );

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Create
    if (path === "/api/shorten" && req.method === "POST") {
      const origin = req.headers.get("origin");
      if (origin && origin !== url.origin) return json({ error: "Forbidden" }, 403);
      let body;
      try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
      const target = cleanUrl(body.url, url.host);
      if (!target) return json({ error: "That doesn’t look like a valid link." }, 400);

      let code = String(body.alias || "").trim().toLowerCase();
      if (code) {
        if (!/^[a-z0-9-]{2,24}$/.test(code) || RESERVED.has(code)) return json({ error: "Alias: 2–24 letters, numbers or dashes." }, 400);
        if (await env.LINKS.get(code)) return json({ error: "That alias is taken." }, 409);
      } else {
        for (let i = 0; i < 5; i++) {
          const c = rand(6);
          if (!(await env.LINKS.get(c))) { code = c; break; }
        }
        if (!code) return json({ error: "Try again." }, 503);
      }
      const key = rand(24);
      await env.LINKS.put(code, JSON.stringify({ u: target, k: key, t: Date.now() }));
      return json({ code, url: target, key });
    }

    // Delete (needs the key returned on creation)
    const del = path.match(/^\/api\/links\/([a-z0-9-]{2,24})$/);
    if (del && req.method === "DELETE") {
      const rec = await env.LINKS.get(del[1], "json");
      if (!rec) return json({ ok: true });
      if (req.headers.get("x-key") !== rec.k) return json({ error: "Forbidden" }, 403);
      await env.LINKS.delete(del[1]);
      return json({ ok: true });
    }

    // Redirect
    if (req.method === "GET" || req.method === "HEAD") {
      const m = path.match(/^\/([a-z0-9-]{2,24})$/);
      if (m && !RESERVED.has(m[1])) {
        const rec = await env.LINKS.get(m[1], "json");
        if (rec) return new Response(null, { status: 302, headers: { location: rec.u, "cache-control": "no-store" } });
      }
      return page404();
    }
    return new Response("Method not allowed", { status: 405 });
  },
};
