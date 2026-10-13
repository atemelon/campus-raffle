import { timingSafeEqual, randomInt, randomUUID } from "node:crypto";
import { json, tidy, load, update } from "../lib/shared.mjs";

// POST /api/admin  header "x-organizer-code"; every reply includes the current `state`.
// body { action, ... }:
//   check
//   addPrize    { name, description?, quantity }
//   updatePrize { id, name?, description?, quantity? }
//   deletePrize { id }                   also clears that prize's winners
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
const QTY_ERR = { error: "Quantity must be a whole number from 1 to 999.", status: 400 };

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!process.env.ORGANIZER_CODE) return json({ error: "Set ORGANIZER_CODE in Netlify's environment variables first." }, 500);
  if (!authorized(req)) return json({ error: "That organizer code isn't right." }, 401);

  let body = {};
  try { body = await req.json(); } catch {}

  let r;
  switch (body.action) {
    case "check": {
      const { state } = await load();
      return json({ ok: true, state });
    }

    case "addPrize": {
      const name = tidy(body.name).slice(0, 80);
      const description = tidy(body.description).slice(0, 200);
      const quantity = qty(body.quantity);
      if (!name) return json({ error: "Give the prize a name." }, 400);
      if (!quantity) return json(QTY_ERR, 400);
      r = await update((s) => {
        if (s.prizes.length >= 100) return { error: "You can list up to 100 prizes.", status: 400 };
        s.prizes.push({ id: "p" + randomUUID().slice(0, 8), name, description, quantity, createdAt: Date.now() });
      });
      break;
    }

    case "updatePrize":
      r = await update((s) => {
        const p = s.prizes.find((x) => x.id === body.id);
        if (!p) return { error: "That prize no longer exists.", status: 404 };
        if (body.name !== undefined) {
          const n = tidy(body.name).slice(0, 80);
          if (!n) return { error: "Give the prize a name.", status: 400 };
          p.name = n;
        }
        if (body.description !== undefined) p.description = tidy(body.description).slice(0, 200);
        if (body.quantity !== undefined) {
          const q = qty(body.quantity);
          if (!q) return QTY_ERR;
          p.quantity = q;
        }
      });
      break;

    case "deletePrize":
      r = await update((s) => {
        s.prizes = s.prizes.filter((x) => x.id !== body.id);
        s.winners = s.winners.filter((w) => w.prizeId !== body.id);
        s.entries.forEach((e) => { e.prizes = e.prizes.filter((id) => id !== body.id); });
      });
      break;

    case "draw":
      r = await update((s) => {
        const prize = s.prizes.find((p) => p.id === body.prizeId);
        if (!prize) return { error: "That prize no longer exists.", status: 404 };
        const awarded = s.winners.filter((w) => w.prizeId === prize.id).length;
        if (awarded >= prize.quantity) return { error: `All ${prize.quantity} of “${prize.name}” have been awarded.`, status: 409 };
        const alreadyWon = new Set(s.winners.map((w) => w.entryId));
        const pool = s.entries.filter((e) => e.prizes.includes(prize.id) && !alreadyWon.has(e.id));
        if (!pool.length) return { error: `Nobody left to draw for “${prize.name}”.`, status: 409 };
        const pick = pool[randomInt(pool.length)];
        s.winners.push({ prizeId: prize.id, entryId: pick.id, name: pick.name, major: pick.major, at: Date.now() });
        return { winner: pick, prize, pool: pool.map((p) => ({ name: p.name, major: p.major })) };
      });
      break;

    case "unwin":
      r = await update((s) => {
        s.winners = s.winners.filter((w) => !(w.prizeId === body.prizeId && w.entryId === body.entryId));
      });
      break;

    case "remove":
      if (!body.id) return json({ error: "Missing entry id." }, 400);
      r = await update((s) => {
        s.entries = s.entries.filter((e) => e.id !== String(body.id));
        s.winners = s.winners.filter((w) => w.entryId !== String(body.id));
      });
      break;

    case "reset":
      r = await update((s) => {
        s.entries = [];
        s.winners = [];
        if (body.keepPrizes === false) s.prizes = [];
      });
      break;

    default:
      return json({ error: "Unknown action." }, 400);
  }

  if (r.error) return json({ error: r.error }, r.status || 400);
  return json({ ok: true, ...r });
};

export const config = { path: "/api/admin" };
