const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const validation = path.join(root, 'validation'); fs.mkdirSync(validation, { recursive: true });
const profile = fs.mkdtempSync(path.join(validation, 'chrome-profile-'));
const stage = fs.mkdtempSync(path.join(validation, 'extension-'));
for (const name of ['routing.js', 'background.js', 'popup.html', 'popup.css', 'popup.js']) fs.copyFileSync(path.join(root, name), path.join(stage, name));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
manifest.permissions.push('proxy'); delete manifest.optional_permissions;
fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest));
const proxied = [];
const requested = [];
const sockets = new Set();
let browser;
const origin = http.createServer((req, res) => {
  requested.push({ host: req.headers.host, path: req.url });
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/root') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><title>Local routing fixture</title><iframe src="http://media.fixture.test:${origin.address().port}/player"></iframe>`);
  } else if (req.url === '/player') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><title>Embedded player</title><video controls src="http://cdn.media.fixture.test:${origin.address().port}/clip.mp4"></video>`);
  } else { res.setHeader('Content-Type', 'text/plain'); res.end('Local test payload'); }
});
const socks = net.createServer(client => {
  sockets.add(client); client.on('close', () => sockets.delete(client)); client.on('error', () => {});
  let buffer = Buffer.alloc(0); let phase = 0;
  const consume = chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    if (phase === 0) {
      if (buffer.length < 2 || buffer.length < 2 + buffer[1]) return;
      if (buffer[0] !== 5) return client.destroy();
      buffer = buffer.subarray(2 + buffer[1]); client.write(Buffer.from([5, 0])); phase = 1;
    }
    if (phase !== 1 || buffer.length < 5) return;
    let host; let length;
    if (buffer[3] === 3) { length = 5 + buffer[4] + 2; if (buffer.length < length) return; host = buffer.subarray(5, 5 + buffer[4]).toString(); }
    else if (buffer[3] === 1) { length = 10; if (buffer.length < length) return; host = [...buffer.subarray(4, 8)].join('.'); }
    else return client.end(Buffer.from([5, 8, 0, 1, 0, 0, 0, 0, 0, 0]));
    const port = buffer.readUInt16BE(length - 2);
    if (buffer[1] !== 1 || !host.endsWith('.fixture.test') || port !== origin.address().port) {
      return client.end(Buffer.from([5, 2, 0, 1, 0, 0, 0, 0, 0, 0]));
    }
    phase = 2; proxied.push(host);
    const remaining = buffer.subarray(length); client.removeListener('data', consume);
    const upstream = net.connect({ host: '127.0.0.1', port });
    sockets.add(upstream); upstream.on('close', () => sockets.delete(upstream));
    upstream.on('error', () => client.destroy()); client.on('close', () => upstream.destroy());
    upstream.once('connect', () => {
      client.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
      if (remaining.length) upstream.write(remaining);
      client.pipe(upstream); upstream.pipe(client);
    });
  };
  client.on('data', consume);
});
async function main() {
  await new Promise(resolve => origin.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => socks.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.STREAMROUTE_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging', '--host-resolver-rules=MAP *.fixture.test 127.0.0.1']
  });
  const cdp = await browser.browser().newBrowserCDPSession();
  const loaded = await cdp.send('Extensions.loadUnpacked', { path: stage });
  const popup = await browser.newPage(); await popup.setViewportSize({ width: 410, height: 820 });
  await popup.goto(`chrome-extension://${loaded.id}/popup.html`);
  await popup.waitForFunction(() => document.getElementById('status').textContent === 'Routing off');
  await popup.locator('#port').fill(String(socks.address().port));
  await popup.locator('#domains').fill('media.fixture.test');
  await popup.locator('#enable').click();
  await popup.waitForFunction(() => document.getElementById('status').textContent === 'Routing configured');
  const page = await browser.newPage();
  await page.goto(`http://direct.fixture.test:${origin.address().port}/root`);
  await page.waitForFunction(() => document.querySelector('iframe'));
  await new Promise(resolve => setTimeout(resolve, 700));
  assert.ok(proxied.includes('media.fixture.test'), 'embedded player proxied');
  assert.ok(proxied.includes('cdn.media.fixture.test'), 'media CDN subdomain proxied');
  assert.equal(proxied.includes('direct.fixture.test'), false, 'parent page stays direct');
  assert.ok(requested.some(item => item.path === '/clip.mp4'), 'actual media URL requested through SOCKS5');
  await popup.locator('#scope').selectOption('browser');
  await popup.locator('#enable').click();
  await popup.waitForFunction(() => !busy);
  await page.goto(`http://other.fixture.test:${origin.address().port}/other`);
  assert.ok(proxied.includes('other.fixture.test'), 'all-browser mode routes unlisted host');
  await popup.screenshot({ path: path.join(validation, 'popup.png'), fullPage: true });
  await popup.locator('#stop').click();
  await popup.waitForFunction(() => document.getElementById('status').textContent === 'Routing off');
  const count = proxied.length;
  await page.goto(`http://stopped.fixture.test:${origin.address().port}/stopped`);
  assert.equal(proxied.length, count, 'Stop removes own proxy override');
  console.log('PASS: actual Chrome extension starts off, routes iframe and media through local SOCKS5, keeps unmatched page direct, supports all-browser mode, and restores the prior configuration. No external destinations contacted by the mock proxy.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  for (const socket of sockets) socket.destroy();
  origin.closeAllConnections();
  await Promise.all([new Promise(resolve => origin.close(resolve)), new Promise(resolve => socks.close(resolve))]);
});
