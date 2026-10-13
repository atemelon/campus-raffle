import { entriesStore, tidy, keyFor, json, allEntries, getWinners, getPrizes } from "../lib/shared.mjs";

// GET  /api/entries  -> { prizes, entries, winners }
// POST /api/entries  { name, major, prizes: [prizeId], website }  -> 201 | 409 duplicate | 400 invalid
export default async (req) => {
  if (req.method === "GET") {
    const [prizes, entries, winners] = await Promise.all([getPrizes(), allEntries(), getWinners()]);
    return json({ prizes, entries, winners });
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Send the form as JSON." }, 400); }

    // Honeypot: real people never fill this hidden field.
    if (body.website) return json({ ok: true }, 201);

    const name = tidy(body.name).slice(0, 80);
    const major = tidy(body.major).slice(0, 80);
    if (name.length < 2) return json({ error: "Add your full name to enter." }, 400);
    if (!major) return json({ error: "Add your major to enter." }, 400);

    const prizes = await getPrizes();
    if (!prizes.length) return json({ error: "Prizes aren't listed yet. Check back soon." }, 400);
    const valid = new Set(prizes.map((p) => p.id));
    const picked = [...new Set(Array.isArray(body.prizes) ? body.prizes.map(String) : [])].filter((id) => valid.has(id));
    if (!picked.length) return json({ error: "Choose at least one prize to enter for." }, 400);

    const key = keyFor(name);
    if (!key) return json({ error: "Use letters or numbers in your name." }, 400);

    const { modified } = await entriesStore().setJSON(
      key,
      { name, major, prizes: picked, createdAt: Date.now() },
      { onlyIfNew: true }
    );
    if (!modified) return json({ error: `“${name}” is already entered. Each name gets one entry.` }, 409);
    return json({ ok: true, name }, 201);
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/entries" };
