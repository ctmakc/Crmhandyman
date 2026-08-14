/*
 * HandymanPro — the field service worker.
 *
 * Its whole job is to make /today open in a basement. It caches the SHELL only: the
 * page frame and the hashed build assets. It never caches an API answer — the board's
 * data is stored by the screen itself, stamped with the time it arrived, and shown with
 * that stamp on it. Silent stale data is worse than an empty screen, so the one place
 * that can serve old rows is the one place that can print how old they are.
 *
 * TENANT SAFETY. The cached frame carries a contractor's business name and the signed-in
 * person's email, so it lives in its own cache and three gates keep it out of the next
 * person's browser:
 *   1. signing out drops the page cache on the way through this worker;
 *   2. the app wipes everything — caches and stored board — when the session identity
 *      differs from the one that claimed this browser (src/lib/offline-queue.ts), which
 *      covers a sign-out that never reached the network;
 *   3. CACHE_VERSION below — bumping it drops every cache from every phone at once,
 *      which is also how a changed icon or offline card reaches an installed app.
 */

const CACHE_VERSION = "v2";
const SHELL = `hp-shell-${CACHE_VERSION}`;
const PAGES = `hp-pages-${CACHE_VERSION}`;
const KEEP = [SHELL, PAGES];

const OFFLINE_URL = "/offline.html";

/** The one screen worth having without a network. */
const FIELD_PATH = "/today";

const PRECACHE = [
  OFFLINE_URL,
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  // The offline card is set in the product's own face; with no network the font has
  // to already be on the phone or the card falls back to a system grotesque.
  "/fonts/chivo-latin.woff2",
  "/fonts/chivo-mono-latin.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // One at a time: a missing icon must not cost the offline page.
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "reload" });
            if (res.ok) await cache.put(url, res.clone());
          } catch (e) {
            /* offline at install time — the runtime cache picks it up later */
          }
        })
      );
      await primeField(cache);
      await self.skipWaiting();
    })()
  );
});

/**
 * The first visit is the one this worker cannot see: the page that registered it was
 * already on screen, uncontrolled, so neither its frame nor its scripts passed through
 * here. A tech who installs the app in the yard and drives straight into a basement
 * would then hit a blank screen — the exact failure this whole track exists to end.
 *
 * So the worker fetches the field screen itself while it still has a network, and takes
 * the build assets the page names in its own markup. The list needs no maintenance:
 * it is whatever this build actually asks for.
 */
async function primeField(shell) {
  try {
    /**
     * `redirect: "manual"` because a plain fetch FOLLOWS the middleware's 302 and comes
     * back as a perfectly ordinary 200 — the login page, cached under the key `/today`.
     * The navigation handler is safe from this by accident (a navigation redirect is
     * opaque); this call was not, and it runs on install, which is exactly when a
     * session is most likely to have just expired.
     */
    const res = await fetch(FIELD_PATH, { cache: "reload", redirect: "manual" });
    if (!res.ok || res.redirected || res.type !== "basic") return;

    const html = await res.clone().text();
    await (await caches.open(PAGES)).put(FIELD_PATH, res.clone());

    const assets = new Set();
    for (const m of html.matchAll(/\/_next\/static\/[A-Za-z0-9._~\-/]+\.(?:js|css|woff2?)/g)) {
      assets.add(m[0]);
    }
    await Promise.all(
      Array.from(assets).map(async (url) => {
        try {
          const asset = await fetch(url);
          if (asset.ok && asset.type === "basic") await shell.put(url, asset.clone());
        } catch (e) {
          /* one missing chunk is not worth losing the rest of the shell */
        }
      })
    );
  } catch (e) {
    // Installed with no network. The next controlled load fills the caches.
  }
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith("hp-") && !KEEP.includes(n)).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  // Sent when the app finds another account's board in this browser: take everything.
  if (type === "hp-purge") {
    event.waitUntil(purge({ shellToo: true }));
  }
});

/**
 * Drop what belongs to a person.
 *
 * The pages cache holds rendered HTML — the contractor's business name on the rail and
 * the signed-in email in the top bar — so it goes the moment the session does. The
 * shell cache holds hashed build output, the icons, the manifest and the offline card:
 * identical bytes for every workspace on this server, carrying nothing about anyone.
 * Keeping it means the next person to open this phone still gets an app that explains
 * itself with no network, instead of a browser error page.
 */
async function purge(options) {
  const shellToo = !!(options && options.shellToo);
  const names = await caches.keys();
  const doomed = names.filter(
    (n) => n.startsWith("hp-") && (shellToo || !n.startsWith("hp-shell-"))
  );
  await Promise.all(doomed.map((n) => caches.delete(n)));
}

/** Tell every open tab to drop its stored board — the caches alone are not the data. */
async function tellClientsToWipe() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  for (const client of clients) client.postMessage({ type: "hp-wiped" });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  // Signing out is the moment the cache stops being ours. Purge on the way through,
  // whatever the server answers — a failed sign-out that left the cache behind is
  // exactly the case this exists for.
  if (url.pathname.startsWith("/api/auth/signout")) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } finally {
          event.waitUntil(purge({ shellToo: false }).then(tellClientsToWipe));
        }
      })()
    );
    return;
  }

  if (request.method !== "GET") return;

  // An API answer is never served from a cache. See the header comment.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(page(request, url));
    return;
  }

  // Hashed build output and the app's own icons: immutable, safe to serve cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(immutable(request));
  }
});

/**
 * The page. Network first — a tech with bars must always get today's frame from the
 * server. When the network fails, the cached field screen answers; when even that is
 * missing, the offline card explains itself instead of the browser's dinosaur.
 */
async function page(request, url) {
  try {
    const res = await fetch(request);
    // Only the field screen is worth keeping, and only when it is really the page:
    // a 302 to /login or a 403 from the middleware must never become the cached shell.
    if (res.ok && res.type === "basic" && url.pathname === FIELD_PATH) {
      const cache = await caches.open(PAGES);
      await cache.put(FIELD_PATH, res.clone());
    }
    return res;
  } catch (e) {
    // Only the page that was actually cached is served back. Answering /projects/42
    // with the cached board would draw today's stops under someone else's address bar.
    const cached = await caches.match(url.pathname);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } });
  }
}

async function immutable(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok && res.type === "basic") {
      const cache = await caches.open(SHELL);
      await cache.put(request, res.clone());
    }
    return res;
  } catch (e) {
    return new Response("", { status: 504 });
  }
}
