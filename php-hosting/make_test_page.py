"""Build test-copy/index.html: the raffle page plus a TEST banner and a rehearsal checklist.
Run after any change to index.html:  python3 make_test_page.py
Upload the result as csf/raffle-test/index.html (the rest of raffle-test is a copy of raffle)."""
from pathlib import Path

here = Path(__file__).parent
src = (here / "index.html").read_text()

CSS = """
/* ---------- Test copy ---------- */
.test-banner { background: repeating-linear-gradient(-45deg, #1d1b3a 0 14px, #2c2950 14px 28px); color: #ffd84d; border-radius: 14px; padding: 14px 18px; display: flex; gap: 10px 18px; align-items: baseline; flex-wrap: wrap; }
.test-banner b { font-family: var(--mono); font-size: 0.85rem; letter-spacing: 0.2em; text-transform: uppercase; }
.test-banner span { color: #f2f0ff; font-size: 0.95rem; }
.test-banner a { color: #ffd84d; font-weight: 700; }
.checklist { background: var(--surface); border: 2px solid var(--ink); border-radius: 14px; }
.checklist > summary { cursor: pointer; padding: 16px 20px; display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; list-style: none; }
.checklist > summary::-webkit-details-marker { display: none; }
.checklist > summary h2 { font-family: var(--display); font-weight: 800; font-size: 1.35rem; margin: 0; }
.checklist > summary .prog { font-family: var(--mono); font-size: 0.85rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.checklist > summary:focus-visible { outline: 3px solid var(--accent); outline-offset: -3px; border-radius: 14px; }
.cl-body { padding: 0 20px 20px; display: grid; gap: 18px; }
.cl-body > p { margin: 0; color: var(--muted); max-width: 70ch; }
.cl-cols { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); align-items: start; }
.cl-group { display: grid; gap: 6px; }
.cl-group h3 { font-family: var(--mono); font-size: 0.78rem; letter-spacing: 0.16em; text-transform: uppercase; margin: 0 0 4px; color: var(--accent); }
.cl-item { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; align-items: start; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--paper); cursor: pointer; text-transform: none; letter-spacing: normal; font-size: 0.95rem; font-weight: 400; }
.cl-item input { width: 20px; height: 20px; margin: 1px 0 0; padding: 0; accent-color: var(--ok); }
.cl-item b { font-weight: 700; }
.cl-item small { display: block; color: var(--muted); font-size: 0.85rem; margin-top: 2px; }
.cl-item:has(input:checked) { border-color: var(--ok); }
.cl-item:has(input:checked) > span { opacity: 0.6; }
.cl-item a { color: var(--accent); font-weight: 700; overflow-wrap: anywhere; }
.cl-foot { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; justify-content: space-between; }
.cl-foot p { margin: 0; color: var(--muted); font-size: 0.9rem; max-width: 60ch; }
"""

def item(key, title, detail=""):
    d = f"<small>{detail}</small>" if detail else ""
    return f'<label class="cl-item"><input type="checkbox" data-k="{key}"><span><b>{title}</b>{d}</span></label>'

