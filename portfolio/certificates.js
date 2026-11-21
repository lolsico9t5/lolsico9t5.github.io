const grid = document.querySelector(".cert-grid");

if (grid && typeof HTMLDialogElement !== "undefined" && HTMLDialogElement.prototype.showModal) {
  const dialog = document.createElement("dialog");
  dialog.className = "cert-viewer";
  dialog.setAttribute("aria-labelledby", "cert-viewer-title");
  dialog.innerHTML = `
    <header>
      <h2 id="cert-viewer-title"></h2>
      <form method="dialog"><button autofocus>Close</button></form>
    </header>
    <div class="cert-sheet" tabindex="0" role="region" aria-label="Certificate image"><img alt=""></div>
    <footer>
      <button type="button" aria-pressed="false">Zoom in</button>
      <a class="cert-download" download>Download PDF</a>
      <a class="cert-verify" target="_blank" rel="noopener">Verify</a>
    </footer>`;
  document.body.append(dialog);

  const sheet = dialog.querySelector(".cert-sheet");
  const image = sheet.querySelector("img");
  const zoom = dialog.querySelector("button[aria-pressed]");
  let opener;

  function setZoom(enlarged) {
    sheet.toggleAttribute("data-zoom", enlarged);
    zoom.setAttribute("aria-pressed", String(enlarged));
    zoom.textContent = enlarged ? "Fit to screen" : "Zoom in";
    sheet.scrollTo(0, 0);
  }

  grid.addEventListener("click", event => {
    const link = event.target.closest("a");
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const card = link.closest("td");
    const paper = card?.querySelector("a");
    if (!paper || link.href !== paper.href) return;

    event.preventDefault();
    opener = link;
    const title = card.querySelector("strong").textContent;
    const pdf = paper.getAttribute("href");
    dialog.querySelector("h2").textContent = title;
    image.alt = title + " certificate for Benjamin Franklin A";
    image.src = paper.dataset.scan || pdf.replace(/\.pdf$/i, "-full.webp");
    const download = dialog.querySelector(".cert-download");
    download.href = paper.dataset.download || pdf;
    download.download = pdf.split("/").pop();
    dialog.querySelector(".cert-verify").href = card.querySelector("span a:last-child").href;
    setZoom(false);
    dialog.showModal();
  });

  zoom.addEventListener("click", () => setZoom(!sheet.hasAttribute("data-zoom")));
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener("close", () => opener?.focus({preventScroll: true}));
}
