module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { path, dateFrom, dateTo, cpIds, ...rest } = req.query;
  if (!path) return res.status(400).json({ error: "Missing ?path=" });

  const KEY  = process.env.AMPECO_API_KEY;
  const BASE = "https://joltcharge-us.us.charge.ampeco.tech/public-api";
  if (!KEY) return res.status(500).json({ error: "Missing AMPECO_API_KEY" });

  const decoded = decodeURIComponent(path);
  const headers = { Authorization: `Bearer ${KEY}`, Accept: "application/json" };

  // ── Smart partner session fetch ────────────────────────────────
  // Sessions are a global feed sorted oldest→newest by ID.
  // We fetch from the last page backwards, filtering by cpIds and date range.
  // Stop when all items on a page are before dateFrom.
  if (dateFrom && cpIds) {
    try {
      const from    = new Date(dateFrom + 'T00:00:00Z');
      const to      = dateTo ? new Date(dateTo + 'T23:59:59Z') : new Date();
      const cpIdSet = new Set(String(cpIds).split(',').map(id => Number(id)));

      // Sessions API — use /resources/sessions/v1.0 with no filters
      // It returns all sessions globally, oldest→newest
      // We fetch the last N pages (newest sessions) and filter client-side
      const sessionPath = '/resources/sessions/v1.0';
      const firstRes = await fetch(`${BASE}${sessionPath}?per_page=100&page=1`, { headers });
      if (!firstRes.ok) return res.status(firstRes.status).json(await firstRes.json().catch(()=>{}));
      const firstJson = await firstRes.json();
      const lastPage = firstJson.meta?.last_page || 1;

      // Fetch last 50 pages in parallel batches of 10
      // 50 pages = 5000 most recent sessions across network
      const numPages = Math.min(50, lastPage);
      const pageNums = [];
      for (let i = 0; i < numPages; i++) {
        const p = lastPage - i;
        if (p >= 1) pageNums.push(p);
      }

      // Fetch in batches of 10 to avoid overwhelming the upstream API
      const matched = [];
      for (let b = 0; b < pageNums.length; b += 10) {
        const batch = pageNums.slice(b, b + 10);
        const results = await Promise.all(
          batch.map(p =>
            fetch(`${BASE}${sessionPath}?per_page=100&page=${p}`, { headers })
              .then(r => r.ok ? r.json() : { data: [] })
              .catch(() => ({ data: [] }))
          )
        );
        for (const r of results) {
          for (const item of (r.data || [])) {
            const d    = new Date(item.startedAt || item.date || 0);
            const cpId = item.chargePointId || item.charge_point_id;
            if (d >= from && d <= to && cpIdSet.has(Number(cpId))) {
              matched.push(item);
            }
          }
        }
        // Early exit: if oldest item on this batch is before dateFrom, stop
        const lastBatch = results[results.length - 1];
        const lastItems = lastBatch?.data || [];
        if (lastItems.length > 0) {
          const oldestDate = new Date(lastItems[0].startedAt || 0);
          if (oldestDate < from) break;
        }
      }

      return res.status(200).json({ data: matched });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Standard passthrough ───────────────────────────────────────
  try {
    const sep = decoded.includes("?") ? "&" : "?";
    const extra = new URLSearchParams(rest).toString();
    const url = `${BASE}${decoded}${extra ? sep + extra : ""}`;
    const r = await fetch(url, { headers });
    return res.status(r.status).json(await r.json());
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
