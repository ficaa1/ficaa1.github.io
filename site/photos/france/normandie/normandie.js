// Normandie: the row of canvases at Étretat, whose year follows the one in front and which turns with two buttons as
// well as the thumb; and the entrances. The page works without this: the row scrolls sideways on its own. Runs on the
// first load and again after the site swaps pages in place.
(() => {
  const main = document.querySelector('main[data-place="normandie"]');
  if (!main || main.hasAttribute('data-js')) return;
  main.setAttribute('data-js', '');
  const still = (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-lite'));

  // ---- The row: the year of the canvas at the front, and a step back or on.
  main.querySelectorAll('.hang').forEach(hang => {
    const row = hang.querySelector('.row-of'), items = [...row.children], y = hang.querySelector('.year .y');
    const go = document.createElement('div');
    go.className = 'go';
    go.innerHTML = '<button type="button" aria-label="Earlier">←</button><button type="button" aria-label="Later">→</button>';
    hang.append(go);
    const [back, on] = go.querySelectorAll('button');
    let cur = 0;
    const front = () => {
      const x = row.getBoundingClientRect().left + 8;
      let best = 0, d = Infinity;
      items.forEach((li, i) => { const e = Math.abs(li.getBoundingClientRect().left - x); if (e < d) { d = e; best = i; } });
      if (row.scrollLeft + row.clientWidth >= row.scrollWidth - 4) best = items.length - 1;
      return best;
    };
    const show = () => {
      const i = front();
      back.disabled = row.scrollLeft <= 2;
      on.disabled = row.scrollLeft + row.clientWidth >= row.scrollWidth - 4;
      if (i === cur) return;
      cur = i;
      y.textContent = items[i].dataset.year;
      if (!still) { y.classList.remove('roll'); void y.offsetWidth; y.classList.add('roll'); }
    };
    const step = d => {
      const to = items[Math.max(0, Math.min(items.length - 1, front() + d))];
      row.scrollTo({ left: row.scrollLeft + to.getBoundingClientRect().left - row.getBoundingClientRect().left, behavior: still ? 'auto' : 'smooth' });
    };
    back.addEventListener('click', () => step(-1));
    on.addEventListener('click', () => step(1));
    row.addEventListener('scroll', () => requestAnimationFrame(show), { passive: true });
    show();
  });

  if (still || !('IntersectionObserver' in window)) return;
  // ---- Each part rises once as it arrives, a few at a time.
  const parts = [...main.querySelectorAll('.opening .places li, .wall h2, .wall .when, .canvas, .hang .year, .row-of li, .shot')];
  // A painting is hung whole: it waits until its picture has decoded (four seconds at most), so it never arrives half drawn.
  const whole = el => {
    const img = el.matches('.canvas, .row-of li') && el.querySelector('img');
    return img ? Promise.race([img.decode().catch(() => {}), new Promise(r => setTimeout(r, 4000))]) : Promise.resolve();
  };
  const rise = new IntersectionObserver(es => {
    let k = 0;
    es.filter(e => e.isIntersecting).forEach(e => {
      e.target.style.setProperty('--d', (k++ % 6) * 80 + 'ms');
      rise.unobserve(e.target);
      whole(e.target).then(() => e.target.classList.add('in'));
    });
  }, { rootMargin: '0px 0px -6% 0px' });
  parts.forEach(el => { el.classList.add('rise'); rise.observe(el); });
})();
