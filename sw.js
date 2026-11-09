// Guarda o app no celular para abrir SEM internet.
// ATUALIZAÇÃO NA HORA: com internet o app SEMPRE busca a versão mais nova do servidor (ignora o cache do navegador);
// sem internet (ou servidor lento, 4 s) usa a cópia guardada. Mudou o app? Troque o número de V (garante limpar o cache antigo).
const V = "dna-v6";
const ARQ = ["./", "index.html", "config.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => Promise.all(ARQ.map(a => fetch(a, { cache: "no-store" }).then(r => r.ok && c.put(a, r)).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Do próprio app: rede primeiro (versão nova na hora), cópia do celular se não houver sinal. Do servidor (Apps Script): nunca passa por aqui.
self.addEventListener("fetch", e => {
  const r = e.request; if (r.method !== "GET") return;
  const u = new URL(r.url); if (u.origin !== location.origin) return;
  e.respondWith((async () => {
    const guardado = () => caches.match(r, { ignoreSearch: true });
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000);
      const resp = await fetch(r, { cache: "no-store", signal: ctl.signal }); clearTimeout(t);
      if (resp && resp.ok) { const cp = resp.clone(); caches.open(V).then(ch => ch.put(r, cp)); return resp; }
      return (await guardado()) || resp;
    } catch (_) {
      return (await guardado()) || (r.mode === "navigate" ? caches.match("index.html") : Response.error());
    }
  })());
});
