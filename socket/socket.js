'use strict';

var wget = require('../wget');

// The token is chosen by the browser and used as the event name for that
// visitor's updates. Bounding it keeps a client from registering an unbounded
// event name and matches what the page generates (20 alphanumeric characters).
var TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;

// Each download can occupy a wget process and disk space, so cap how many run
// at once. Override with MAX_CONCURRENT_DOWNLOADS when the host can take more.
var MAX_CONCURRENT = Math.max(1, Number(process.env.MAX_CONCURRENT_DOWNLOADS) || 5);

module.exports = function attachSocketHandlers(io) {
  var active = 0;

  io.on('connection', function (socket) {
    socket.on('request', function (data) {
      if (!data || typeof data.token !== 'string' || !TOKEN_RE.test(data.token)) {
        return;
      }

      var send = function (payload) {
        socket.emit(data.token, payload);
      };

      if (socket.job) {
        send({ error: 'A download is already running on this connection.' });
        return;
      }

      if (active >= MAX_CONCURRENT) {
        send({ error: 'The server is handling too many downloads right now. Please try again in a moment.' });
        return;
      }

      console.log('Download requested');

      active++;
      var finished = false;
      var finish = function () {
        if (finished) return;
        finished = true;
        active--;
        socket.job = null;
      };

      socket.job = wget(socket, data, finish);
      // wget() calls finish() itself when it rejects a request before starting;
      // this only guards the path where no handle is returned unexpectedly.
      if (!socket.job) finish();
    });

    socket.on('disconnect', function () {
      console.log('User disconnected');
      // Stop wget and remove partially downloaded files; the job's finish
      // callback then releases the concurrency slot.
      if (socket.job) {
        socket.job.cancel();
        socket.job = null;
      }
    });
  });
};
