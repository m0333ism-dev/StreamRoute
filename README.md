# StreamRoute

A Chrome extension that sends selected player/CDN connections, or Chrome web traffic, through an **existing local SOCKS5 or HTTP proxy**. It can be used alongside BufferLift; routing and buffering are separate tasks.

## What is possible

Cloudflare HTTPS DNS-only sends name lookups through encrypted DNS. It does not carry webpage, iframe, or media connections through a WARP traffic tunnel. HTTPS content is still encrypted by TLS, but its route is your usual network path.

StreamRoute configures Chrome to use a real local proxy. It cannot transform Cloudflare's DNS endpoint into a video tunnel or start/configure Cloudflare One on its own.

## Prerequisite: a local proxy

Cloudflare One supports Local proxy mode when enabled in the applicable device profile, with MASQUE and normally `127.0.0.1:40000`. An organization administrator may have to enable it. Verify the protocol/port for your deployment. Another trusted local SOCKS5/HTTP proxy can also be used.

Cloudflare documents a **10-second request timeout for Cloudflare One Local proxy mode**, which can matter for slow video fragments. Routing through this mode is not a promise that every streaming service will work. Full Traffic and DNS mode is another way to tunnel traffic and does not require this browser extension, but it is a separate device-profile change.

Changing from DNS-only to Local proxy mode also changes how the client handles DNS; it is not simply an extra switch that leaves every old network behavior intact. Routing all Chrome web traffic through a configured SOCKS5 proxy covers the main page, iframe, and CDN hostnames. For selective routing, keep the remaining DNS configuration appropriate for the unproxied sites. This extension does not make that client-mode change.

## Install and use

1. Extract `StreamRoute-Chrome.zip`.
2. Open `chrome://extensions`, enable Developer mode, choose Load unpacked, and select the extracted folder.
3. Open StreamRoute and choose SOCKS5 or HTTP and your local proxy port. The destination address is restricted to `127.0.0.1`.
4. For selective routing, choose **Only listed player / CDN hosts**, add the hostnames you want to route, or use the current tab's discovery control.
5. Click **Enable routing** and grant the optional Chrome proxy permission. Reload the page so connections are recreated using the new route.
6. If the player opens but media from another CDN still fails, add that hostname or explicitly choose **All Chrome web traffic**.
7. **Stop routing** removes only this extension's override, revealing the prior browser/system proxy configuration.

Routing starts off and is not automatically re-enabled on browser restart or extension update. Selected host rules apply to all matching requests in the Chrome profile, not just one tab. Subdomains match, but unrelated names such as `media.example.unrelated.test` do not. Loopback and plain local hostnames stay direct. Matching hosts do not silently fall back to direct traffic when the proxy is unavailable.

The extension does not edit WARP, Windows DNS, certificates, firewall, encryption, or browser Secure DNS settings. It does not rewrite video URLs or proxy through an extension-owned server. Proxy configuration by another extension or an organization policy is reported instead of overridden. Regular proxy settings may be inherited by incognito windows according to Chrome's configuration.

Chrome's proxy configuration covers proxyable web connections, not an operating-system VPN or every browser protocol. HTTPS still uses TLS; a separately configured enterprise proxy may inspect TLS if the applicable policy and trusted certificate allow it. StreamRoute does not install certificates or change that policy.

## Privacy and permissions

`storage` saves only endpoint preferences, chosen hosts, and the latest proxy error code. No browsing-history or media-token log is retained. `activeTab` and `scripting` allow a user-triggered inspection of visible iframe/media sources on the current page. Full signed URLs are discarded; only hostnames populate the editable list.

`proxy` is optional and requested only when Enable is clicked. Chrome's proxy API controls browser routing globally; the PAC script limits which hostnames use the local proxy. The routing endpoint itself may observe destination hosts and encrypted TLS traffic according to how that proxy operates.

## Testing

Seven dependency-free tests passed. The browser integration test passed in a fresh Chrome profile using a loopback-only mock SOCKS5 server: actual proxied iframe/media requests, direct unmatched hosts, all-browser mode, proxy permission/control, and Stop. The test grants proxy permission in its temporary build to model the user's optional grant. It does not use the user's Chrome profile, WARP tunnel, or external video/CDN connections. Live playback through Cloudflare has not been verified.

## Sources

- Cloudflare One modes and local proxy prerequisites: https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/configure/modes/
- Chrome proxy/PAC API: https://developer.chrome.com/docs/extensions/reference/api/proxy
