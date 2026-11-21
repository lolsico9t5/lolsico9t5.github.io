// Each site reads the same published SVG as the profile README.
const card = document.querySelector('img[data-live-streak], img[src$="/activity-card/github-streak.svg"]');
if (card) {
  const url = card.dataset.liveStreak || card.src;
  const interval = 15 * 60 * 1000;
  let last = -1;
  async function refresh() {
    const period = Math.floor(Date.now()/interval);
    if (document.hidden || last === period) return;
    last = period;
    const image = new Image();
    image.src = url + "?period=" + period;
    try {
      await image.decode();
      if (last === period) card.src = image.src;
    } catch { /* Continue showing the last loaded card if the network is offline. */ }
  }
  refresh();
  document.addEventListener("visibilitychange", refresh);
  window.setInterval(refresh, interval);
}
