module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { path, ...rest } = req.query;
  if (!path) return res.status(400).json({ error: "Missing ?path= parameter" });

  const AMPECO_KEY  = process.env.AMPECO_API_KEY;
  const AMPECO_BASE = "https://joltcharge-us.us.charge.ampeco.tech/public-api";

  if (!AMPECO_KEY) {
    return res.status(500).json({ error: "Missing env var: AMPECO_API_KEY" });
  }

  // Decode the path so brackets in filter params are preserved correctly
  const decodedPath = decodeURIComponent(path);
  const extraParams = new URLSearchParams(rest).toString();
  const separator = decodedPath.includes("?") ? "&" : "?";
  const url = `${AMPECO_BASE}${decodedPath}${extraParams ? separator + extraParams : ""}`;

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
