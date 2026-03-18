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
  const sep = decodedPath.includes("?") ? "&" : "?";

  // Date-filtered mode: fetch last N pages and filter client-side
  if (dateFrom) {
    try {
      const from = new Date(dateFrom + 'T00:00:00Z');
      const to   = dateTo ? new Date(dateTo + 'T23:59:59Z') : new Date();

      // Step 1: get total page count (single request)
      const metaRes = await fetch(
        `${AMPECO_BASE}${decodedPath}${sep}per_page=1&page=1`,
        { headers: { Authorization: `Bearer ${AMPECO_KEY}`, Accept: "application/json" } }
      );
      if (!metaRes.ok) return res.status(metaRes.status).json(await metaRes.json().catch(()=>{}));
      const meta = await metaRes.json();
      const lastPage = meta.meta?.last_page || 1;
      const perPage = 100;
      const totalPages = Math.ceil(lastPage / perPage) || 1;

      // Step 2: fetch last 3 pages in parallel (newest sessions)
      const pagesToFetch = [];
      for (let p = totalPages; p >= Math.max(1, totalPages - 2); p--) {
        pagesToFetch.push(p);
      }

      const results = await Promise.all(pagesToFetch.map(p =>
        fetch(`${AMPECO_BASE}${decodedPath}${sep}per_page=${perPage}&page=${p}`,
          { headers: { Authorization: `Bearer ${AMPECO_KEY}`, Accept: "application/json" } }
        ).then(r => r.json()).catch(() => ({ data: [] }))
      ));

      // Collect and filter by date
      const allItems = [];
      for (const r of results) {
        for (const item of (r.data || r.items || [])) {
          const d = new Date(item.startedAt || item.date || item.created_at || 0);
          if (d >= from && d <= to) allItems.push(item);
        }
      }

      return res.status(200).json({ data: allItems });

    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Standard passthrough
  try {
    const extraParams = new URLSearchParams(rest).toString();
    const url = `${AMPECO_BASE}${decodedPath}${extraParams ? sep + extraParams : ""}`;
    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${AMPECO_KEY}`, Accept: "application/json" }
    });
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
