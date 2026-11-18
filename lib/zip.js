'use strict';

var fs = require('fs');
var path = require('path');
var yazl = require('yazl');

var paths = require('./paths');

// Only the names we generate ourselves are accepted, so a crafted hostname can
// never steer the output outside public/sites.
var ZIP_NAME_RE = /^[A-Za-z0-9._-]{1,120}$/;

/**
 * Zips sourceDir into public/sites/<zipName>.zip and reports the outcome
 * through the callback.
 *
 * yazl streams the zip instead of building it in memory, so a large mirror does
 * not block the event loop or exhaust RAM. Failures are passed back to the
 * caller instead of thrown from a stream handler.
 */
module.exports = function createZip(sourceDir, zipName, callback) {
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

  var zipPath = path.join(paths.SITES_DIR, name + '.zip');
  var output = fs.createWriteStream(zipPath);
  var zip = new yazl.ZipFile();
  var settled = false;

  var finish = function (err) {
    if (settled) return;
    settled = true;

    if (err) {
      // Do not leave a truncated zip behind: the page would offer it as a
      // valid download. The stream may still be opening, so wait for it to
      // close before unlinking, otherwise it would recreate the empty file.
      var removePartial = function () {
        fs.promises.unlink(zipPath).catch(function (unlinkError) {
          if (unlinkError.code !== 'ENOENT') {
            console.error('Could not remove partial archive ' + zipPath + ': ' + unlinkError.message);
          }
        });
      };

      if (output.closed) {
        removePartial();
      } else {
        output.once('close', removePartial);
        output.destroy();
      }
    }

    done(err, name);
  };

  // 'close' is the point at which the file descriptor is closed, so the zip is
  // completely on disk.
  output.on('close', function () {
    if (settled) return;
    console.log(output.bytesWritten + ' bytes written to ' + zipPath);
    finish(null);
  });

  output.on('error', finish);
  zip.outputStream.on('error', finish);
  zip.outputStream.pipe(output);

  try {
    addDirectory(zip, sourceDir, '');
    zip.end();
  } catch (err) {
    finish(err);
    return null;
  }

  return zip;
};

/**
 * Adds every regular file below directory to the zip, keeping the tree shape.
 * Symbolic links and special files are skipped: a link in the downloaded site
 * must never pull in something outside the job directory.
 */
function addDirectory(zip, directory, prefix) {
  var entries = fs.readdirSync(directory, { withFileTypes: true });

  if (entries.length === 0 && prefix) {
    zip.addEmptyDirectory(prefix);
    return;
  }

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var name = prefix ? prefix + '/' + entry.name : entry.name;
    var full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      addDirectory(zip, full, name);
    } else if (entry.isFile()) {
      var stats = fs.statSync(full);
      var options = {};

      // yazl rejects dates before 1980, which some tarballs still contain.
      if (stats.mtime && stats.mtime.getFullYear() >= 1980) {
        options.mtime = stats.mtime;
      }

      zip.addFile(full, name, options);
    }
  }
}
