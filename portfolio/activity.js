// Each site reads the same published SVG as the profile README.
const card = document.querySelector('img[data-live-streak], img[src$="/activity-card/github-streak.svg"]');
if (card) {
  const url = card.dataset.liveStreak || card.src;
  const interval = 5 * 60 * 1000;
  let last = -1;
  let nearby = false;
  async function refresh() {
    const period = Math.floor(Date.now()/interval);
    if (!nearby || document.hidden || last === period) return;
    last = period;
    const image = new Image();
    image.src = url + "?period=" + period;
    try {
      await image.decode();
      if (last === period) card.src = image.src;
    } catch {
      if (last === period) last = -1;
      if (!card.naturalWidth && card.dataset.streakFallback) card.src = card.dataset.streakFallback;
    }
  }
  new IntersectionObserver(([entry])=>{
    nearby=entry.isIntersecting;
    if(nearby) refresh();
  },{rootMargin:"450px"}).observe(card);
  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("online", refresh);
  window.addEventListener("focus", refresh);
  window.setInterval(refresh, interval);
}
