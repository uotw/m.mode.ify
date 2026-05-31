// mmode-magick.worker.js
// Runs the @imagemagick/magick-wasm pipeline on a Web Worker thread (with Node
// APIs via nodeIntegrationInWorker) so the renderer's main thread stays free —
// the m-mode builds without stalling the UI/CSS animations while each frame's
// column is distorted and cropped. (worker_threads can't be constructed from an
// Electron renderer, so this uses an HTML5 Web Worker that still has require/fs.)
//
// This file holds the actual ImageMagick (WASM) implementation; mmode-magick.js
// is a thin proxy that posts {id, fn, args} messages here and resolves the
// matching Promise from the {id, ok, result|error} reply. Only file paths and
// scalars cross the thread boundary — every fs read/write happens in here, so
// no image buffers are copied between threads.
//
// Algorithm (unchanged from the original ImageMagick scripts):
//   • Rotate each frame around the line's start point (X1,Y1) by the line's
//     angle, with black virtual pixels, using best-fit SRT distortion — this
//     makes the user-drawn line vertical. The page X offset after best-fit is
//     the old `-format %X` value.
//   • Crop the 3px-wide column at the rotated line position.
//   • Horizontally append every frame's column → the m-mode strip.
//   • Stack the labeled "poster" still under it and trim.

const fs = require('fs');
const path = require('path');
const {
  initializeImageMagick, ImageMagick, MagickImage, MagickImageCollection,
  MagickFormat, DistortMethod, DistortSettings, VirtualPixelMethod,
  MagickGeometry, MagickColors, Percentage, CompositeOperator,
  DrawableLine, DrawableStrokeColor, DrawableStrokeWidth
} = require('@imagemagick/magick-wasm');

let _ready = null;
function ready() {
  if (!_ready) {
    const wasmPath = path.join(path.dirname(require.resolve('@imagemagick/magick-wasm')), 'magick.wasm');
    _ready = initializeImageMagick(fs.readFileSync(wasmPath));
  }
  return _ready;
}

// Line angle in degrees — matches the scripts' awk: 180*atan2(X2-X1,Y2-Y1)/PI.
function angleDeg(x1, y1, x2, y2) {
  return 180 * Math.atan2(x2 - x1, y2 - y1) / Math.PI;
}

const readBytes = (p) => new Uint8Array(fs.readFileSync(p));
const srtSettings = () => {
  const ds = new DistortSettings(DistortMethod.ScaleRotateTranslate);
  ds.bestFit = true;
  return ds;
};

// OFFSET = page X offset after best-fit SRT distort (the old `-format "%X"`).
async function getOffset(stillPath, x1, y1, x2, y2) {
  await ready();
  const angle = angleDeg(x1, y1, x2, y2);
  let offset = 0;
  ImageMagick.read(readBytes(stillPath), (img) => {
    img.virtualPixelMethod = VirtualPixelMethod.Black;
    img.distort(srtSettings(), [x1, y1, angle]);
    offset = img.page.x;
  });
  return { offset, angle };
}

// Distort one frame so the line is vertical, then crop the 3px column at it.
// newxloc = X1 - OFFSET - 1 (matches NEWXLOC in mmodeify.sh).
async function extractColumn(stillPath, outPath, x1, y1, angle, newxloc) {
  await ready();
  ImageMagick.read(readBytes(stillPath), (img) => {
    img.virtualPixelMethod = VirtualPixelMethod.Black;
    img.distort(srtSettings(), [x1, y1, angle]);
    // best-fit distort leaves a virtual-canvas page offset, and crop() is
    // page-aware — so reset the page FIRST, making the crop use raw pixels.
    // newxloc (= X1 - pageX - 1) is exactly the now-vertical line in raw pixels;
    // cropping before the reset double-counts the offset and (for steeper lines)
    // lands in the black margin → an all-black column.
    if (img.resetPage) img.resetPage();
    img.crop(new MagickGeometry(newxloc, 0, 3, img.height));
    if (img.resetPage) img.resetPage();
    img.write(MagickFormat.Png, (d) => fs.writeFileSync(outPath, d));
  });
}

