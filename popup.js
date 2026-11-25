"use strict";
const element = id => document.getElementById(id);
let busy = false;
let active = false;
function settings() {
  return StreamRouteRules.normalize({ scope: element("scope").value, scheme: element("scheme").value, port: element("port").value, domains: element("domains").value });
}
function updateControls() {
  element("hosts-section").hidden = element("scope").value === "browser";
  for (const id of ["scope", "scheme", "port", "domains", "detect", "enable"]) element(id).disabled = busy;
  element("stop").disabled = busy || !active;
}
function render(result, loadPreferences = false) {
  active = result.active === true;
  element("status").textContent = active ? "Routing configured" : "Routing off";
  element("status-detail").textContent = active
    ? result.error ? `Proxy error: ${result.error.error}` : "Proxy availability has not been verified. Reload the video page to use this route."
    : ["controlled_by_other_extensions", "not_controllable"].includes(result.control) ? "Proxy settings are controlled by another extension or policy." : "Your existing browser/network route is unchanged.";
  if (loadPreferences) {
    const prefs = result.preferences || StreamRouteRules.defaults;
    element("scope").value = prefs.scope;
    element("scheme").value = prefs.scheme;
    element("port").value = prefs.port;
    element("domains").value = prefs.domains.join("\n");
  }
  updateControls();
}
async function send(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error || "The extension did not respond.");
  return result;
}
element("scope").addEventListener("change", updateControls);
element("routing-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (busy) return;
  let input;
  try { input = settings(); } catch (error) { element("notice").textContent = error.message; return; }
  busy = true; updateControls();
  try {
    const allowed = await chrome.permissions.request({ permissions: ["proxy"] });
    if (!allowed) throw new Error("Proxy permission was not granted. Routing remains unchanged.");
    render(await send({ type: "ENABLE", settings: input }));
    element("notice").textContent = `Configured ${input.scheme.toUpperCase()} 127.0.0.1:${input.port}. This requires a running local proxy.`;
  } catch (error) { element("notice").textContent = error.message; }
  finally { busy = false; updateControls(); }
});
element("stop").addEventListener("click", async () => {
  busy = true; updateControls();
  try { render(await send({ type: "STOP" })); element("notice").textContent = "StreamRoute's override removed. Your previous configuration is effective."; }
  catch (error) { element("notice").textContent = error.message; }
  finally { busy = false; updateControls(); }
});
element("detect").addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:\/\//.test(tab.url || "")) throw new Error("Open a website and use the extension popup there.");
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
      const urls = [];
      for (const frame of document.querySelectorAll("iframe[src]")) {
        const rect = frame.getBoundingClientRect();
        if (frame.allowFullscreen || frame.allow.includes("fullscreen") || (rect.width >= 500 && rect.height >= 200)) urls.push(frame.src);
      }
      for (const media of document.querySelectorAll("video, video source")) urls.push(media.currentSrc || media.src);
      return urls.filter(url => /^https?:\/\//.test(url));
    } });
    const found = [...new Set((results[0]?.result || []).map(url => new URL(url).hostname))];
    if (!found.length) throw new Error("No visible player host found. Paste the failing iframe/CDN hostname manually.");
    const current = StreamRouteRules.normalize({ ...StreamRouteRules.defaults, scope: "browser", domains: element("domains").value }).domains;
    element("domains").value = [...new Set([...current, ...found])].join("\n");
    element("notice").textContent = "Player hosts added for review. Nested media CDN hosts may still need to be added; nothing was routed yet.";
  } catch (error) { element("notice").textContent = error.message; }
});
send({ type: "STATUS" }).then(result => render(result, true)).catch(error => { element("notice").textContent = error.message; });
