// mmode-ffmpeg.js
// Builds the entire M-mode strip in ONE native ffmpeg pass — rotate each frame
// so the user's line is vertical, crop the 3px column at it, and tile the
// columns left-to-right. This replaces the per-frame WASM rotate/crop loop and
// is ~200x faster for a typical clip (the strip then gets trimmed + the poster
// appended by magick-wasm, which are cheap one-shots).
const { spawn } = require('child_process');

// Where the (now-vertical) line lands after ffmpeg's center rotation, in the
// square output canvas — derived analytically (verified to match the magick
// page-offset to within a pixel). ow=oh=hypot so no content is ever clipped.
function buildStrip(ffmpegPath, stillsPattern, start, count, W, H, x1, y1, angleDeg, outPath) {
  return new Promise((resolve, reject) => {
    const theta = angleDeg * Math.PI / 180;            // same sign as the magick SRT angle
    const OW = Math.ceil(Math.hypot(W, H));
    let xcol = Math.round(OW / 2 + (x1 - W / 2) * Math.cos(theta) - (y1 - H / 2) * Math.sin(theta)) - 1;
    xcol = Math.max(0, Math.min(OW - 3, xcol));
    const vf = `rotate=${theta}:c=black:ow=${OW}:oh=${OW},crop=3:${OW}:${xcol}:0,tile=${count}x1`;
    const args = ['-y', '-framerate', '24', '-start_number', String(start), '-i', stillsPattern,
                  '-vf', vf, '-frames:v', '1', outPath];
    const child = spawn(ffmpegPath, args, { windowsVerbatimArguments: true });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) { resolve(xcol); }
      else { reject(new Error('ffmpeg strip failed (code ' + code + '): ' + String(err).split('\n').slice(-3).join(' '))); }
    });
  });
}

module.exports = { buildStrip };
