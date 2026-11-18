'use strict';

var fs = require('fs');
var path = require('path');

/**
 * The only two places this app writes to. Keeping them here means the download
 * code, the archiver and the cleanup job can never disagree about paths.
 */
var ROOT = path.join(__dirname, '..');
var DOWNLOAD_ROOT = path.join(ROOT, 'downloads');
var SITES_DIR = path.join(ROOT, 'public', 'sites');

var HOUR = 60 * 60 * 1000;

function positiveNumber(value, fallback) {
  var number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

// Partial mirrors left behind by a crash or a hard kill. Anything older than an
// hour is not attached to a running download.
var JOB_TTL_MS = positiveNumber(process.env.JOB_TTL_MS, HOUR);

// Generated archives are disposable. Six hours is long enough for a visitor to
// finish downloading and short enough that the disk does not fill up.
var ARCHIVE_TTL_MS = positiveNumber(process.env.ARCHIVE_TTL_MS, 6 * HOUR);

function ensureDirs() {
  fs.mkdirSync(DOWNLOAD_ROOT, { recursive: true });
  fs.mkdirSync(SITES_DIR, { recursive: true });
}

/**
 * Deletes stale job directories and expired archives. Runs at startup and then
 * periodically, so a long-lived server cleans up after itself.
 */
async function sweep(now) {
  var at = typeof now === 'number' ? now : Date.now();

  var jobs = await removeOldEntries(DOWNLOAD_ROOT, at, JOB_TTL_MS);
  var archives = await removeOldEntries(SITES_DIR, at, ARCHIVE_TTL_MS, function (name) {
    return name.endsWith('.zip');
  });

  if (jobs || archives) {
    console.log('Cleanup removed %d stale download(s) and %d expired archive(s).', jobs, archives);
  }

  return { jobs: jobs, archives: archives };
}

async function removeOldEntries(directory, now, maxAgeMs, filter) {
  var removed = 0;
  var entries;

  try {
    entries = await fs.promises.readdir(directory);
  } catch (err) {
    return 0;
  }

  for (var i = 0; i < entries.length; i++) {
    var name = entries[i];
    if (filter && !filter(name)) continue;

    var full = path.join(directory, name);
    try {
      var stats = await fs.promises.stat(full);
      if (now - stats.mtimeMs < maxAgeMs) continue;
      await fs.promises.rm(full, { recursive: true, force: true });
      removed++;
    } catch (err) {
      // A file can disappear between readdir and stat; that is not an error.
      if (err.code !== 'ENOENT') {
        console.warn('Could not remove ' + full + ': ' + err.message);
      }
    }
  }

  return removed;
}

module.exports = {
  DOWNLOAD_ROOT: DOWNLOAD_ROOT,
  SITES_DIR: SITES_DIR,
  JOB_TTL_MS: JOB_TTL_MS,
  ARCHIVE_TTL_MS: ARCHIVE_TTL_MS,
  ensureDirs: ensureDirs,
  sweep: sweep
};
