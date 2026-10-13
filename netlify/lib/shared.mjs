import { getStore } from "@netlify/blobs";

// All raffle data lives in ONE record, so a page refresh costs a single read.
// Shape: { prizes: [{id,name,description,quantity,createdAt}],
//          entries: [{id,name,major,prizes:[prizeId],createdAt}],
//          winners: [{prizeId,entryId,name,major,at}] }
const STORE = "raffle-state";
const KEY = "raffle";
const store = () => getStore({ name: STORE, consistency: "strong" });

export const tidy = (s) => String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();

// Case-, accent- and spacing-insensitive key, so "Jordan Alvarez" and "jordan  alvarez" collide.
export function keyFor(name) {
  const base = tidy(name).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  let out = "";
  for (const ch of base) {
    if (/[a-z0-9]/.test(ch)) out += ch;
    else if (ch === " ") out += "-";
    else out += "_" + ch.codePointAt(0).toString(16);
  }
  return out.slice(0, 300);
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

const empty = () => ({ prizes: [], entries: [], winners: [] });
const normalize = (s) => ({
  prizes: Array.isArray(s?.prizes) ? s.prizes : [],
  entries: Array.isArray(s?.entries) ? s.entries : [],
  winners: Array.isArray(s?.winners) ? s.winners : [],
  updatedAt: s?.updatedAt || 0,
});

// One-time move from the earlier layout (one record per entry) into the single record.
async function migrateOld() {
  const state = empty();
  try {
    const old = getStore({ name: "raffle-entries", consistency: "strong" });
    const { blobs } = await old.list();
    const items = await Promise.all(blobs.map((b) => old.get(b.key, { type: "json" })));
    items.forEach((e, i) => {
      if (e) state.entries.push({ id: blobs[i].key, name: e.name, major: e.major, prizes: e.prizes || [], createdAt: e.createdAt });
    });
    state.entries.sort((a, b) => a.createdAt - b.createdAt);
    state.prizes = (await store().get("prizes", { type: "json" })) ?? [];
    state.winners = (await store().get("winners", { type: "json" })) ?? [];
  } catch {}
  return state;
}

export async function load() {
  const r = await store().getWithMetadata(KEY, { type: "json" });
  if (r) return { state: normalize(r.data), etag: r.etag };
  // First run (or first run after the layout change): save the starting record once,
  // so later reads never have to look at the old layout again.
  const state = await migrateOld();
  const { modified, etag } = await store().setJSON(KEY, state, { onlyIfNew: true });
  if (modified) return { state, etag };
  const again = await store().getWithMetadata(KEY, { type: "json" });
  return again ? { state: normalize(again.data), etag: again.etag } : { state, etag: null };
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Read, change, and save only if nobody else saved in between; retries on a clash.
// `change(state)` edits state in place and returns extra response data, or { error, status } to abort.
export async function update(change, tries = 10) {
  for (let i = 0; i < tries; i++) {
    const { state, etag } = await load();
    const result = (await change(state)) || {};
    if (result.error) return result;
    state.updatedAt = Math.max(Date.now(), (state.updatedAt || 0) + 1);
    const { modified } = await store().setJSON(KEY, state, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
    if (modified) return { ...result, state };
    await sleep(15 + Math.random() * 60 * (i + 1));
  }
  return { error: "The raffle is busy right now. Try again in a moment.", status: 503 };
}
