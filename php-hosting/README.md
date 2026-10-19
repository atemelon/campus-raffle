# Student Creative Summit Raffle (PHP hosting)

The same raffle as the Netlify version, for ordinary web hosting with PHP (IONOS web hosting and most others).
No database needed: everything is saved in one file in the `data` folder.

Requirements: PHP 7.4 or newer (8.x recommended), Apache (for the `.htaccess` file).

## 1. Set your organizer passphrase
Open `api/config.php` and change `'change-me'` to your passphrase, e.g. `'violet-easel-42-summit'`.
Keep the quotes. This replaces the Netlify environment variable.

## 2. Upload
Upload everything in this folder, keeping the structure:

```
index.html
api/   admin.php  config.php  entries.php  lib.php
data/  .htaccess  index.html
```

The `.htaccess` file starts with a dot and may be hidden on your computer. Make sure it's uploaded
(in Finder press Cmd+Shift+. to show hidden files; FileZilla shows them by default).

On IONOS: use **Hosting → Webspace (file manager)**, or connect with SFTP using the credentials under
**Hosting → SFTP & SSH**. Put the files in a new folder, e.g. `/raffle`.

## 3. Point the subdomain at the folder (IONOS)
**Domains & SSL → pavel-romaniko.com → Subdomains → Add subdomain** `raffle`, then set its
destination to **Webspace** and choose the `/raffle` folder. Turn on SSL for it.
If `raffle` currently points to Netlify (a CNAME record), remove that record first.

## 4. Check it
- Open https://raffle.pavel-romaniko.com and submit a test entry. If you see
  "The server can't save entries", make the `data` folder writable (permissions 755, or 775 if needed).
- Open https://raffle.pavel-romaniko.com/data/raffle-data.php: it should show a blank page or "not found".
  That's the private data file; nobody can read it in a browser.
- Click **Organizer sign-in**, enter your passphrase, add prizes, draw, then **Clear entries & winners**.

## Notes
- Prizes and entries from the Netlify version don't carry over; add your prizes again.
- To back up or export results, download `data/raffle-data.php` (it's JSON after the first line).
- Areas of study: edit `AREAS` in `api/config.php` and the dropdown in `index.html` (`id="f-major"`) together.
