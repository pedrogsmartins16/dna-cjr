// Guarda o app no celular para abrir SEM internet e ENVIA os registros pendentes sozinho quando o sinal volta (mesmo com o app fechado).
// Atualização na hora: com internet o app sempre busca a versão mais nova do servidor (ignora o cache do navegador);
// sem internet (ou servidor lento, 4 s) usa a cópia guardada. Mudou o app? Troque o número de V (garante limpar o cache antigo).
const V = "dna-v27";
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

// ---- ENVIO EM SEGUNDO PLANO: o sinal voltou → manda os registros guardados, sem precisar abrir o app ----
const idb = fn => new Promise((ok, er) => { const r = indexedDB.open("dna-campo"); r.onerror = () => er(r.error); r.onsuccess = () => { const d = r.result; Promise.resolve(fn(d)).then(v => { d.close(); ok(v); }, e => { d.close(); er(e); }); }; });
const rq = r => new Promise((ok, er) => { r.onsuccess = () => ok(r.result); r.onerror = () => er(r.error); });
async function enviarPendentes() {
  const { url, pend } = await idb(async d => ({
    url: await rq(d.transaction("kv").objectStore("kv").get("url")),
    pend: (await rq(d.transaction("fila").objectStore("fila").getAll())).filter(x => x.st !== "e" && x.tok)
  }));
  if (!url || !pend.length) return;
  for (let i = 0; i < pend.length; i += 10) {
    const lote = pend.slice(i, i + 10);
    const resp = await fetch(url, { method: "POST", redirect: "follow", cache: "no-store", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ acao: "enviar", regs: lote.map(x => ({ id: x.id, k: x.k, tok: x.tok, dia: x.dia, hora: x.hora, fab: x.fab, fabrica: x.fabrica, area: x.area, local: x.local, descricao: x.descricao, acoes: x.acoes, dev: x.dev })) }) });
    if (!resp.ok) throw new Error("http " + resp.status);   // erro: o navegador tenta de novo depois
    const r = await resp.json(), ids = new Set((r && r.ids) || []);
    if (!r || !r.ok) throw new Error("servidor");
    await idb(async d => { const tx = d.transaction("fila", "readwrite"), s = tx.objectStore("fila"); lote.filter(x => ids.has(x.id)).forEach(x => { x.st = "e"; x.env = Date.now(); s.put(x); }); await new Promise((ok, er) => { tx.oncomplete = ok; tx.onerror = () => er(tx.error); }); });
  }
  const cs = await self.clients.matchAll({ includeUncontrolled: true }); cs.forEach(c => c.postMessage({ dna: "enviado" }));
}
const tenta = () => enviarPendentes().catch(() => {});
// Quando o celular acorda o envio, o sinal costuma ainda estar subindo e a 1ª tentativa falha (e o Chrome só repetiria uns 5 min depois):
// por isso insistimos sozinhos nos primeiros ~80 s, com pausas crescentes.
async function insistir() {
  const pausas = [0, 2, 4, 8, 15, 25, 30];
  let erro;
  for (const s of pausas) {
    if (s) await new Promise(ok => setTimeout(ok, s * 1000));
    try { await enviarPendentes(); return; } catch (e) { erro = e; }
  }
  throw erro;   // não deu: o Chrome agenda outra tentativa
}
self.addEventListener("sync", e => { if (e.tag === "dna-enviar") e.waitUntil(insistir()); });
self.addEventListener("periodicsync", e => { if (e.tag === "dna-enviar-p") e.waitUntil(insistir().catch(() => {})); });   // 2ª via: o Chrome acorda o app de tempos em tempos
self.addEventListener("activate", e => { e.waitUntil(tenta()); });                                        // 3ª via: sempre que o app é ativado/atualizado
self.addEventListener("message", e => { if (e.data && e.data.dna === "tentar") e.waitUntil(tenta()); });  // 4ª via: o app pede (ex.: sinal voltou)