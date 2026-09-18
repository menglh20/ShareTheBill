// Same-origin proxy keeps the admin cookie first-party on Vercel.
export default async function handler(req, res) {
  if (!process.env.API_URL)
    return res.status(503).json({ error: "serverNotConfigured" });
  try {
    const base = new URL(process.env.API_URL);
    const incoming = new URL(req.url, "http://localhost");
    const target = new URL(base.origin);
    target.pathname = incoming.pathname;
    target.search = incoming.search;
    const headers = {};
    for (const key of ["content-type", "cookie", "authorization", "origin"])
      if (req.headers[key]) headers[key] = req.headers[key];
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(25000),
      ...(!["GET", "HEAD"].includes(req.method) && req.body !== undefined
        ? {
            body:
              typeof req.body === "string"
                ? req.body
                : JSON.stringify(req.body),
          }
        : {}),
    });
    res.status(upstream.status);
    for (const key of ["content-type", "cache-control", "set-cookie"])
      if (upstream.headers.has(key))
        res.setHeader(key, upstream.headers.get(key));
    res.send(await upstream.text());
  } catch {
    res.status(502).json({ error: "serverUnavailable" });
  }
}
