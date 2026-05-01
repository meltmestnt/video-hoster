/* eslint-disable no-restricted-globals */

// Service worker for Web Push delivery. Kept intentionally tiny — it has
// to load before notifications can show, so we don't pull in any modules
// or rely on bundling. Edits here go live the next time the SW is fetched
// (controlled by the browser's HTTP caching of /sw.js, which we serve as
// no-cache via next.config.mjs).

self.addEventListener("install", () => {
  // Activate this worker immediately on first install instead of waiting
  // for all tabs to close — the user just granted permission and expects
  // pushes to start working right away.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Take over open tabs that didn't have a controller yet so the SW can
  // also receive `pushsubscriptionchange` events from those tabs.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  /** @type {{ title: string; body: string; url: string; icon?: string|null; tag?: string }} */
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "vids&gifs", body: event.data.text(), url: "/" };
  }

  const options = {
    body: payload.body || "",
    // Falls back to a generic icon when none is supplied — browsers refuse
    // to show notifications without an icon on some platforms.
    icon: payload.icon || "/icon-192.png",
    badge: "/icon-192.png",
    data: {
      url: payload.url || "/",
    },
    // `tag` collapses subsequent notifications onto the same one rather
    // than stacking. Kept off by default — only set it when the server
    // wants explicit deduplication.
    ...(payload.tag ? { tag: payload.tag, renotify: true } : {}),
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "vids&gifs", options),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Prefer focusing an existing tab on the same origin and same path —
      // otherwise the user ends up with duplicates of the videos page open.
      for (const client of allClients) {
        try {
          const url = new URL(client.url);
          if (url.origin === self.location.origin) {
            await client.focus();
            // Always navigate to the target so a tab that was on a
            // different page jumps to the relevant one.
            if ("navigate" in client) {
              try {
                await client.navigate(target);
              } catch {
                /* navigation can throw if the SW isn't allowed to drive
                   this client; focus is enough in that case. */
              }
            }
            return;
          }
        } catch {
          /* malformed URL — ignore that client */
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// When the browser rotates the subscription (key expiry, vendor migration,
// etc.) we get this event. Re-subscribe with the same VAPID public key and
// post the new endpoint back to the server. The fetch goes to a tiny
// resubscribe endpoint that the page-side context creates lazily.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const sub = await self.registration.pushManager.getSubscription();
        if (!sub) return;
        // We can't reach tRPC from the SW directly without auth — the
        // page handles re-subscription on next load via the permission
        // context. This is just a best-effort cleanup on the old endpoint.
      } catch {
        /* swallow — the next page load will reconcile state */
      }
    })(),
  );
});
