module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { path, dateFrom, dateTo, ...rest } = req.query;
  if (!path) return res.status(400).json({ error: "Missing ?path=" });

  const KEY  = process.env.AMPECO_API_KEY;
  const BASE = "https://joltcharge-us.us.charge.ampeco.tech/public-api";
  if (!KEY) return res.status(500).json({ error: "Missing AMPECO_API_KEY" });

  const decoded = decodeURIComponent(path);
  const sep = decoded.includes("?") ? "&" : "?";
  const headers = { Authorization: `Bearer ${KEY}`, Accept: "application/json" };

  // ── Date-filtered mode ─────────────────────────────────────────
  if (dateFrom) {
    try {
      const from = new Date(dateFrom + 'T00:00:00Z');
      const to   = dateTo ? new Date(dateTo + 'T23:59:59Z') : new Date();

      // Get last page number using per_page=100
      const page1 = await fetch(`${BASE}${decoded}${sep}per_page=100&page=1`, { headers });
      if (!page1.ok) return res.status(page1.status).json(await page1.json().catch(()=>{}));
      const j1 = await page1.json();
      const lastPage = j1.meta?.last_page || 1;

      // Fetch last 3 pages in parallel
      const pages = [lastPage, lastPage-1, lastPage-2].filter(p => p >= 1);
      const fetches = await Promise.all(
        pages.map(p =>
          fetch(`${BASE}${decoded}${sep}per_page=100&page=${p}`, { headers })
            .then(r => r.ok ? r.json() : { data: [] })
            .catch(() => ({ data: [] }))
        )
      );

      const items = [];
      fetches.forEach(f => {
        (f.data || []).forEach(item => {
          const d = new Date(item.startedAt || item.date || item.created_at || 0);
          if (d >= from && d <= to) items.push(item);
        });
      });

      // Also include page1 items if lastPage was 1
      if (lastPage === 1) {
        (j1.data || []).forEach(item => {
          const d = new Date(item.startedAt || item.date || item.created_at || 0);
          if (d >= from && d <= to) items.push(item);
        });
      }

      return res.status(200).json({ data: items });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Standard passthrough ───────────────────────────────────────
  try {
    const extra = new URLSearchParams(rest).toString();
    const url = `${BASE}${decoded}${extra ? sep + extra : ""}`;
    const r = await fetch(url, { headers });
    return res.status(r.status).json(await r.json());
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
