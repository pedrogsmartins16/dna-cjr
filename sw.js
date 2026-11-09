// Guarda o app no celular para abrir SEM internet. Mudou o app? Troque o número de V para todos receberem a versão nova.
const V = "dna-v1";
const ARQ = ["./", "index.html", "config.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(ARQ)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Do próprio app: responde do celular na hora e atualiza em segundo plano. Do servidor (Apps Script): nunca passa por aqui.
self.addEventListener("fetch", e => {
  const r = e.request; if (r.method !== "GET") return;
  const u = new URL(r.url); if (u.origin !== location.origin) return;
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(c => {
    const rede = fetch(r).then(resp => { if (resp && resp.ok) { const cp = resp.clone(); caches.open(V).then(ch => ch.put(r, cp)); } return resp; })
      .catch(() => c || (r.mode === "navigate" ? caches.match("index.html") : undefined));
    return c || rede;
  }));
});
