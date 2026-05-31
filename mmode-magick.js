// mmode-magick.js
// Thin proxy to the magick-wasm pipeline, which runs on a Web Worker thread
// (mmode-magick.worker.js, with Node APIs via nodeIntegrationInWorker). Keeping
// ImageMagick off the renderer's main thread means the m-mode strip can build —
// one distorted/cropped column per frame — without stalling the UI or the
// per-slice CSS animations.
//
// Each call posts {id, fn, args} to the worker and returns a Promise that
// resolves with the worker's {id, ok, result|error} reply. Only file paths and
// scalars cross the boundary; the worker does its own fs reads/writes, so no
// image data is copied between threads. The public API matches the old
// in-process module 1:1, so renderer.js is unchanged apart from this hop.

let worker = null;
let seq = 0;
const pending = new Map();

function rejectAll(err) {
  for (const p of pending.values()) p.reject(err);
  pending.clear();
}

function getWorker() {
  if (!worker) {
    // Resolved relative to the document URL (index.html), which sits next to
    // this file — so the worker loads from the same directory.
    worker = new Worker('mmode-magick.worker.js');
    worker.onmessage = (event) => {
      const msg = event.data;
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error));
    };
    worker.onerror = (event) => {
      rejectAll(new Error(event.message || 'mmode-magick worker error'));
    };
  }
  return worker;
}

function call(fn, args) {
  const w = getWorker();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, fn, args });
  });
}

module.exports = {
  // Pure math — no need to round-trip to the worker.
  angleDeg: (x1, y1, x2, y2) => 180 * Math.atan2(x2 - x1, y2 - y1) / Math.PI,
  // Optional: spins up the worker and runs the one-time WASM init ahead of the
  // first real op (e.g. call it while ffmpeg is still extracting stills).
  warmup: () => call('warmup', []),
  getOffset: (...a) => call('getOffset', a),
  extractColumn: (...a) => call('extractColumn', a),
  drawPoster: (...a) => call('drawPoster', a),
  appendColumns: (...a) => call('appendColumns', a),
  appendPosterAndTrim: (...a) => call('appendPosterAndTrim', a),
  cropImage: (...a) => call('cropImage', a),
  compositeOver: (...a) => call('compositeOver', a),
  getDimensions: (...a) => call('getDimensions', a)
};
