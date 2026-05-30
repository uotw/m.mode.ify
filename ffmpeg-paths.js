// ffmpeg-paths.js
// Cross-platform ffmpeg/ffprobe binary paths from the `ffmpeg-static` and
// `ffprobe-static` npm packages (macOS arm64/x64 and Windows x64). This
// replaces the old hand-bundled node_modules/ffmpeg/{ffmpeg,ffprobe} binaries
// (which were macOS-only). Existing spawn()/spawnSync() calls just consume
// these resolved paths — no other code changes needed.

// In a packaged (asar) build the static binaries are unpacked next to app.asar;
// rewrite the path so the spawned process points at the real file on disk.
// In dev / asar:false builds the path has no "app.asar" segment, so it's a no-op.
function unpacked(p) {
  return typeof p === 'string' ? p.replace('app.asar', 'app.asar.unpacked') : p;
}

// ffmpeg-static exports the binary path as a string; ffprobe-static exports { path }.
const ffmpegPath = unpacked(require('ffmpeg-static'));
const ffprobePath = unpacked(require('ffprobe-static').path);

module.exports = { ffmpegPath, ffprobePath };
