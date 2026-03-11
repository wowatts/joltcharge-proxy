
// api/ampeco.js
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { path, ...query } = req.query;
  if (!path) return res.status(400).json({ error: "Missing ?path= parameter" });

  const AMPECO_KEY  = process.env.AMPECO_API_KEY;
  const AMPECO_BASE = process.env.AMPECO_BASE_URL;

  if (!AMPECO_KEY || !AMPECO_BASE) {
    return res.status(500).json({ error: "Missing env vars: AMPECO_API_KEY or AMPECO_BASE_URL" });
  }

  const qs = new URLSearchParams(query).toString();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${AMPECO_BASE}${normalizedPath}${qs ? "?" + qs : ""}`;

  try {
    const upstream = await fetch(url, {
      headers: {
        Authorization: `Bearer ${AMPECO_KEY}`,
        Accept: "application/json",
      },
    });
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message, url });
  }
};
