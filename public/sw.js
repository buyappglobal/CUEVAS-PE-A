self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Pass-through simple pass para habilitar el criterio de PWA en móviles
  // sin interferir en los Webhooks y peticiones de Firebase en caliente.
  const url = new URL(e.request.url);
  if (url.origin === location.origin && url.pathname.match(/^\/(api|socket\.io)/)) {
    return; // Bypass network completely for APIs
  }
  
  e.respondWith(fetch(e.request).catch(error => {
    console.error('SW Network fallback failed:', error);
    throw error;
  }));
});
