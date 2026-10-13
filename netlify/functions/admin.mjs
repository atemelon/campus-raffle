import { timingSafeEqual, randomInt, randomUUID } from "node:crypto";
import {
  entriesStore, stateStore, json, tidy, allEntries,
  getPrizes, savePrizes, getWinnersVersioned, saveWinnersIfUnchanged,
} from "../lib/shared.mjs";

// POST /api/admin  header "x-organizer-code"
// body { action, ... }:
//   check
//   addPrize    { name, description?, quantity }
//   updatePrize { id, name?, description?, quantity? }
//   deletePrize { id }
//   draw        { prizeId }              one winner; a person can win at most one prize
//   unwin       { prizeId, entryId }     undo a winner (no-show), freeing the slot
//   remove      { id }                   delete one entry
//   reset       { keepPrizes: true }     clear entries and winners (and prizes if keepPrizes is false)
function authorized(req) {
  const expected = process.env.ORGANIZER_CODE || "";
  const given = req.headers.get("x-organizer-code") || "";
  if (!expected) return false;
  const a = Buffer.from(expected), b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

const qty = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 999 ? n : null;
};

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!process.env.ORGANIZER_CODE) return json({ error: "Set ORGANIZER_CODE in Netlify's environment variables first." }, 500);
  if (!authorized(req)) return json({ error: "That organizer code isn't right." }, 401);

  let body = {};
  try { body = await req.json(); } catch {}

  switch (body.action) {
    case "check":
      return json({ ok: true });

    case "addPrize": {
      const name = tidy(body.name).slice(0, 80);
      const description = tidy(body.description).slice(0, 200);
      const quantity = qty(body.quantity);
      if (!name) return json({ error: "Give the prize a name." }, 400);
      if (!quantity) return json({ error: "Quantity must be a whole number from 1 to 999." }, 400);
      const prizes = await getPrizes();
      if (prizes.length >= 100) return json({ error: "You can list up to 100 prizes." }, 400);
      prizes.push({ id: "p" + randomUUID().slice(0, 8), name, description, quantity, createdAt: Date.now() });
      await savePrizes(prizes);
      return json({ ok: true, prizes });
    }

    case "updatePrize": {
      const prizes = await getPrizes();
      const p = prizes.find((x) => x.id === body.id);
      if (!p) return json({ error: "That prize no longer exists." }, 404);
      if (body.name !== undefined) { const n = tidy(body.name).slice(0, 80); if (!n) return json({ error: "Give the prize a name." }, 400); p.name = n; }
      if (body.description !== undefined) p.description = tidy(body.description).slice(0, 200);
      if (body.quantity !== undefined) { const q = qty(body.quantity); if (!q) return json({ error: "Quantity must be a whole number from 1 to 999." }, 400); p.quantity = q; }
      await savePrizes(prizes);
      return json({ ok: true, prizes });
    }

    case "deletePrize": {
      const prizes = (await getPrizes()).filter((x) => x.id !== body.id);
      await savePrizes(prizes);
      // Drop this prize's winners too.
      const { winners, etag } = await getWinnersVersioned();
      if (winners.some((w) => w.prizeId === body.id)) {
        await saveWinnersIfUnchanged(winners.filter((w) => w.prizeId !== body.id), etag);
      }
      return json({ ok: true, prizes });
    }

    case "draw": {
      const [prizes, entries, { winners, etag }] = await Promise.all([getPrizes(), allEntries(), getWinnersVersioned()]);
      const prize = prizes.find((p) => p.id === body.prizeId);
      if (!prize) return json({ error: "That prize no longer exists." }, 404);
      const awarded = winners.filter((w) => w.prizeId === prize.id).length;
      if (awarded >= prize.quantity) return json({ error: `All ${prize.quantity} of “${prize.name}” have been awarded.` }, 409);
      const alreadyWon = new Set(winners.map((w) => w.entryId));
      const pool = entries.filter((e) => e.prizes.includes(prize.id) && !alreadyWon.has(e.id));
      if (!pool.length) return json({ error: `Nobody left to draw for “${prize.name}”.` }, 409);
      const pick = pool[randomInt(pool.length)];
      const next = [...winners, { prizeId: prize.id, entryId: pick.id, name: pick.name, major: pick.major, at: Date.now() }];
      const saved = await saveWinnersIfUnchanged(next, etag);
      if (!saved) return json({ error: "Another draw happened at the same moment. Press Draw again." }, 409);
      return json({ winner: pick, prize, winners: next, pool: pool.map((p) => ({ name: p.name, major: p.major })) });
    }

    case "unwin": {
      const { winners, etag } = await getWinnersVersioned();
      const next = winners.filter((w) => !(w.prizeId === body.prizeId && w.entryId === body.entryId));
      if (next.length === winners.length) return json({ ok: true, winners });
      const saved = await saveWinnersIfUnchanged(next, etag);
      if (!saved) return json({ error: "The winners list just changed. Try again." }, 409);
      return json({ ok: true, winners: next });
    }

    case "remove": {
      if (!body.id) return json({ error: "Missing entry id." }, 400);
      await entriesStore().delete(String(body.id));
      return json({ ok: true });
    }

    case "reset": {
      const store = entriesStore();
      const { blobs } = await store.list();
      await Promise.all(blobs.map((b) => store.delete(b.key)));
      await stateStore().delete("winners");
      if (body.keepPrizes === false) await stateStore().delete("prizes");
      return json({ ok: true, removed: blobs.length });
    }

    default:
      return json({ error: "Unknown action." }, 400);
  }
};

export const config = { path: "/api/admin" };
