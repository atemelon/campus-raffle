import { getStore } from "@netlify/blobs";

export const entriesStore = () => getStore({ name: "raffle-entries", consistency: "strong" });
export const stateStore = () => getStore({ name: "raffle-state", consistency: "strong" });

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

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export async function allEntries() {
  const store = entriesStore();
  const { blobs } = await store.list();
  const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return items
    .map((e, i) =>
      e
        ? {
            id: blobs[i].key,
            name: e.name,
            major: e.major,
            prizes: Array.isArray(e.prizes) ? e.prizes : [],
            createdAt: e.createdAt,
          }
        : null
    )
    .filter(Boolean)
    .sort((a, b) => a.createdAt - b.createdAt);
}

// Prizes: [{ id, name, description, quantity, createdAt }]
export async function getPrizes() {
  return (await stateStore().get("prizes", { type: "json" })) ?? [];
}
export async function savePrizes(prizes) {
  await stateStore().setJSON("prizes", prizes);
}

// Winners: [{ prizeId, entryId, name, major, at }]
export async function getWinners() {
  return (await stateStore().get("winners", { type: "json" })) ?? [];
}
export async function getWinnersVersioned() {
  const r = await stateStore().getWithMetadata("winners", { type: "json" });
  return r ? { winners: r.data ?? [], etag: r.etag } : { winners: [], etag: null };
}
// Saves only if nobody else changed the winners list since it was read.
export async function saveWinnersIfUnchanged(winners, etag) {
  const opts = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
  const { modified } = await stateStore().setJSON("winners", winners, opts);
  return modified;
}
