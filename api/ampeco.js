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

  // If dateFrom/dateTo provided, do server-side date filtering across pages
  if (dateFrom) {
    try {
      const from = new Date(dateFrom);
      const to   = dateTo ? new Date(dateTo + 'T23:59:59Z') : new Date();
      const perPage = parseInt(rest.per_page || rest.perPage || 100);
      let page = parseInt(rest.page || 1);
      let allItems = [];
      let lastPage = 1;
      let done = false;

      // Sessions are returned oldest-first by default.
      // Fetch pages until we've passed the 'to' date or run out.
      do {
        const sep = decodedPath.includes("?") ? "&" : "?";
        const url = `${AMPECO_BASE}${decodedPath}${sep}per_page=${perPage}&page=${page}`;
        const upstream = await fetch(url, {
          headers: { Authorization: `Bearer ${AMPECO_KEY}`, Accept: "application/json" }
        });
        if (!upstream.ok) {
          const err = await upstream.json().catch(() => ({}));
          return res.status(upstream.status).json(err);
        }
        const json = await upstream.json();
        const items = json.data || json.items || [];
        lastPage = json.meta?.last_page || 1;

        for (const item of items) {
          const itemDate = new Date(item.startedAt || item.date || item.createdAt || item.created_at || 0);
          if (itemDate < from) continue;      // too old, skip
          if (itemDate > to)  { done = true; break; } // too new, stop
          allItems.push(item);
        }

        // If last item on this page is still before 'from', keep going
        // If last item is after 'to', we're done
        if (items.length > 0) {
          const lastItem = items[items.length - 1];
          const lastDate = new Date(lastItem.startedAt || lastItem.date || lastItem.createdAt || 0);
          if (lastDate > to) done = true;
        }

        page++;
        if (page > lastPage) done = true;
        // Safety cap: max 50 pages per request (~5000 records)
        if (page > 51) done = true;

      } while (!done);

      return res.status(200).json({
        data: allItems,
        meta: { total: allItems.length, filtered: true, dateFrom, dateTo }
      });

    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Standard passthrough (no date filtering)
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
