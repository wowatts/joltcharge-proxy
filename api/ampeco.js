module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { path, dateFrom, dateTo, ...rest } = req.query;
  if (!path) return res.status(400).json({ error: "Missing ?path= parameter" });

  const AMPECO_KEY  = process.env.AMPECO_API_KEY;
  const AMPECO_BASE = "https://joltcharge-us.us.charge.ampeco.tech/public-api";
  if (!AMPECO_KEY) return res.status(500).json({ error: "Missing env var: AMPECO_API_KEY" });

  const decodedPath = decodeURIComponent(path);

  // Server-side date filtering:
  // Fetch from the LAST page backwards (newest sessions first) and stop
  // once we've gone past dateFrom. This avoids scanning old records.
  if (dateFrom) {
    try {
      const from = new Date(dateFrom + 'T00:00:00Z');
      const to   = dateTo ? new Date(dateTo + 'T23:59:59Z') : new Date();
      const perPage = 100;

      // First, get the last page number
      const sep = decodedPath.includes("?") ? "&" : "?";
      const firstUrl = `${AMPECO_BASE}${decodedPath}${sep}per_page=${perPage}&page=1`;
      const firstRes = await fetch(firstUrl, {
        headers: { Authorization: `Bearer ${AMPECO_KEY}`, Accept: "application/json" }
      });
      if (!firstRes.ok) {
        const err = await firstRes.json().catch(() => ({}));
        return res.status(firstRes.status).json(err);
      }
      const firstJson = await firstRes.json();
      const lastPage = firstJson.meta?.last_page || 1;

      // Fetch from last page backwards until we pass dateFrom
      let allItems = [];
      let done = false;
      let page = lastPage;
      const maxPages = 20; // max 20 pages = 2000 records per charger per request
      let pagesChecked = 0;

      while (!done && pagesChecked < maxPages) {
        const url = `${AMPECO_BASE}${decodedPath}${sep}per_page=${perPage}&page=${page}`;
        const upstream = await fetch(url, {
          headers: { Authorization: `Bearer ${AMPECO_KEY}`, Accept: "application/json" }
        });
        if (!upstream.ok) break;
        const json = await upstream.json();
        const items = (json.data || json.items || []).reverse(); // reverse so newest first

        for (const item of items) {
          const d = new Date(item.startedAt || item.date || item.created_at || 0);
          if (d > to) continue;       // newer than range, skip
          if (d < from) { done = true; break; } // older than range, stop
          allItems.push(item);
        }

        page--;
        pagesChecked++;
        if (page < 1) done = true;
      }

      return res.status(200).json({ data: allItems });

    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Standard passthrough
  try {
    const extraParams = new URLSearchParams(rest).toString();
    const separator = decodedPath.includes("?") ? "&" : "?";
    const url = `${AMPECO_BASE}${decodedPath}${extraParams ? separator + extraParams : ""}`;
    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${AMPECO_KEY}`, Accept: "application/json" }
    });
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
