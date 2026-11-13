// Run after npm run build. Uses installed Chrome and Node's built-in CDP support.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const workspace = resolve(import.meta.dirname, '..');
const webRoot = join(workspace, 'www');
const tempRoot = join(workspace, '.tmp');
const screenshots = join(tempRoot, 'smoke');
await mkdir(screenshots, { recursive: true });
const profile = await mkdtemp(join(tempRoot, 'chrome-smoke-'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = resolve(webRoot, '.' + pathname);
    if (!file.startsWith(webRoot + sep) && file !== webRoot) { res.writeHead(403).end(); return; }
    if (!extname(file)) file = join(webRoot, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((accept) => server.listen(0, '127.0.0.1', accept));
const base = `http://127.0.0.1:${server.address().port}`;
const chrome = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let ws;
let send;
let chromeLog = '';
chrome.stderr.on('data', (chunk) => { chromeLog += chunk; });

try {
  const browserEndpoint = await new Promise((accept, reject) => {
    const timeout = setTimeout(() => reject(new Error('Chrome startup timed out')), 15000);
    chrome.once('error', (error) => { clearTimeout(timeout); reject(error); });
    let output = '';
    chrome.stderr.on('data', (chunk) => {
      output += chunk;
      const endpoint = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (endpoint) { clearTimeout(timeout); accept(endpoint[1]); }
    });
  });
  const debugOrigin = new URL(browserEndpoint).origin.replace('ws:', 'http:');
  const targets = await fetch(`${debugOrigin}/json/list`).then((response) => response.json());
  ws = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((accept, reject) => { ws.addEventListener('open', accept); ws.addEventListener('error', reject); });
  let id = 0;
  const pending = new Map();
  const errors = [];
  const assetFailures = [];
  ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Network.responseReceived') {
      const { response, type } = message.params;
      if (response.url.startsWith(base) && response.status >= 400 && ['Script', 'Stylesheet', 'Image'].includes(type)) {
        assetFailures.push(`${response.status} ${response.url}`);
      }
    }
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id);
      clearTimeout(request.timeout);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.accept(message.result);
    }
  });
  send = (method, params = {}) => new Promise((accept, reject) => {
    const requestId = ++id;
    const timeout = setTimeout(() => { pending.delete(requestId); reject(new Error(`${method} timed out`)); }, 10000);
    pending.set(requestId, { accept, reject, timeout });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'Browser evaluation failed');
    return result.result.value;
  };
  const waitFor = async (expression) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression)) return;
      await delay(100);
    }
    throw new Error(`Condition timed out: ${expression}`);
  };
  const click = async (selector) => {
    assert(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), `Missing ${selector}`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    await delay(500);
  };
  const screenshot = async (name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(screenshots, `${name}.png`), Buffer.from(data, 'base64'));
  };
  console.log('Connected to Chrome.');
  console.log((await send('Browser.getVersion')).product);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  // No external API calls during local validation.
  await send('Network.setBlockedURLs', { urls: ['https://*', 'http://api.*'] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__navigationEvents = [];
    for (const eventName of ['ionViewWillEnter', 'ionViewDidEnter', 'ionViewWillLeave', 'ionViewDidLeave']) {
      document.addEventListener(eventName, event => {
        window.__navigationEvents.push({ event: eventName, page: event.target.tagName, time: Math.round(performance.now()) });
      }, true);
    }
    window.__audioStats = { contexts: 0, oscillators: 0, activeLoops: 0 };
    const OriginalAudioContext = window.AudioContext;
    window.AudioContext = class extends OriginalAudioContext {
      constructor(...args) { super(...args); window.__audioStats.contexts++; window.__audioContext = this; }
      createOscillator() { window.__audioStats.oscillators++; return super.createOscillator(); }
      createWaveShaper() { const node = super.createWaveShaper(); window.__audioOutput = node; return node; }
      createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start.bind(source), stop = source.stop.bind(source);
        source.start = (...args) => { if (source.loop) window.__audioStats.activeLoops++; start(...args); };
        source.stop = (...args) => { if (source.loop) window.__audioStats.activeLoops--; stop(...args); };
        return source;
      }
    };
  ` });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: base });
  await waitFor(`document.querySelector('app-home .primary-cta')?.disabled === false`);
  await waitFor(`!!document.querySelector('app-home .icon-btn ion-icon')?.shadowRoot?.querySelector('svg')`);
  await evaluate(`document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
  await waitFor('window.__audioStats.activeLoops === 1');
  await waitFor(`!!document.querySelector('app-ad-banner .ad-banner')`);
  assert(await evaluate(`(() => {
    const content = document.querySelector('.app-content').getBoundingClientRect();
    const banner = document.querySelector('app-ad-banner .ad-banner').getBoundingClientRect();
    return banner.top >= content.bottom && !document.querySelector('ion-router-outlet app-ad-banner');
  })()`), 'The banner must occupy a separate footer outside scrollable page content');
  await screenshot('home-390');
  for (const [width, height] of [[320, 568], [360, 800], [412, 915], [768, 1024]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
    await delay(150);
    const layout = await evaluate(`(() => {
      const home = document.querySelector('app-home');
      const cards = [...home.querySelectorAll('.menu-btn')];
      return cards.every(card => {
        const bounds = card.getBoundingClientRect();
        const text = card.querySelector('.tile-text');
        const content = text.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth + 1 && bounds.height >= 44
          && content.left >= bounds.left && content.right <= bounds.right
          && content.bottom <= bounds.bottom && text.scrollWidth <= text.clientWidth + 1
          && getComputedStyle(text).textAlign === 'left';
      });
    })()`);
    assert(layout, `Home cards must align and wrap without clipping at ${width}px`);
    await screenshot(`home-${width}`);
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const idleOscillators = await evaluate('window.__audioStats.oscillators');
  await delay(1100);
  assert.equal(await evaluate('window.__audioStats.oscillators'), idleOscillators, 'Music should not allocate real-time oscillators');

  await click('app-home .icon-btn');
  await waitFor(`!!document.querySelector('app-settings:not(.ion-page-hidden) #music-volume')`);
  await evaluate(`const slider = document.querySelector('#music-volume'); slider.value = '55'; slider.dispatchEvent(new Event('input', { bubbles: true }));`);
  await waitFor(`document.querySelector('#music-volume').value === '55'`);
  await screenshot('settings-390');
  await evaluate(`for (const id of ['sound-volume', 'music-volume']) {
    const control = document.getElementById(id);
    control.value = '100'; control.dispatchEvent(new Event('input', { bubbles: true }));
  }`);
  await delay(250);
  const audioLevels = await evaluate(`(async () => {
    const ctx = window.__audioContext;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    window.__audioOutput.connect(analyser);
    document.querySelector('app-settings ion-button').click();
    const samples = new Float32Array(analyser.fftSize);
    let peak = 0, energy = 0, count = 0;
    try {
      for (let frame = 0; frame < 30; frame++) {
        await new Promise(resolve => setTimeout(resolve, 40));
        analyser.getFloatTimeDomainData(samples);
        for (const sample of samples) {
          peak = Math.max(peak, Math.abs(sample));
          energy += sample * sample;
          count++;
        }
      }
      return { peak, rms: Math.sqrt(energy / count) };
    } finally {
      window.__audioOutput.disconnect(analyser);
      analyser.disconnect();
    }
  })()`);
  assert(audioLevels.peak > 0.1 && audioLevels.rms > 0.02, `Full-volume audio should be audible: ${JSON.stringify(audioLevels)}`);
  assert(audioLevels.peak < 1, `Music and effects must stay below clipping: ${JSON.stringify(audioLevels)}`);
  console.log(`Full-volume audio: peak ${audioLevels.peak.toFixed(3)}, RMS ${audioLevels.rms.toFixed(3)} (full scale = 1).`);
  await evaluate(`for (const [id, value] of [['sound-volume', '70'], ['music-volume', '55']]) {
    const control = document.getElementById(id);
    control.value = value; control.dispatchEvent(new Event('input', { bubbles: true }));
  }`);
  await click('app-settings .reset-button');
  await waitFor(`!!document.querySelector('ion-alert .alert-button-role-cancel')`);
  await waitFor(`!document.querySelector('app-ad-banner .ad-banner')`);
  await click('ion-alert .alert-button-role-cancel');
  await waitFor(`!document.querySelector('ion-alert')`);
  await click('app-settings ion-back-button');
  await waitFor(`!!document.querySelector('app-home:not(.ion-page-hidden)')`);
  await click('app-home .primary-cta');
  await waitFor(`!!document.querySelector('app-game-play:not(.ion-page-hidden) .game-board')`);
  await waitFor(`!document.querySelector('app-ad-banner .ad-banner')`);
  await waitFor('window.__audioStats.activeLoops === 1');
  await screenshot('game-390');

  for (const [width, height] of [[320, 568], [768, 1024], [844, 390]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
    await delay(150);
    const bounds = await evaluate(`(() => { const rect = document.querySelector('app-game-play .game-board').getBoundingClientRect(); return { left: rect.left, right: rect.right, width: rect.width, height: rect.height }; })()`);
    assert(bounds.width > 150 && bounds.height > 150 && bounds.left >= 0 && bounds.right <= width + 1, `Board must fit viewport ${width}: ${JSON.stringify(bounds)}`);
    if (width > height) {
      const visible = await evaluate(`(() => {
        const board = document.querySelector('app-game-play .game-board').getBoundingClientRect();
        const tools = document.querySelector('app-game-play .power-up-bar').getBoundingClientRect();
        return board.bottom <= innerHeight + 1 && tools.bottom <= innerHeight + 1;
      })()`);
      assert(visible, 'Board and power-ups must fit together in landscape');
    }
    await screenshot(`game-${width}`);
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  const level = JSON.parse(await readFile(join(webRoot, 'assets/levels/level-001.json'), 'utf8'));
  let remaining = [...level.blocks];
  const canMove = (block) => {
    const [dr, dc] = { UP: [-1, 0], DOWN: [1, 0], LEFT: [0, -1], RIGHT: [0, 1] }[block.direction];
    for (let r = block.row + dr, c = block.column + dc; r >= 0 && r < level.rows && c >= 0 && c < level.columns; r += dr, c += dc) {
      if ([...remaining, ...level.obstacles].some((other) => other.row === r && other.column === c)) return false;
    }
    return true;
  };
  const first = remaining.find(canMove);
  assert(first, 'First level must have a move');
  await click(`app-game-play button[data-block-id="${first.id}"]`);
  remaining = remaining.filter((block) => block.id !== first.id);
  await waitFor(`document.querySelectorAll('app-game-play .game-board app-arrow-block:not([aria-hidden="true"])').length === ${remaining.length}`);
  await click('app-game-play button.accent-undo');
  await waitFor(`document.querySelectorAll('app-game-play .game-board app-arrow-block:not([aria-hidden="true"])').length === ${level.blocks.length}`);
  remaining = [...level.blocks];
  await click('app-game-play button.accent-hint');
  await waitFor(`!!document.querySelector('app-game-play button.hinted')`);
  await click('app-game-header button[aria-label="Pause"]');
  await waitFor(`!!document.querySelector('app-pause-panel') && window.__audioStats.activeLoops === 0`);
  const pausedTime = await evaluate(`document.querySelector('app-game-header .timer').textContent.trim()`);
  await delay(1200);
  assert.equal(await evaluate(`document.querySelector('app-game-header .timer').textContent.trim()`), pausedTime, 'Paused time must stay fixed');
  await evaluate(`Array.from(document.querySelectorAll('app-pause-panel ion-button')).find(button => button.textContent.trim() === 'Settings').click()`);
  await waitFor(`!!document.querySelector('app-settings:not(.ion-page-hidden)')`);
  await click('app-settings ion-back-button');
  await waitFor(`!!document.querySelector('app-game-play:not(.ion-page-hidden) app-pause-panel')`);
  await waitFor(`window.__navigationEvents.filter(event => event.page === 'APP-GAME-PLAY').at(-1)?.event === 'ionViewDidEnter'`);
  assert.equal(await evaluate(`document.querySelector('app-game-header .timer').textContent.trim()`), pausedTime, 'Navigating to settings must preserve the paused timer');
  await evaluate(`Array.from(document.querySelectorAll('app-pause-panel ion-button')).find(button => button.textContent.trim() === 'Resume').click()`);
  await waitFor('window.__audioStats.activeLoops === 1');

  while (remaining.length) {
    const next = remaining.find(canMove);
    assert(next, 'Level must remain solvable');
    await click(`app-game-play button[data-block-id="${next.id}"]`);
    remaining = remaining.filter((block) => block.id !== next.id);
  }
  await waitFor(`!!document.querySelector('app-level-complete-panel') && !document.querySelector('app-level-complete-panel ion-button')?.disabled`);
  assert.equal(await evaluate(`document.querySelector('app-level-complete-panel').textContent.includes('2x Coins')`), false, 'Rewarded ads must not offer cash-redeemable coin bonuses');
  await screenshot('complete-390');
  assert.equal(await evaluate('window.__audioStats.activeLoops'), 0, 'Completion must stop music');
  assert.equal(await evaluate('window.__audioStats.contexts'), 1, 'All audio must share one context');
  await evaluate(`Array.from(document.querySelectorAll('app-level-complete-panel ion-button')).find(button => button.textContent.trim() === 'Level Map').click()`);
  const levelIndex = JSON.parse(await readFile(join(webRoot, 'assets/levels/levels-index.json'), 'utf8'));
  await waitFor(`document.querySelectorAll('app-level-map app-level-card').length === ${levelIndex.length}`);
  assert.equal(await evaluate(`!!document.querySelector('app-level-map .map-navigation, app-level-map .bottom-navigation')`), false, 'The full map must have no pagination controls');
  await waitFor(`document.querySelector('app-level-map #current-node')?.textContent.includes('2')`);
  await screenshot('level-map-390');
  await evaluate(`Array.from(document.querySelectorAll('app-level-map app-level-card')).at(-1).scrollIntoView({ block: 'center' })`);
  await waitFor(`(() => { const rect = Array.from(document.querySelectorAll('app-level-map app-level-card')).at(-1).getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight; })()`);
  await screenshot('level-map-last-390');

  for (const [route, selector] of [
    ['/store', 'app-store .store-content app-coin-icon'],
    ['/themes', 'app-themes app-theme-card'],
    ['/daily-challenge', 'app-daily-challenge .daily-card'],
    ['/profile', 'app-profile .stat-grid'],
  ]) {
    await send('Page.navigate', { url: `${base}${route}` });
    await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`);
    await screenshot(`${route.slice(1)}-390`);
  }
  await send('Page.navigate', { url: `${base}/settings` });
  await waitFor(`!!document.querySelector('app-settings .reset-button')`);
  await evaluate(`Array.from(document.querySelectorAll('app-settings ion-item')).find(item => item.textContent.includes('Privacy Policy')).click()`);
  await waitFor(`document.querySelector('app-info ion-title')?.textContent.includes('Privacy Policy')`);
  await screenshot('privacy-390');
  assert.deepEqual(assetFailures, [], 'No missing local scripts, styles, or icon assets');
  assert.deepEqual(errors, [], 'No uncaught browser exceptions');
  console.log('PASS: responsive home cards (320–768px), audio/volume controls, boards, moves, undo, hint, pause/settings/resume, completion, full level map, store, themes, daily challenge, profile, dialogs, and privacy navigation.');
  console.log(`Screenshots: ${screenshots}`);
} catch (error) {
  if (send) {
    const state = await send('Runtime.evaluate', { expression: `JSON.stringify({ url: location.pathname, pages: [...document.querySelectorAll('.ion-page')].map(page => [page.tagName, page.className]), navigation: window.__navigationEvents?.slice(-16), text: document.body.innerText.slice(-1600) })`, returnByValue: true }).catch(() => null);
    console.error(state?.result?.value);
    const captured = await send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
    if (captured) await writeFile(join(screenshots, 'failure.png'), Buffer.from(captured.data, 'base64'));
  }
  console.error(chromeLog.slice(-4000));
  throw error;
} finally {
  if (send) await send('Browser.close').catch(() => undefined);
  ws?.close();
  chrome.kill();
  server.closeAllConnections();
  await new Promise((accept) => server.close(accept));
  // Only delete the unique browser profile created inside this workspace's temp folder.
  if (dirname(resolve(profile)) === tempRoot && profile.startsWith(join(tempRoot, 'chrome-smoke-'))) {
    await delay(500);
    await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);
  }
}
