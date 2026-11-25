(() => {
  "use strict";
  const defaults = { scope: "hosts", scheme: "socks5", port: 40000, domains: [] };
  function domain(value) {
    let input = String(value).trim();
    if (!input) return null;
    if (input.includes("://")) {
      const url = new URL(input);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Use a hostname or HTTP(S) URL.");
      input = url.hostname;
    }
    input = input.toLowerCase().replace(/\.$/, "");
    if (input.length > 253 || !input.includes(".") || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(input)
      || input.split(".").some(part => part.length > 63 || part.startsWith("-") || part.endsWith("-"))) {
      throw new Error("Invalid hostname: use names such as player.example.com, without wildcards or ports.");
    }
    return input;
  }
  function normalize(value = {}) {
    const scope = value.scope ?? defaults.scope;
    const scheme = value.scheme ?? defaults.scheme;
    if (!["hosts", "browser"].includes(scope)) throw new Error("Select listed hosts or all Chrome traffic.");
    if (!["socks5", "http"].includes(scheme)) throw new Error("Select SOCKS5 or HTTP proxy.");
    const port = Number(value.port ?? defaults.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Proxy port must be between 1 and 65535.");
    const items = Array.isArray(value.domains) ? value.domains : String(value.domains ?? defaults.domains.join("\n")).split(/[\s,]+/);
    const domains = [...new Set(items.map(domain).filter(Boolean))];
    if (domains.length > 64) throw new Error("Use at most 64 hostnames.");
    if (scope === "hosts" && !domains.length) throw new Error("Add the failed player or media hostname first.");
    return { scope, scheme, port, domains };
  }
  function config(value) {
    const settings = normalize(value);
    const proxy = `${settings.scheme === "socks5" ? "SOCKS5" : "PROXY"} 127.0.0.1:${settings.port}`;
    // A single PAC policy handles both scopes and preserves local access.
    const data = `function FindProxyForURL(url, host) {
      host = host.toLowerCase().replace(/\\.$/, "");
      if (host === "localhost" || host === "::1" || host === "[::1]" || /^127(?:\\.\\d{1,3}){3}$/.test(host) || isPlainHostName(host)) return "DIRECT";
      var domains = ${JSON.stringify(settings.domains)};
      ${settings.scope === "browser" ? `return ${JSON.stringify(proxy)};` : `for (var i = 0; i < domains.length; i++) {
        if (host === domains[i] || dnsDomainIs(host, "." + domains[i])) return ${JSON.stringify(proxy)};
      }
      return "DIRECT";`}
    }`;
    return { mode: "pac_script", pacScript: { data, mandatory: true } };
  }
  globalThis.StreamRouteRules = { defaults, domain, normalize, config };
})();
