# Changelog

All notable changes to this project are documented here.

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
