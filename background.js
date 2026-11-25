"use strict";
importScripts("routing.js");
let listening = false;
const setting = (method, argument) => new Promise((resolve, reject) => {
  chrome.proxy.settings[method](argument, result => {
    const error = chrome.runtime.lastError;
    if (error) reject(new Error(error.message)); else resolve(result);
  });
});
async function permitted() { return chrome.permissions.contains({ permissions: ["proxy"] }); }
async function ownControl() {
  if (!await permitted()) return false;
  const result = await setting("get", { incognito: false });
  return result.levelOfControl === "controlled_by_this_extension";
}
function listenForErrors() {
  if (listening) return;
  chrome.proxy.onProxyError.addListener(error => {
    ownControl().then(owned => {
      if (owned) return chrome.storage.session.set({ lastProxyError: { error: String(error.error || "Proxy error").slice(0, 100), fatal: error.fatal === true } });
    }).catch(() => {});
  });
  listening = true;
}
async function status() {
  const saved = await chrome.storage.local.get("preferences");
  const prefs = saved.preferences || StreamRouteRules.defaults;
  if (!await permitted()) return { active: false, permission: false, preferences: prefs, control: "permission_required" };
  listenForErrors();
  const effective = await setting("get", { incognito: false });
  const error = await chrome.storage.session.get("lastProxyError");
  return { active: effective.levelOfControl === "controlled_by_this_extension", permission: true,
    preferences: prefs, control: effective.levelOfControl, error: error.lastProxyError || null };
}
async function enable(input) {
  const preferences = StreamRouteRules.normalize(input);
  if (!await permitted()) throw new Error("Grant Chrome proxy permission using Enable routing.");
  const current = await setting("get", { incognito: false });
  if (!["controllable_by_this_extension", "controlled_by_this_extension"].includes(current.levelOfControl)) {
    throw new Error("Chrome proxy settings are controlled by policy or another extension. StreamRoute cannot override them.");
  }
  await setting("set", { value: StreamRouteRules.config(preferences), scope: "regular" });
  await chrome.storage.local.set({ preferences });
  await chrome.storage.session.remove("lastProxyError");
  listenForErrors();
  await chrome.action.setBadgeText({ text: "ON" });
  await chrome.action.setBadgeBackgroundColor({ color: "#23664d" });
  return status();
}
async function stop() {
  if (await permitted()) await setting("clear", { scope: "regular" });
  await chrome.storage.session.remove("lastProxyError");
  await chrome.action.setBadgeText({ text: "" });
  return status();
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL("popup.html")) return;
  let operation;
  if (message?.type === "STATUS") operation = status();
  else if (message?.type === "ENABLE") operation = enable(message.settings);
  else if (message?.type === "STOP") operation = stop();
  else return;
  operation.then(value => respond({ ok: true, ...value }), error => respond({ ok: false, error: error.message }));
  return true;
});
// Never turn routing on automatically after a restart or extension update.
chrome.runtime.onStartup.addListener(() => stop().catch(() => {}));
chrome.runtime.onInstalled.addListener(() => stop().catch(() => {}));
