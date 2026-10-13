const AREAS = ["Theater Arts", "Animation and Interactive Media", "Digital Media", "Graphic Design", "Studio Art", "Music", "JPW", "Other"];

import { tidy, keyFor, json, load, update } from "../lib/shared.mjs";

// GET  /api/entries  -> { prizes, entries, winners }
//   Cached at Netlify's edge for 10 s, so many open pages share one function call.
// POST /api/entries  { name, major, prizes: [prizeId], website }  -> 201 + state | 409 duplicate | 400 invalid
export default async (req) => {
  if (req.method === "GET") {
    const { state } = await load();
    return json(state, 200, {
      "cache-control": "public, max-age=0, must-revalidate",
      "netlify-cdn-cache-control": "public, durable, s-maxage=10, stale-while-revalidate=20",
    });
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Send the form as JSON." }, 400); }

    // Honeypot: real people never fill this hidden field.
    if (body.website) return json({ ok: true }, 201);

    const name = tidy(body.name).slice(0, 80);
    const major = tidy(body.major).slice(0, 80);
    if (name.length < 2) return json({ error: "Add your full name to enter." }, 400);
    if (!AREAS.includes(major)) return json({ error: "Choose your area of study from the list." }, 400);
    const key = keyFor(name);
    if (!key) return json({ error: "Use letters or numbers in your name." }, 400);
    const wanted = [...new Set(Array.isArray(body.prizes) ? body.prizes.map(String) : [])];

    const r = await update((state) => {
      if (!state.prizes.length) return { error: "Prizes aren't listed yet. Check back soon.", status: 400 };
      const valid = new Set(state.prizes.map((p) => p.id));
      const picked = wanted.filter((id) => valid.has(id));
      if (!picked.length) return { error: "Choose at least one prize to enter for.", status: 400 };
      if (state.entries.some((e) => e.id === key)) return { error: `“${name}” is already entered. Each name gets one entry.`, status: 409 };
      if (state.entries.length >= 2000) return { error: "The raffle is full. Ask an organizer for help.", status: 400 };
      state.entries.push({ id: key, name, major, prizes: picked, createdAt: Date.now() });
      return { ok: true, name };
    });
    if (r.error) return json({ error: r.error }, r.status || 400);
    return json(r, 201);
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/entries" };