groups = [
    ("1 · Setup", [
        item("signin", "Sign in with the passphrase", "Organizer sign-in at the bottom of the page."),
        item("badpass", "Try a wrong passphrase", "It should say the code isn't right."),
        item("prizes", "Add 2–3 test prizes", "Give one of them quantity 2."),
    ]),
    ("2 · Entries", [
        item("enter", "Enter 4–5 made-up names", "Use your phone and your laptop."),
        item("dupe", "Enter a name twice with different capitals", "e.g. “Test Person” then “test  person”. The second should be refused."),
        item("sync", "Check entries appear on the other device", "Within about 10 seconds, without reloading."),
    ]),
    ("3 · Entry timer", [
        item("closein", "Press “Close in 15 min”", "A countdown appears on the ticket for everyone."),
        item("extend", "Press “+5 min”", "The closing time moves later."),
        item("closenow", "Press “Close now” with the page open on another device", "That device should lock within about a second."),
        item("blocked", "Try entering while closed", "It should be blocked."),
        item("reopen", "Press “Open now”", "Entering works again."),
    ]),
    ("4 · Bonus codes", [
        item("make", "Make 6 codes", "Organizer tools → Bonus codes. Label them “Test”."),
        item("print", "Press “Print unused slips”", "If nothing opens, allow pop-ups for this site."),
        item("qr", "Scan one slip’s QR with a phone", "The code should fill in by itself."),
        item("cap", "Redeem codes until one name shows ×3", "The next code for that name should be refused and stay unused."),
        item("noentry", "Try a code with a name that hasn’t entered", "It should ask them to enter first."),
        item("void", "Void one unused code", "Show codes → Void."),
    ]),
    ("5 · Drawing", [
        item("closefirst", "Close entries, then draw every item of one prize", ""),
        item("oneeach", "Draw the other prize", "Nobody who already won should come up again."),
        item("undo", "Press “Undo” on a winner, then Draw again", "The item frees up and a new winner is drawn."),
    ]),
    ("6 · Privacy", [
        item("datafile", 'Open <a href="data/raffle-data.php" target="_blank" rel="noopener">data/raffle-data.php</a>', "Should be blank or “Not Found”, never data."),
        item("configfile", 'Open <a href="api/config.php" target="_blank" rel="noopener">api/config.php</a>', "Should be blank. The passphrase must never show."),
    ]),
    ("7 · Group rehearsal", [
        item("crowd", "5–10 people enter at once on campus Wi-Fi", "Nobody should be blocked; all entries show up."),
        item("projector", "Draw once on the room projector", "Names readable from the back of the room."),
        item("handoff", "Someone else runs a draw using only the organizer guide", "The guide appears after sign-in."),
    ]),
]

cols = "".join(f'<div class="cl-group"><h3>{t}</h3>{"".join(items)}</div>' for t, items in groups)
total = sum(len(i) for _, i in groups)

BLOCK = f"""
  <div class="test-banner" role="note"><b>Test copy</b><span>Rehearsal only. Entries, prizes and codes here are separate from the real raffle at <a href="../raffle/">/raffle</a>, and bonus codes made here don’t work there.</span></div>

  <details class="checklist" id="checklist" open>
    <summary><h2>Rehearsal checklist</h2><span class="prog" id="cl-prog">0 of {total} done</span></summary>
    <div class="cl-body">
      <p>Work through these on this test copy before the event. Tick each one as it passes. Ticks are saved in this browser only. If something fails, take a screenshot of the message and note which step you were on.</p>
      <div class="cl-cols">{cols}</div>
      <div class="cl-foot">
        <p>When you're done: press <b>Clear entries &amp; winners</b> here if you want to rehearse again. On the day, set up the real raffle at <a href="../raffle/">/raffle</a> and print the real bonus slips there. Delete the raffle-test folder after the event.</p>
        <button class="btn ghost" id="cl-reset" type="button">Reset checklist</button>
      </div>
    </div>
  </details>
"""

JS = """
<script>
(() => {
  const KEY = "raffle-test-checklist";
  const boxes = [...document.querySelectorAll("#checklist input[data-k]")];
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch {}
  const prog = () => { const n = boxes.filter(b => b.checked).length; document.getElementById("cl-prog").textContent = `${n} of ${boxes.length} done`; };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(boxes.map(b => [b.dataset.k, b.checked])))); } catch {} };
  boxes.forEach(b => { b.checked = !!saved[b.dataset.k]; b.addEventListener("change", () => { save(); prog(); }); });
  document.querySelectorAll("#checklist .cl-item a").forEach(a => a.addEventListener("click", e => e.stopPropagation()));
  document.getElementById("cl-reset").addEventListener("click", () => { boxes.forEach(b => b.checked = false); save(); prog(); });
  prog();
})();
</script>
"""

def rep(s, a, b):
    assert s.count(a) == 1, a[:60]
    return s.replace(a, b)

out = src
out = out.replace("<title>", '<meta name="robots" content="noindex, nofollow">\n<title>TEST · ', 1)  # first <title> is the page's own
out = rep(out, "/* ---------- Organizer guide ---------- */", CSS + "\n/* ---------- Organizer guide ---------- */")
out = rep(out, '    <div class="eyebrow">Raffle</div>', '    <div class="eyebrow">Raffle · Test copy</div>')
out = rep(out, "  </header>\n", "  </header>\n" + BLOCK)
i = out.rindex("</body>")  # the last one; an earlier one is inside the print-slips template
out = out[:i] + JS + out[i:]

dest = here.parent / "test-copy"
dest.mkdir(exist_ok=True)
(dest / "index.html").write_text(out)
print("wrote", dest / "index.html", f"({total} checks)")
