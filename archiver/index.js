'use strict';

var archiver = require('archiver');
var fs = require('fs');
var path = require('path');

var paths = require('../lib/paths');

// Only the names we generate ourselves are accepted, so a crafted hostname can
// never steer the output outside public/sites.
var ZIP_NAME_RE = /^[A-Za-z0-9._-]{1,120}$/;

/**
 * Zips sourceDir into public/sites/<zipName>.zip and reports the outcome
 * through the callback.
 *
 * Failures are passed back to the caller instead of thrown from an event
 * handler: an unhandled stream error used to take the whole server down.
 */
module.exports = function createArchive(sourceDir, zipName, callback) {
  var done = typeof callback === 'function' ? callback : function () {};
  var name = String(zipName || '');

  if (!ZIP_NAME_RE.test(name)) {
    process.nextTick(function () {
      done(new Error('Invalid archive name: ' + JSON.stringify(zipName)), name);
    });
    return null;
  }

  try {
    fs.mkdirSync(paths.SITES_DIR, { recursive: true });
  } catch (err) {
    process.nextTick(function () {
      done(err, name);
    });
    return null;
  }

  var settled = false;
  var zipPath = path.join(paths.SITES_DIR, name + '.zip');
  var output = fs.createWriteStream(zipPath);
  var archive = archiver('zip', {
    zlib: { level: 9 }
  });

  var finish = function (err) {
    if (settled) return;
    settled = true;

    if (err) {
      // Do not leave a truncated zip behind: the page would offer it as a
      // valid download.
      try {
        archive.abort();
      } catch (abortError) {
        // The archive may already be finished or destroyed.
      }
      output.destroy();
      fs.promises.unlink(zipPath).catch(function (unlinkError) {
        if (unlinkError.code !== 'ENOENT') {
          console.error('Could not remove partial archive ' + zipPath + ': ' + unlinkError.message);
        }
      });
    }

    done(err, name);
  };

  // 'close' is fired only when a file descriptor is involved, so it is the
  // point at which the zip is completely on disk.
  output.on('close', function () {
    console.log(archive.pointer() + ' total bytes written to ' + zipPath);
    finish(null);
  });

  output.on('error', function (err) {
    finish(err);
  });

  archive.on('warning', function (err) {
    if (err.code === 'ENOENT') {
      console.warn('archive warning: ' + err.message);
      return;
    }
    finish(err);
  });

  archive.on('error', function (err) {
    finish(err);
  });

  archive.pipe(output);

  // Without an extra top-level folder: the zip contains the site as-is.
  archive.directory(sourceDir, false);

  try {
    archive.finalize();
  } catch (err) {
    finish(err);
    return null;
  }

  return archive;
};
