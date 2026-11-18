## Complete Website Downloader 💾
Download the complete source code of any website (including all assets) 🔨.

👉 Live Demo: https://website-downloader.onrender.com

![enter image description here](https://github.com/AhmadIbrahiim/Website-downloader/blob/master/public/Record.gif?raw=true)
<div align="center">

  <a href="">![CodeFactor](https://www.codefactor.io/repository/github/ahmadibrahiim/website-downloader/badge)</a>

</div>

## Description 📒

The server mirrors a website with `wget`, compresses the result with `archiver`
and streams progress back to the browser over a Socket.IO channel. When the zip
is ready the page offers it for download.

**wget flags used** (see `wget/index.js`):

```bash
wget --mirror --convert-links --adjust-extension --page-requisites \
     --no-parent --no-if-modified-since --timeout=20 --tries=2 \
     --quota=100m http://example.org
```

**Explanation of the various flags:**

- `--mirror` – Makes (among other things) the download recursive.
- `--convert-links` – Converts links (including CSS stylesheets) to relative URLs, so the copy works offline.
- `--adjust-extension` – Adds suitable extensions to filenames (`.html` or `.css`) depending on their content type.
- `--page-requisites` – Downloads CSS, scripts and images required to display the page offline.
- `--no-parent` – When recursing, does not ascend to the parent directory.
- `--timeout` / `--tries` – Bound how long a broken host can hold a request.
- `--quota` – Caps the size of a single mirror (`DOWNLOAD_QUOTA`).

Each request downloads into its own temporary folder under `downloads/`. When it
finishes, the folder is zipped into `public/sites/` and removed. The browser
downloads the archive from `/sites/<name>.zip`.

### Deploy on cloud providers
[![Run on Replit](https://binbashbanana.github.io/deploy-buttons/buttons/remade/replit.svg)](https://replit.com/github/AhmadIbrahiim/Website-downloader)
[![Remix on Glitch](https://binbashbanana.github.io/deploy-buttons/buttons/remade/glitch.svg)](https://glitch.com/edit/#!/import/github/AhmadIbrahiim/Website-downloader)
[![Deploy on Railway](https://binbashbanana.github.io/deploy-buttons/buttons/remade/railway.svg)](https://railway.app/new/template?template=https://github.com/AhmadIbrahiim/Website-downloader)
[![Deploy to Cyclic](https://binbashbanana.github.io/deploy-buttons/buttons/remade/cyclic.svg)](https://app.cyclic.sh/api/app/deploy/AhmadIbrahiim/Website-downloader)
[![Deploy to Koyeb](https://binbashbanana.github.io/deploy-buttons/buttons/remade/koyeb.svg)](https://app.koyeb.com/deploy?type=git&repository=github.com/AhmadIbrahiim/Website-downloader&branch=main&name=Website-downloader)
[![Deploy to Render](https://binbashbanana.github.io/deploy-buttons/buttons/remade/render.svg)](https://render.com/deploy?repo=https://github.com/AhmadIbrahiim/Website-downloader)


## Requirements 📦

- Node.js 16 or newer (Node 18+ recommended)
- `wget` on the `PATH`. The app shells out to it, and nothing will download without it:
  - Debian/Ubuntu: `apt install wget`
  - Fedora: `dnf install wget`
  - macOS: `brew install wget`
  - Windows: `winget install JernejSimoncic.Wget`

The server checks for `wget` at startup and prints a warning when it is missing.

## Running locally 🚀

```bash
git clone https://github.com/AhmadIbrahiim/Website-downloader.git
cd Website-downloader

npm ci          # reproducible install from package-lock.json
# or: npm install

npm start
```

Then open <http://localhost:3000/>.

| Command | What it does |
| --- | --- |
| `npm start` | Starts the server on `PORT` (default `3000`) |
| `npm run dev` | Same, with `NODE_ENV=development` (error pages include the stack trace) |
| `npm test` | Runs the unit tests (no test framework needed) |
| `PORT=8080 npm start` | Starts on another port (PowerShell: `$env:PORT=8080; npm start`) |
| `ALLOW_PRIVATE_TARGETS=1 npm start` | Also allows `localhost`/private-network targets |

The app creates `downloads/` and `public/sites/` automatically and cleans stale
files at startup and every 30 minutes.

## Configuration ⚙️

All settings are optional environment variables:

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` | Port the server listens on |
| `DOWNLOAD_QUOTA` | `100m` | Size ceiling passed to wget, so one request cannot fill the disk |
| `DOWNLOAD_TIMEOUT_MS` | `300000` | How long a single download may run before it is stopped |
| `MAX_CONCURRENT_DOWNLOADS` | `5` | How many downloads may run at the same time |
| `ARCHIVE_TTL_MS` | `21600000` (6 h) | How long generated zips stay in `public/sites` before cleanup |
| `JOB_TTL_MS` | `3600000` (1 h) | How long a half-finished mirror in `downloads/` is kept |
| `ALLOW_PRIVATE_TARGETS` | unset | Allow `localhost`/private-network addresses (blocked by default to prevent basic SSRF attempts) |

## Project structure 🗂️

```text
app.js, bin/www      Express app and HTTP/Socket.IO bootstrap
routes/              Page routes
views/               Handlebars templates (page, layout, error)
socket/socket.js     Validates requests and tracks one job per connection
wget/index.js        Spawns wget, reports progress and handles failures
archiver/index.js    Builds the zip and removes partial archives on failure
lib/target.js        URL parsing and private-network guard
lib/paths.js         Shared directories and TTL cleanup
public/              Static assets and generated archives (public/sites)
test/                Node-based unit tests
```

## Tests 🧪

```bash
npm test
```

The suite covers address parsing, the private-network guard and the failure
message selection. It uses only Node's built-in `assert`, so no extra
dependencies are installed for testing.

## Troubleshooting 🔧

| Symptom | Cause / fix |
| --- | --- |
| `wget was not found on the PATH` | Install wget (see Requirements) and restart the server. |
| `EADDRINUSE` on start | Another process uses the port; run with `PORT=8080 npm start`. |
| "only downloads from public websites" | The target is `localhost` or a private IP. Use a public address, or set `ALLOW_PRIVATE_TARGETS=1` for an intranet mirror. |
| "Nothing could be downloaded" | The site blocked the request (403, robots.txt, login wall) or redirected off-site. The message includes the relevant wget line. |
| Download link stops working later | Archives expire after `ARCHIVE_TTL_MS`; start a new download. |
| A large site times out | Raise `DOWNLOAD_TIMEOUT_MS` / `DOWNLOAD_QUOTA` or enter a more specific page URL. |

## Changelog 📝

See [CHANGELOG.md](CHANGELOG.md) for the changes in this revision.

# How To Contribute:
 - Open Issue(s) with any bugs you notice.
 - Please create Pull Requests if you think it would be an added value towards our program.

## Liked it ? You can buy a coffee:

<a href="https://www.buymeacoffee.com/aibrahim" target="_blank"><img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" alt="Buy Me A Coffee" style="height: 41px !important;width: 174px !important;box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;-webkit-box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;" ></a>

Thank you,

Email: me@ahmed-ibrahim.com

https://www.ahmed-ibrahim.com
