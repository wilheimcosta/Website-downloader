# Changelog

All notable changes to this project are documented here.

## [0.2.0] - 2026-11-18

Dependency and security refresh: `npm install` now finishes without deprecation
warnings and `npm audit` reports **0 vulnerabilities** (previously 24).

### Changed

- Upgraded Express to 4.22.3, Socket.IO to 4.8.4, Morgan to 1.12.1,
  cookie-parser to 1.4.7, debug to 4.4.3 and http-errors to 2.0.1.
- Socket.IO 4 is served automatically to the page; the existing `io.connect`,
  `socket.emit` and `socket.on` usage is unchanged.
- Replaced `archiver` (and its deprecated `glob`/`inflight` chain) with the
  streaming `yazl` writer in `lib/zip.js`. Archives keep the same layout and a
  failed zip still gets removed.
- Replaced the unmaintained `hbs`/Handlebars view layer with EJS
  (`views/*.ejs` plus `views/partials/`). Output is escaped by default and the
  error page no longer needs a Handlebars-specific layout.
- Dropped 96 transitive packages: a clean install is now 98 packages instead of
  194.
- Node.js 18 or newer is required.

### Fixed

- A failed compression no longer leaves an empty/truncated zip behind: the
  partial file is deleted after the output stream closes, avoiding the race
  where the stream could recreate it.

## [0.1.0] - 2026-11-18

### Security

- Block `localhost`, private, loopback, link-local and cloud-metadata targets by
  default as a basic SSRF guard. Operators can opt out with
  `ALLOW_PRIVATE_TARGETS=1`.
- Reject non-HTTP(S) schemes, embedded credentials and oversized addresses
  before they reach `wget`.
- Validate the Socket.IO token used as the per-visitor event name.
- Cap concurrent downloads with `MAX_CONCURRENT_DOWNLOADS` (default `5`).
- Validate archive filenames so a crafted hostname cannot escape
  `public/sites/`.
- Stop advertising the framework with `X-Powered-By`.

### Added

- `lib/target.js`: URL parsing, private-network detection and failure-message
  selection, free of I/O so it can be unit tested.
- `lib/paths.js`: shared `downloads/` and `public/sites/` paths plus TTL cleanup
  for abandoned mirrors (`JOB_TTL_MS`) and expired archives (`ARCHIVE_TTL_MS`).
- `test/target.test.js` and `npm test` (Node's built-in `assert`, no test
  framework).
- Startup check that warns when `wget` is missing, and a clear "listening on"
  log line.
- README sections for local execution, configuration, project layout and
  troubleshooting.

### Changed

- `wget` is invoked with explicit long flags instead of `-mkEpnp`, plus
  `--timeout=20` and `--tries=2` so a broken host cannot hold a request for
  hours.
- Download timeout and cancellation now escalate from `SIGTERM` to `SIGKILL`
  after a grace period.
- Successful archives are still written to `public/sites/`, but the job
  directory is always removed and stale files are swept at startup and every
  30 minutes.
- The page tracks download state explicitly: the button is disabled while a job
  runs, the archive link is only offered on success, and a lost connection is
  reported.
- File counting now handles several `200 OK` lines in one progress chunk.
- `npm run dev` sets `NODE_ENV=development` (the previous `Development` did not
  match Express).
- `npm test` added to `package.json`; Node `>=16` declared in `engines`.

### Fixed

- A failed compression no longer leaves a truncated zip that the page would
  serve as a valid download.
- The frontend no longer relies on `localStorage` always being available and
  generates its token with `crypto.getRandomValues`.
- Invalid or rejected requests always re-enable the form instead of leaving the
  button stuck.

### Removed

- Unused `jszip` and direct `socket.io-client` dependencies.
- The boilerplate `/users` route.
- The accidentally committed `public/sites/localhost.zip` test artifact.
