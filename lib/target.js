'use strict';

/**
 * Everything that turns the address typed by a visitor into something safe to
 * hand to wget. Kept free of I/O so it can be unit tested without spawning
 * processes or touching the filesystem.
 */

// Long enough for any real address, short enough that a paste bomb cannot
// become a megabyte-long process argument.
var MAX_INPUT_LENGTH = 2048;
var SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
var CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

/**
 * Returns a URL only when the input is a real http(s) address.
 *
 * A missing scheme is treated as http, but a scheme that is present is never
 * replaced: prefixing "file:///etc/passwd" would otherwise turn it into a
 * request for a host called "file" instead of rejecting it.
 */
function parseTarget(input) {
  if (typeof input !== 'string') return null;

  var raw = input.trim();
  if (!raw || raw.length > MAX_INPUT_LENGTH) return null;
  if (CONTROL_CHARS_RE.test(raw)) return null;

  var url;
  try {
    url = new URL(SCHEME_RE.test(raw) ? raw : 'http://' + raw);
  } catch (err) {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname) return null;
  // Credentials would be echoed back in logs and error messages and are not
  // needed for a public site download.
  if (url.username || url.password) return null;

  return url;
}

// Hostnames that always mean "this machine" or a cloud metadata endpoint.
var BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'instance-data'
]);

/**
 * Explains why a host must not be downloaded from, or returns null when it is
 * an ordinary public address.
 *
 * The app is meant to mirror public websites. Without this check anyone could
 * use it to fetch cloud metadata (169.254.169.254) or to scan the network the
 * server runs in. Operators who really do need an intranet target can set
 * ALLOW_PRIVATE_TARGETS=1.
 */
function privateHostReason(hostname) {
  if (typeof hostname !== 'string' || !hostname.trim()) {
    return 'the address has no host name';
  }

  var host = hostname.trim().toLowerCase()
    .replace(/^\[|\]$/g, '') // new URL() keeps the brackets around IPv6
    .replace(/\.$/, '');     // "localhost." resolves to localhost

  if (!host) return 'the address has no host name';

  if (BLOCKED_HOSTNAMES.has(host) ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal')) {
    return 'it points back at this machine or a private network';
  }

  if (host.indexOf(':') !== -1) {
    return isPrivateIPv6(host) ? 'it is a private or loopback IPv6 address' : null;
  }

  var octets = parseIPv4(host);
  if (octets) {
    return isPrivateIPv4(octets) ? 'it is a private or loopback IPv4 address' : null;
  }

  return null;
}

function parseIPv4(host) {
  var parts = host.split('.');
  if (parts.length !== 4) return null;

  var octets = [];
  for (var i = 0; i < parts.length; i++) {
    // Only dotted decimal here: the WHATWG URL parser has already normalised
    // the exotic forms (0x7f.1, 2130706433, 127.1) before we see a hostname.
    if (!/^\d{1,3}$/.test(parts[i])) return null;
    var value = Number(parts[i]);
    if (value > 255) return null;
    octets.push(value);
  }
  return octets;
}

function isPrivateIPv4(octets) {
  var a = octets[0];
  var b = octets[1];

  if (a === 0 || a === 10 || a === 127) return true;      // "this" network, private, loopback
  if (a === 169 && b === 254) return true;                // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;       // 172.16.0.0/12
  if (a === 192 && b === 168) return true;                // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true;      // carrier-grade NAT
  if (a === 192 && b === 0 && octets[2] === 0) return true; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true;   // benchmarking
  if (a >= 224) return true;                              // multicast and reserved

  return false;
}

function isPrivateIPv6(host) {
  if (host === '::' || host === '::1') return true;
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;        // fc00::/7 unique local
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true;        // fe80::/10 link-local

  // IPv4-mapped addresses (::ffff:127.0.0.1) must follow the IPv4 rules.
  var mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host);
  if (mapped) {
    var octets = parseIPv4(mapped[1]);
    return octets ? isPrivateIPv4(octets) : false;
  }

  return false;
}

/**
 * wget's closing lines are usually a summary, so the last line is rarely the
 * reason anything failed. Prefer the last line that actually looks like one.
 */
function explainFailure(lines, exitCode) {
  var interesting = /failed|unable|refused|denied|ERROR \d|error \d|robots|No such|not found|forbidden|timed out|giving up|Unsupported scheme/i;

  for (var i = lines.length - 1; i >= 0; i--) {
    var line = String(lines[i]).trim();
    if (line && interesting.test(line)) return line;
  }

  if (exitCode === 8) {
    return 'The server refused the request (it may block automated downloads).';
  }
  if (exitCode === null || exitCode === undefined) {
    return 'wget was stopped before it saved anything.';
  }

  return 'wget exited with code ' + exitCode + ' without saving any files.';
}

module.exports = {
  MAX_INPUT_LENGTH: MAX_INPUT_LENGTH,
  parseTarget: parseTarget,
  privateHostReason: privateHostReason,
  explainFailure: explainFailure
};
