/**
 * Headless visual check for the rendered globe.
 *
 * Headless Firefox does not composite the WebGL surface into `--screenshot`,
 * so this harness serves the built `dist/` with an injected probe that forces
 * `preserveDrawingBuffer`, reads the real canvas and POSTs it back. That
 * produces an actual image of the 3D output plus the real GPU capabilities —
 * which is how the "darker triangles" geometry bug was found and verified.
 *
 * Optionally the probe drives the app to a country and format first, so a
 * finished sequence can be inspected without a browser session.
 *
 * Usage:
 *   DIAG_PORT=8100 DIAG_COUNTRY=Kanada DIAG_FORMAT=landscape \
 *     node scripts/serve-diag.mjs &
 *   LIBGL_ALWAYS_SOFTWARE=1 firefox --headless --no-remote \
 *     --profile /tmp/ffprof --screenshot /tmp/shot.png --window-size=1600,900 \
 *     http://127.0.0.1:8100/diag.html
 *
 * Results land in /tmp/wj-canvas.png and /tmp/wj-probe.json.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const ROOT = 'dist';
const PORT = Number(process.env.DIAG_PORT ?? 8100);
// Holds the page's `load` event open so the app can build its geometry and
// render before Firefox takes the screenshot.
const LOAD_DELAY_MS = Number(process.env.DIAG_LOAD_DELAY ?? 90000);
const PROBE_TIMEOUT_MS = 25000;
// Optional: drive the app to a country and format before capturing.
const DRIVE_COUNTRY = process.env.DIAG_COUNTRY ?? '';
const DRIVE_COUNTRY2 = process.env.DIAG_COUNTRY2 ?? '';
const DRIVE_FORMAT = process.env.DIAG_FORMAT ?? '';
// When a second country is given, capture mid hand-over instead of waiting for
// the second hold, so the transition itself can be inspected.
const DRIVE_MID_DELAY_MS = Number(process.env.DIAG_MID_DELAY ?? 0);
// The animation advances at most 50 ms per frame (the loop clamps dt), so under
// a software rasteriser the sequence takes far longer than its nominal 5.4 s.
// Wait for the hold phase rather than guessing a wall-clock delay.
const DRIVE_HOLD_TIMEOUT_MS = Number(process.env.DIAG_HOLD_TIMEOUT ?? 60000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const SLOW_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const PROBE = `
<script>
(function () {
  var original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') {
      attrs = Object.assign({}, attrs || {}, { preserveDrawingBuffer: true });
    }
    return original.call(this, type, attrs);
  };

  var country = ${JSON.stringify(DRIVE_COUNTRY)};
  var country2 = ${JSON.stringify(DRIVE_COUNTRY2)};
  var format = ${JSON.stringify(DRIVE_FORMAT)};
  var holdTimeoutMs = ${DRIVE_HOLD_TIMEOUT_MS};
  var midDelayMs = ${DRIVE_MID_DELAY_MS};
  var reachedHold = true;
  var reachedHold2 = null;
  var uiMaskVisibleInHold = null;
  var uiMaskVisibleAfterE = null;
  var uiMaskVisibleAfterEAgain = null;
  var uiMaskVisibleDuringFlight = null;
  var maskReturnedAfterMs = null;
  // Control: how late does a plain 1000 ms timer fire in this environment?
  var controlTimerMs = null;
  // Compact log of every phase or mask-visibility change, to check the timing.
  var events = [];
  var sampling = false;
  var startedAtMs = 0;
  var lastPhaseSeen = null;
  var lastHiddenSeen = null;

  function send(payload) {
    fetch('/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function waitForHold() {
    var deadline = Date.now() + holdTimeoutMs;
    while (Date.now() < deadline) {
      var el = document.getElementById('hud-phase');
      if (el && el.textContent && el.textContent.indexOf('Ziel erreicht') === 0) return true;
      await sleep(500);
    }
    return false;
  }

  function maskHidden() {
    var root = document.getElementById('ui');
    return root ? root.classList.contains('ui--hidden') : null;
  }

  function pressKey(key) {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
  }

  function sampleOnce() {
    var ui = document.getElementById('ui');
    var phaseEl = document.getElementById('hud-phase');
    var phase = phaseEl ? phaseEl.textContent : null;
    var hidden = ui ? ui.classList.contains('ui--hidden') : null;
    if (phase !== lastPhaseSeen || hidden !== lastHiddenSeen) {
      events.push({ t: Date.now() - startedAtMs, phase: phase, maskHidden: hidden });
      lastPhaseSeen = phase;
      lastHiddenSeen = hidden;
    }
  }

  async function sampleLoop() {
    while (sampling) {
      sampleOnce();
      await sleep(60);
    }
  }

  async function waitForMaskVisible() {
    var deadline = Date.now() + holdTimeoutMs;
    while (Date.now() < deadline) {
      if (maskHidden() === false) return true;
      await sleep(50);
    }
    return false;
  }

  async function typeCountry(name) {
    var input = document.getElementById('country-input');
    if (!input) return;
    input.value = name;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(200);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }

  async function drive() {
    // The UI only exists after the app finished booting.
    for (var i = 0; i < 40 && !document.getElementById('country-input'); i++) {
      await sleep(250);
    }
    if (format) {
      var button = document.querySelector('[data-format="' + format + '"]');
      if (button) button.click();
      await sleep(300);
    }
    if (!country) return;

    startedAtMs = Date.now();
    sampling = true;
    sampleLoop();
    sampleOnce();

    await typeCountry(country);
    reachedHold = await waitForHold();

    // Control measurement: the software rasteriser keeps the main thread busy,
    // so timers can fire far later than requested. Compare the app's delay
    // against this before blaming the app.
    var controlStart = Date.now();
    setTimeout(function () { controlTimerMs = Date.now() - controlStart; }, 1000);

    // Let the mask come back on its own first, so the delay after the hold can
    // be read from the event log without interference.
    var holdAtMs = Date.now();
    await waitForMaskVisible();
    maskReturnedAfterMs = Date.now() - holdAtMs;

    // While a country is held the mask must be usable again, and E must hide it
    // without touching the scene.
    uiMaskVisibleInHold = maskHidden() === false;
    pressKey('e');
    await sleep(400);
    uiMaskVisibleAfterE = maskHidden() === false;
    pressKey('e');
    await sleep(400);
    uiMaskVisibleAfterEAgain = maskHidden() === false;

    if (!country2) {
      await sleep(500);
      sampling = false;
      sampleOnce();
      return;
    }

    // Second country: the mask must disappear and the previous country must hand
    // over smoothly instead of being cut away.
    await typeCountry(country2);
    uiMaskVisibleDuringFlight = maskHidden() === false;
    if (midDelayMs > 0) {
      // Captured on purpose in the middle of the transition.
      await sleep(midDelayMs);
    } else {
      reachedHold2 = await waitForHold();
      await sleep(500);
    }
    sampling = false;
    sampleOnce();
  }

  async function run(canvas) {
    try {
      await drive();
      var phaseEl = document.getElementById('hud-phase');
      var inputEl = document.getElementById('country-input');
      var gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      var dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
      send({
        depthBits: gl ? gl.getParameter(gl.DEPTH_BITS) : null,
        version: gl ? gl.getParameter(gl.VERSION) : null,
        renderer: gl ? gl.getParameter(gl.RENDERER) : null,
        unmasked: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
        antialias: gl && gl.getContextAttributes() ? gl.getContextAttributes().antialias : null,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        country: country,
        format: format,
        reachedHold: reachedHold,
        reachedHold2: reachedHold2,
        uiMaskVisibleInHold: uiMaskVisibleInHold,
        uiMaskVisibleAfterE: uiMaskVisibleAfterE,
        uiMaskVisibleAfterEAgain: uiMaskVisibleAfterEAgain,
        uiMaskVisibleDuringFlight: uiMaskVisibleDuringFlight,
        maskReturnedAfterMs: maskReturnedAfterMs,
        controlTimerMs: controlTimerMs,
        events: events,
        hudPhase: phaseEl ? phaseEl.textContent : null,
        inputValue: inputEl ? inputEl.value : null,
        dataUrl: canvas.toDataURL('image/png'),
      });
    } catch (e) {
      send({ error: String(e) });
    }
  }

  var startedAt = Date.now();
  function waitForCanvas() {
    var canvas = document.getElementById('scene');
    if (canvas) { run(canvas); return; }
    if (Date.now() - startedAt > ${PROBE_TIMEOUT_MS}) {
      send({ error: 'timeout waiting for #scene' });
      return;
    }
    setTimeout(waitForCanvas, 500);
  }

  waitForCanvas();
})();
</script>
`;

const handler = (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/slow.png') {
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': SLOW_PNG.length });
      res.end(SLOW_PNG);
    }, LOAD_DELAY_MS);
    return;
  }

  if (url.pathname === '/upload' && req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (payload.dataUrl) {
          writeFileSync('/tmp/wj-canvas.png', Buffer.from(payload.dataUrl.split(',')[1], 'base64'));
        }
        const { dataUrl, ...rest } = payload;
        writeFileSync('/tmp/wj-probe.json', JSON.stringify(rest, null, 2));
        console.log('probe:', JSON.stringify(rest));
        res.writeHead(200);
        res.end('ok');
      } catch (e) {
        console.log('probe error:', String(e));
        res.writeHead(500);
        res.end('error');
      }
    });
    return;
  }

  if (url.pathname === '/diag.html') {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8').replace(
      '<head>',
      `<head>\n    <img src="/slow.png" alt="" style="position:fixed;left:-4px;top:-4px;width:1px;height:1px" />\n${PROBE}`,
    );
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    res.end(html);
    return;
  }

  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = join(ROOT, pathname);
  if (existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
    return;
  }
  res.writeHead(404);
  res.end('not found');
};

createServer(handler).listen(PORT, '127.0.0.1', () => {
  console.log(`diag server on http://127.0.0.1:${PORT}/diag.html`);
});
