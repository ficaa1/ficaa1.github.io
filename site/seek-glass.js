// Runs on a direct visit and after the site swaps <main> without stopping music.
(() => {
  const main = document.currentScript.closest('main');
  const url = new URL('seek-glass.mjs?v=3abdf5a1', document.currentScript.src);
  const start = () => {
    if (main.isConnected && document.documentElement.matches('[data-glass]:not([data-lite])')) {
      import(url).then(m => m.mountSeekGlass(main)).catch(() => {}); // CSS glass remains the fallback.
    }
  };
  if (document.readyState === 'complete') start();
  else addEventListener('load', start, { once: true });
})();
