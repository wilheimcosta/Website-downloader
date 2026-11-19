'use strict';

var execFile = require('child_process').execFile;
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var archive = require('../lib/zip');
var paths = require('../lib/paths');
var target = require('../lib/target');

// wget mirrors recursively, so without a ceiling a single request can fill the
// disk. Both limits can be raised through the environment.
var QUOTA = process.env.DOWNLOAD_QUOTA || '100m';
var TIMEOUT_MS = Number(process.env.DOWNLOAD_TIMEOUT_MS) || 5 * 60 * 1000;
var KILL_GRACE_MS = 5000;

var ALLOW_PRIVATE_TARGETS = /^(1|true|yes|on)$/i.test(process.env.ALLOW_PRIVATE_TARGETS || '');

// Long options, one per argument, so the command in the logs can be read
// without decoding a combined switch such as -mkEpnp.
var WGET_OPTIONS = [
  // --mirror: recursive download with timestamps.
  '--mirror',
  // --convert-links: rewrite links so the copy opens offline.
  '--convert-links',
  // --adjust-extension: add .html/.css based on the content type.
  '--adjust-extension',
  // --page-requisites: fetch the CSS, scripts and images a page needs.
  '--page-requisites',
  // --no-parent: never ascend above the requested directory.
  '--no-parent',
  '--no-if-modified-since',
  // The defaults (20 retries, no timeout) can sit on a broken host for hours.
  '--timeout=20',
  '--tries=2'
];

/**
 * Downloads data.website into a private directory and, when it worked, zips it
 * into public/sites.
 *
 * Returns a handle with cancel(), or null when the request was rejected before
 * a process was started. onFinished is called exactly once, after the job
 * directory is gone.
 */
module.exports = function startDownload(socket, data, onFinished) {
  var done = typeof onFinished === 'function' ? onFinished : function () {};
  var token = data && typeof data.token === 'string' ? data.token : '';

  var send = function (payload) {
    // The visitor may have closed the tab while wget was running.
    if (!token || socket.connected === false) return;
    socket.emit(token, payload);
  };

  var parsed = target.parseTarget(data && data.website);
  if (!parsed) {
    send({ error: 'That does not look like a website address. Try something like https://example.com' });
    done();
    return null;
  }

  if (!ALLOW_PRIVATE_TARGETS) {
    var blocked = target.privateHostReason(parsed.hostname);
    if (blocked) {
      send({
        error: 'For safety this server only downloads from public websites, and ' +
          parsed.hostname + ' is not one of them (' + blocked + ').'
      });
      done();
      return null;
    }
  }

  var jobId = crypto.randomBytes(8).toString('hex');
  var jobDir = path.join(paths.DOWNLOAD_ROOT, jobId);

  try {
    fs.mkdirSync(jobDir, { recursive: true });
  } catch (err) {
    send({ error: 'Could not create a working directory on the server: ' + err.message });
    done();
    return null;
  }

  // execFile rather than exec: the address is passed as a separate argument and
  // never reaches a shell, so it cannot be used to run other commands.
  var child = execFile('wget', WGET_OPTIONS.concat('--quota=' + QUOTA, parsed.href), {
    cwd: jobDir,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true
  });

  var settled = false;
  var cancelled = false;
  var timedOut = false;
  var stderrTail = [];
  var killTimer = null;

  var stopProcess = function () {
    if (!child.killed) child.kill('SIGTERM');
    if (!killTimer) {
      // A wedged wget may ignore SIGTERM; do not wait forever.
      killTimer = setTimeout(function () {
        child.kill('SIGKILL');
      }, KILL_GRACE_MS);
      killTimer.unref();
    }
  };

  var timer = setTimeout(function () {
    timedOut = true;
    stopProcess();
  }, TIMEOUT_MS);
  timer.unref();

  var stopTimers = function () {
    clearTimeout(timer);
    if (killTimer) clearTimeout(killTimer);
  };

  var fail = function (message) {
    if (settled) return;
    settled = true;
    stopTimers();
    removeJobDir(jobDir);
    send({ error: message });
    done();
  };

  // Fires when wget itself cannot be started, which on a fresh machine almost
  // always means it is not installed.
  child.on('error', function (err) {
    if (err.code === 'ENOENT') {
      fail('wget is not installed on the server. Install it and restart the app: ' +
        'apt install wget, brew install wget, or winget install JernejSimoncic.Wget');
      return;
    }
    if (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      fail('wget produced too much output for this server to track. Try a smaller site.');
      return;
    }
    fail('Could not start the download: ' + err.message);
  });

  child.stderr.on('data', function (chunk) {
    var text = chunk.toString();
    stderrTail = stderrTail.concat(text.split('\n')).slice(-60);
    send({ progress: text });
  });

  child.on('close', function (code) {
    stopTimers();
    if (settled) return;

    if (cancelled) {
      settled = true;
      removeJobDir(jobDir);
      done();
      return;
    }

    if (timedOut) {
      fail('The download took longer than ' + Math.round(TIMEOUT_MS / 1000) +
        ' seconds and was stopped. Try a smaller site or a specific page.');
      return;
    }

    // Trust the filesystem rather than wget's output. wget writes nothing at
    // all for an off-site redirect, a robots.txt exclusion or a 403.
    if (countFiles(jobDir) === 0) {
      fail('Nothing could be downloaded from ' + parsed.hostname + '. ' +
        target.explainFailure(stderrTail, code));
      return;
    }

    settled = true;
    send({ progress: 'Converting' });

    var zipName = safeName(parsed.hostname) + '-' + jobId;
    archive(jobDir, zipName, function (err, name) {
      removeJobDir(jobDir);
      if (err) {
        send({ error: 'The site downloaded but could not be compressed: ' + err.message });
      } else {
        send({ progress: 'Completed', file: name });
      }
      done();
    });
  });

  return {
    cancel: function () {
      if (settled) return;
      cancelled = true;
      stopProcess();
    }
  };
};

/**
 * Hostnames can contain characters that are awkward in a filename (IPv6
 * brackets, for example), so keep only a conservative subset.
 */
function safeName(hostname) {
  var name = String(hostname || '').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^[._-]+/, '');
  return (name || 'site').slice(0, 80);
}

function countFiles(directory) {
  var total = 0;
  var entries;

  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (err) {
    return 0;
  }

  for (var i = 0; i < entries.length; i++) {
    if (entries[i].isDirectory()) {
      total += countFiles(path.join(directory, entries[i].name));
    } else {
      total++;
    }
  }

  return total;
}

/**
 * Deletes a single job directory. The guard matters: joining an empty string
 * onto the app root would recursively delete the whole application.
 */
function removeJobDir(directory) {
  var resolved = path.resolve(directory);
  var root = path.resolve(paths.DOWNLOAD_ROOT);

  if (resolved === root || !resolved.startsWith(root + path.sep)) {
    console.error('Refusing to delete a path outside the downloads folder: ' + resolved);
    return;
  }

  fs.rm(resolved, { recursive: true, force: true }, function (err) {
    if (err) console.error('Could not clean up ' + resolved + ': ' + err.message);
  });
}
