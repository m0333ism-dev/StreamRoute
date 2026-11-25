const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'routing.js'), 'utf8');
const context = vm.createContext({ URL });
vm.runInContext(source, context);
const rules = context.StreamRouteRules;
function route(settings, host) {
  const pac = rules.config(settings);
  const runtime = vm.createContext({ dnsDomainIs: (value, suffix) => value.endsWith(suffix), isPlainHostName: value => !value.includes('.') && !value.includes(':') });
  vm.runInContext(pac.pacScript.data, runtime);
  return runtime.FindProxyForURL('https://' + host + '/player', host);
}
test('selected player and CDN subdomains use SOCKS5, unrelated sites stay direct', () => {
  const prefs = { domains: ['media.example'] };
  assert.equal(route(prefs, 'media.example'), 'SOCKS5 127.0.0.1:40000');
  assert.equal(route(prefs, 'video.media.example'), 'SOCKS5 127.0.0.1:40000');
  assert.equal(route(prefs, 'player.example'), 'DIRECT');
  assert.equal(route(prefs, 'media.example.evil.test'), 'DIRECT');
  assert.equal(route(prefs, 'othermedia.example'), 'DIRECT');
});
test('all-browser scope supports HTTP proxy with no direct fallback for remote hosts', () => {
  const prefs = { scope: 'browser', scheme: 'http', port: 50000, domains: [] };
  assert.equal(route(prefs, 'video.example.test'), 'PROXY 127.0.0.1:50000');
  assert.equal(route(prefs, '127.example.test'), 'PROXY 127.0.0.1:50000');
  assert.equal(route(prefs, 'localhost'), 'DIRECT');
  assert.equal(route(prefs, '127.0.0.1'), 'DIRECT');
  assert.equal(route(prefs, '::1'), 'DIRECT');
  assert.equal(route(prefs, 'printer'), 'DIRECT');
});
test('URL input stores only hostname, not credentials, path, or signed queries', () => {
  const value = rules.normalize({ domains: ['https://user:pass@VIDEO.example.test/path?token=private', 'video.example.test'] });
  assert.equal(value.domains.length, 1);
  assert.equal(value.domains[0], 'video.example.test');
  assert.equal(JSON.stringify(value).includes('private'), false);
});
test('host validation prevents PAC injection and broad wildcard patterns', () => {
  for (const value of ['*', '*.example.test', 'evil.test\"); return "DIRECT";', '-invalid.test', 'evil.test:443']) {
    assert.throws(() => rules.normalize({ domains: [value] }));
  }
});
test('invalid endpoints or empty host scope are rejected', () => {
  for (const port of [0, 65536, -1, 2.5, 'wrong']) assert.throws(() => rules.normalize({ port }));
  assert.throws(() => rules.normalize({ scheme: 'quic' }));
  assert.throws(() => rules.normalize({ domains: [] }));
  assert.throws(() => rules.normalize({ scope: 'unknown' }));
});
test('hostnames are case-insensitive and trailing dots are normalized', () => {
  assert.equal(route({ domains: ['VIDEO.example.test.'] }, 'VIDEO.EXAMPLE.TEST.'), 'SOCKS5 127.0.0.1:40000');
});
test('routing host remains local even when an untrusted extra proxy host is supplied', () => {
  const config = rules.config({ host: 'untrusted-proxy.test', scope: 'browser' });
  assert.equal(config.pacScript.mandatory, true);
  assert.ok(config.pacScript.data.includes('127.0.0.1:40000'));
  assert.equal(config.pacScript.data.includes('untrusted-proxy.test'), false);
});