// Draw the white line on the first still → full-size "posterbig", plus a
// width-resized "poster" for the on-screen reference (poster.sh).
async function drawPoster(stillPath, x1, y1, x2, y2, bigPath, smallPath, smallWidth) {
  await ready();
  ImageMagick.read(readBytes(stillPath), (img) => {
    img.draw([
      new DrawableStrokeColor(MagickColors.White),
      new DrawableStrokeWidth(3),
      new DrawableLine(x1, y1, x2, y2)
    ]);
    img.write(MagickFormat.Png, (d) => fs.writeFileSync(bigPath, d));
    img.resize(new MagickGeometry(String(smallWidth) + 'x'));
    img.write(MagickFormat.Png, (d) => fs.writeFileSync(smallPath, d));
  });
}

// `+append` all the column PNGs into the m-mode strip (concat.sh, first convert).
async function appendColumns(columnPaths, outPath) {
  await ready();
  const coll = MagickImageCollection.create();
  for (const p of columnPaths) {
    const im = MagickImage.create();
    im.read(readBytes(p));
    coll.push(im);
  }
  coll.appendHorizontally((res) => {
    res.write(MagickFormat.Png, (d) => fs.writeFileSync(outPath, d));
  });
  coll.dispose();
}

// Stack the poster under the m-mode strip and trim (concat.sh, second convert).
async function appendPosterAndTrim(mmodePath, posterPath, outPath) {
  await ready();
  const coll = MagickImageCollection.create();
  const top = MagickImage.create(); top.read(readBytes(mmodePath)); coll.push(top);
  const bot = MagickImage.create(); bot.read(readBytes(posterPath)); coll.push(bot);
  coll.appendVertically((res) => {
    res.backgroundColor = MagickColors.Black;
    res.colorFuzz = new Percentage(10);
    res.trim();
    if (res.resetPage) res.resetPage();
    res.write(MagickFormat.Png, (d) => fs.writeFileSync(outPath, d));
  });
  coll.dispose();
}

// Crop a rectangle out of an image (replaces `magick convert -crop WxH+X+Y`).
async function cropImage(inPath, outPath, x, y, w, h) {
  await ready();
  ImageMagick.read(readBytes(inPath), (img) => {
    img.crop(new MagickGeometry(Math.round(x), Math.round(y), Math.round(w), Math.round(h)));
    if (img.resetPage) img.resetPage();
    img.write(MagickFormat.Png, (d) => fs.writeFileSync(outPath, d));
  });
}

// Flatten a transparent overlay (the measurement-annotation canvas, exported
// as PNG) over the base m-mode image at 0,0. Both are the same pixel size, so
// no scaling/positioning is needed — this replaces the old window-screenshot
// hack that captured the on-screen overlay via desktopCapturer.
async function compositeOver(basePath, overlayPath, outPath) {
  await ready();
  ImageMagick.read(readBytes(basePath), (img) => {
    const ov = MagickImage.create();
    ov.read(readBytes(overlayPath));
    // The overlay is drawn in on-screen (display) pixel space, which may be a
    // capped/scaled version of the native strip. Match the base to the overlay
    // so annotations land exactly where the user drew them.
    if (img.width !== ov.width || img.height !== ov.height) {
      const g = new MagickGeometry(ov.width, ov.height);
      g.ignoreAspectRatio = true;
      img.resize(g);
    }
    img.composite(ov, CompositeOperator.Over);
    ov.dispose();
    if (img.resetPage) img.resetPage();
    img.write(MagickFormat.Png, (d) => fs.writeFileSync(outPath, d));
  });
}

// width:height of an image (replaces `magick convert -ping -format %w:%h`).
async function getDimensions(p) {
  await ready();
  let dim = { w: 0, h: 0 };
  ImageMagick.read(readBytes(p), (img) => { dim = { w: img.width, h: img.height }; });
  return dim;
}

// Functions the proxy can invoke by name. `warmup` lets the renderer kick off
// the one-time WASM init (a few hundred ms) early — e.g. while ffmpeg is still
// extracting stills — so the first real column op isn't stalled by it.
const handlers = {
  warmup: () => ready(),
  getOffset, extractColumn, drawPoster, appendColumns,
  appendPosterAndTrim, cropImage, compositeOver, getDimensions
};

self.onmessage = async (event) => {
  const { id, fn, args } = event.data;
  const handler = handlers[fn];
  if (!handler) {
    self.postMessage({ id, ok: false, error: 'unknown mmode-magick function: ' + fn });
    return;
  }
  try {
    const result = await handler.apply(null, args || []);
    self.postMessage({ id, ok: true, result });
  } catch (e) {
    self.postMessage({ id, ok: false, error: (e && e.message) ? e.message : String(e) });
  }
};
