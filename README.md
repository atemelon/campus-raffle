# Campus Raffle

Attendees enter a unique name and their area of study and choose which prizes to enter for; organizers manage a prize inventory and draw winners per prize.
Static page in `public/`, two Netlify Functions in `netlify/functions/`, entries stored in Netlify Blobs.

## Deploy

Drag-and-drop deploys don't build functions, so use Git or the CLI.

**Option A: GitHub (recommended)**
1. Push this folder to a new GitHub repo.
2. Netlify → Add new site → Import an existing project → pick the repo. Build settings come from `netlify.toml`.
3. Site configuration → Environment variables → add `ORGANIZER_CODE` (any passphrase you choose). Redeploy.

**Option B: Netlify CLI**
```
npm install -g netlify-cli
netlify login
netlify init            # create the site
netlify env:set ORGANIZER_CODE "your-passphrase"
netlify deploy --build --prod
```

## Custom domain (IONOS DNS)
1. Netlify → Domain management → Add a domain → `raffle.pavel-romaniko.com`.
2. In IONOS DNS, add a CNAME record: host `raffle`, points to `<your-site>.netlify.app`.
3. Netlify issues the HTTPS certificate automatically once DNS resolves (minutes to an hour).

## Running the event
- Open the site, click **Organizer sign-in** at the bottom, enter `ORGANIZER_CODE`.
- Add each prize with a quantity (e.g. "Tote bag", qty 10). You can change quantities or delete prizes later.
- Share the URL (or a QR code of it). Attendees enter a name, choose an area of study, and tick the prizes they want.
- Press **Draw** on a prize to pick a random winner from people who entered for it. Each prize can be drawn as many times as its quantity.
- Each person can win only one prize; once they win, they're skipped in other draws. **Undo** removes a winner (e.g. a no-show) and frees that item.
- **Clear entries & winners** resets for the next event but keeps the prize list.
- Names are unique ignoring case, accents, and extra spaces.
- Areas of study are listed in `public/index.html` (the `f-major` dropdown) and `netlify/functions/entries.mjs` (`AREAS`); change both together.
