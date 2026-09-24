// On a deployed build (scripts/build-site.mjs marks the page), registers the service worker
// that keeps the game's files cached between visits. `npm start` never registers it, so
// edits made during development always show up.
export function registerServiceWorker() {
  const build = document.querySelector('meta[name="substitute-build"]');
  if (!build || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').catch((err) => {
    // the game works without it; repeat visits just download more
    console.warn('Offline cache unavailable:', err);
  });
}
