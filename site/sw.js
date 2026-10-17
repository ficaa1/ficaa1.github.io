// The old Jekyll site registered a service worker at this address that answered from its own cache, so browsers
// that had visited it kept being shown the old pages. Browsers look for a new version of it here; this one takes
// over at once, empties the caches, unregisters itself and reloads the open tabs from the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
})()));
