'use strict';

/**
 * Unit tests for the URL and hostname rules. No test framework is needed:
 * `npm test` runs this file with plain Node and a failing assert fails the run.
 */

var assert = require('assert');
var target = require('../lib/target');

var checks = [];

function check(name, fn) {
  checks.push({ name: name, fn: fn });
}

// --- parseTarget ---------------------------------------------------------

check('assumes http when no scheme is given', function () {
  var url = target.parseTarget('example.com');
  assert.ok(url);
  assert.strictEqual(url.protocol, 'http:');
  assert.strictEqual(url.hostname, 'example.com');
});

check('keeps an explicit https scheme, path and query', function () {
  var url = target.parseTarget('https://example.com/docs?q=1');
  assert.strictEqual(url.href, 'https://example.com/docs?q=1');
});

check('trims surrounding whitespace', function () {
  var url = target.parseTarget('  https://example.com  ');
  assert.strictEqual(url.hostname, 'example.com');
});

check('rejects schemes other than http and https', function () {
  assert.strictEqual(target.parseTarget('file:///etc/passwd'), null);
  assert.strictEqual(target.parseTarget('ftp://example.com'), null);
  assert.strictEqual(target.parseTarget('javascript:alert(1)'), null);
});

check('rejects empty and non-string input', function () {
  assert.strictEqual(target.parseTarget(''), null);
  assert.strictEqual(target.parseTarget('   '), null);
  assert.strictEqual(target.parseTarget(null), null);
  assert.strictEqual(target.parseTarget(42), null);
});

check('rejects embedded credentials', function () {
  assert.strictEqual(target.parseTarget('https://user:secret@example.com'), null);
});

check('rejects control characters and oversized input', function () {
  assert.strictEqual(target.parseTarget('https://example.com/\u0000'), null);
  var huge = 'https://example.com/' + 'a'.repeat(target.MAX_INPUT_LENGTH);
  assert.strictEqual(target.parseTarget(huge), null);
});

check('normalises exotic IPv4 spellings before they can be checked', function () {
  // The WHATWG parser turns these into 127.0.0.1, so the private-host rule sees
  // a dotted address even when the visitor typed something else.
  assert.strictEqual(target.parseTarget('http://2130706433/').hostname, '127.0.0.1');
  assert.strictEqual(target.parseTarget('http://0x7f.1/').hostname, '127.0.0.1');
});

// --- privateHostReason ---------------------------------------------------

var blockedHosts = [
  'localhost', 'LOCALHOST.', 'app.localhost', 'printer.local',
  'metadata.google.internal', 'instance-data',
  '127.0.0.1', '127.9.9.9', '0.0.0.0', '10.1.2.3',
  '172.16.0.1', '172.31.255.255', '192.168.0.1',
  '169.254.169.254', '100.64.0.1', '198.18.0.1',
  '224.0.0.1', '255.255.255.255',
  '::1', '[::1]', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1'
];

blockedHosts.forEach(function (host) {
  check('blocks private host ' + host, function () {
    assert.ok(target.privateHostReason(host), 'expected ' + host + ' to be blocked');
  });
});

var publicHosts = [
  'example.com', 'sub.example.com', 'localhostx.com',
  '8.8.8.8', '172.32.0.1', '100.63.0.1', '192.169.0.1', '169.253.1.1',
  '2606:4700:4700::1111', '[2606:4700:4700::1111]'
];

publicHosts.forEach(function (host) {
  check('allows public host ' + host, function () {
    assert.strictEqual(target.privateHostReason(host), null);
  });
});

check('rejects an empty hostname', function () {
  assert.ok(target.privateHostReason(''));
  assert.ok(target.privateHostReason(undefined));
});

// --- explainFailure ------------------------------------------------------

check('prefers the last line that explains the failure', function () {
  var lines = ['--2024-01-01-- http://example.com/', 'ERROR 403: Forbidden.', 'FINISHED'];
  assert.strictEqual(target.explainFailure(lines, 8), 'ERROR 403: Forbidden.');
});

check('falls back to the exit code', function () {
  assert.match(target.explainFailure(['Saving to: index.html'], 8), /refused the request/i);
  assert.match(target.explainFailure([], 4), /exited with code 4/);
});

// --- runner --------------------------------------------------------------

var failed = 0;

checks.forEach(function (item) {
  try {
    item.fn();
  } catch (err) {
    failed++;
    console.error('not ok - ' + item.name);
    console.error('  ' + err.message);
  }
});

if (failed) {
  console.error('\n' + failed + ' of ' + checks.length + ' checks failed.');
  process.exit(1);
}

console.log('ok - ' + checks.length + ' checks passed.');
