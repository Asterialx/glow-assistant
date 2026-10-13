self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(windows => {
    const target = windows.find(window => new URL(window.url).origin === self.location.origin);
    return target ? target.focus() : self.clients.openWindow('/');
  }));
});
