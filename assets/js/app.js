/* ========= CONFIG ========= */
const PDF_URL = "https://elijah-design.github.io/portfolio/assets/pdf/portfolio.pdf";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";


/* ========= Elements ========= */
const viewer = document.getElementById('viewer');
const stage = document.getElementById('stage');
const spreadEl = document.getElementById('spread');

const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const prevSideBtn = document.getElementById('prevSide');
const nextSideBtn = document.getElementById('nextSide');

const fitWBtn = document.getElementById('fitW');
const fitPBtn = document.getElementById('fitP');

const zInBtn = document.getElementById('zoomIn');
const zOutBtn = document.getElementById('zoomOut');
const preset = document.getElementById('preset');
const zLbl = document.getElementById('zoomLbl');
const centerBtn = document.getElementById('center');

const pageNumEl = document.getElementById('pageNum');
const pageCountEl = document.getElementById('pageCount');

const thumbsPanel = document.getElementById('thumbsPanel');
const thumbsEl = document.getElementById('thumbs');

const outlineBtn = document.getElementById('outlineBtn');
const outlinePanel = document.getElementById('outlinePanel');
const outlineList = document.getElementById('outlineList');

const thumbsToggle = document.getElementById('thumbsToggle');

/* ========= State ========= */
let pdfDoc = null;
let pageNum = 1;
let layoutBase = { width: 0, height: 0 };

let stageScale = 1, panX = 0, panY = 0;
let isPointerDown = false, startX = 0, startY = 0, startPanX = 0, startPanY = 0;
let pointers = new Map();

let outlineBuiltOnce = false;

/* ========= Performance knobs ========= */
const DPR = Math.max(1, Math.min((window.devicePixelRatio || 1), 1.5));
const PREVIEW_QUALITY = 0.45;
const FINAL_QUALITY = 0.90;
const SCALE_LEVELS = [0.75, 1, 1.5, 2, 3, 4];
const MAX_RENDER_SCALE = 2.0;

let currentLevelKey = null;
let mainRenderTasks = [];
let thumbRenderTasks = [];
let idleUpgradeTimer = null;

let wheelUpgradeTimer = null;

const rIC = window.requestIdleCallback || ((cb) =>
  setTimeout(() => cb({ didTimeout: true, timeRemaining: () => 0 }), 120)
);

/* ========= Page cache ========= */
const pageCache = new Map();
async function getPageCached(n) {
  if (pageCache.has(n)) return pageCache.get(n);
  const p = await pdfDoc.getPage(n);
  pageCache.set(n, p);
  return p;
}

/* ========= Helpers ========= */
function isSpreadLeft(n) {
  if (n === 1) return false;
  if (n >= 2 && n <= 35) return true;
  return (n > 1);
}

function normalizeLeft(n) {
  return n === 1 ? 1 : (n % 2 === 0 ? n : n - 1);
}

function currentIsSpread() { return isSpreadLeft(pageNum); }

function getScaledSize() {
  return { w: layoutBase.width * stageScale, h: layoutBase.height * stageScale };
}

function clampPan() {
  const vw = viewer.clientWidth, vh = viewer.clientHeight;
  const { w, h } = getScaledSize();
  const maxX = Math.max(0, (w - vw) / 2);
  const maxY = Math.max(0, (h - vh) / 2);
  panX = (w <= vw) ? 0 : Math.min(maxX, Math.max(-maxX, panX));
  panY = (h <= vh) ? 0 : Math.min(maxY, Math.max(-maxY, panY));
}

function applyTransform() {
  clampPan();
  stage.style.transform = `translate(-50%,-50%) translate(${panX}px, ${panY}px) scale(${stageScale})`;
  zLbl.textContent = Math.round(stageScale * 100) + "%";

  if (!isPointerDown && pointers.size < 2) {
    scheduleHiResIfNeeded();
  }
}

function fitWidth() {
  stageScale = Math.max(0.1, viewer.clientWidth / layoutBase.width);
  panX = panY = 0;
  applyTransform();
}

function fitPage() {
  const vw = viewer.clientWidth, vh = viewer.clientHeight;
  stageScale = Math.max(0.1, Math.min(vw / layoutBase.width, vh / layoutBase.height));
  panX = panY = 0;
  applyTransform();
}

function setZoom(newScale, px, py) {
  newScale = Math.max(0.1, Math.min(6, newScale));
  const rect = viewer.getBoundingClientRect();
  const cx = px - rect.left - rect.width / 2 - panX;
  const cy = py - rect.top - rect.height / 2 - panY;
  const factor = newScale / stageScale;
  panX = panX - cx * (factor - 1);
  panY = panY - cy * (factor - 1);
  stageScale = newScale;
  applyTransform();
}

function zoomLevelKey(scale) {
  let key = SCALE_LEVELS[0];
  for (const lvl of SCALE_LEVELS) {
    if (scale >= lvl) key = lvl;
    else break;
  }
  return key;
}

function targetRenderScale(qualityMultiplier) {
  const key = zoomLevelKey(stageScale);
  const wanted = DPR * key * qualityMultiplier;
  return Math.min(MAX_RENDER_SCALE, wanted);
}

function cancelMainInFlight() {
  mainRenderTasks.forEach(t => { try { t.cancel(); } catch { } });
  mainRenderTasks = [];
  if (idleUpgradeTimer) { clearTimeout(idleUpgradeTimer); idleUpgradeTimer = null; }
}

function setDockOpenState() {
  const open = outlinePanel.classList.contains('open') || thumbsPanel.classList.contains('open');
  document.body.classList.toggle('dock-open', open);
}

/* ========= Annotations ========= */
function addLink(annLay, x, y, w, h, url) {
  const a = document.createElement('a');
  a.className = 'pdf-link';
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  Object.assign(a.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  annLay.appendChild(a);
}

async function renderAnnotations(page, annLay, baseViewport) {
  annLay.replaceChildren();
  annLay.style.width = `${Math.round(baseViewport.width)}px`;
  annLay.style.height = `${Math.round(baseViewport.height)}px`;
  const annots = await page.getAnnotations();
  for (const a of annots) {
    if (a.subtype === 'Link' && (a.url || a.dest) && a.rect) {
      const rect = baseViewport.convertToViewportRectangle(a.rect);
      const [x1, y1, x2, y2] = rect;
      const x = Math.min(x1, x2), y = Math.min(y1, y2);
      const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
      addLink(annLay, x, y, w, h, a.url || '#');
    }
  }
}

/* ========= Rendering ========= */
async function renderPageInto(sub, page, base, renderScale) {
  const vp = page.getViewport({ scale: renderScale });

  const c = sub.querySelector('canvas') || document.createElement('canvas');
  const ann = sub.querySelector('.annLayer') || (() => {
    const d = document.createElement('div');
    d.className = 'annLayer';
    return d;
  })();

  c.width = Math.floor(vp.width);
  c.height = Math.floor(vp.height);

  c.style.width = Math.round(base.width) + "px";
  c.style.height = Math.round(base.height) + "px";

  if (!c.parentNode) sub.appendChild(c);
  if (!ann.parentNode) sub.appendChild(ann);

  const ctx = c.getContext('2d', { alpha: false, desynchronized: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);

  const task = page.render({ canvasContext: ctx, viewport: vp, intent: "display" });
  mainRenderTasks.push(task);
  await task.promise;
  await renderAnnotations(page, ann, base);
}

async function renderSpread(n, qualityMultiplier) {
  const spread = isSpreadLeft(n);
  const left = spread ? normalizeLeft(n) : 1;
  const pages = spread ? [left, Math.min(left + 1, pdfDoc.numPages)] : [1];

  spreadEl.replaceChildren();
  pageNumEl.textContent = spread ? `${pages[0]}–${pages[1]}` : "1";

  const page0 = await getPageCached(pages[0]);
  const base0 = page0.getViewport({ scale: 1 });

  layoutBase.width = base0.width * (spread ? 2 : 1);
  layoutBase.height = base0.height;

  for (let idx = 0; idx < pages.length; idx++) {
    const pNum = pages[idx];
    const p = (idx === 0) ? page0 : await getPageCached(pNum);
    const base = p.getViewport({ scale: 1 });
    const sub = document.createElement('div');
    sub.className = 'subpage';
    spreadEl.appendChild(sub);
    await renderPageInto(sub, p, base, targetRenderScale(qualityMultiplier));
  }

  pageNum = spread ? pages[0] : 1;
  applyTransform();

  getPageCached(Math.min(pdfDoc.numPages, pageNum + 2)).catch(() => { });
  getPageCached(Math.max(1, pageNum - 2)).catch(() => { });

  markActiveThumb(pageNum);
}

function scheduleHiResIfNeeded() {
  const key = zoomLevelKey(stageScale);
  if (key === currentLevelKey) return;

  if (idleUpgradeTimer) clearTimeout(idleUpgradeTimer);
  idleUpgradeTimer = setTimeout(async () => {
    currentLevelKey = key;
    cancelMainInFlight();
    const left = currentIsSpread() ? pageNum : 1;
    try { await renderSpread(left, FINAL_QUALITY); } catch { }
  }, 350);
}

async function renderViewFast(n) {
  currentLevelKey = null;
  cancelMainInFlight();
  await renderSpread(n, PREVIEW_QUALITY);
  rIC(() => scheduleHiResIfNeeded());
}

/* ========= Thumbnails ========= */
function buildThumbs() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(async entry => {
      if (!entry.isIntersecting) return;
      const holder = entry.target;
      io.unobserve(holder);

      const i = Number(holder.dataset.page);
      try {
        const p = await getPageCached(i);

        const maxW = Math.max(160, Math.min(240, (thumbsEl.clientWidth - 24) || 220));
        const vp1 = p.getViewport({ scale: 1 });
        const scale = Math.max(0.25, maxW / vp1.width);
        const vp = p.getViewport({ scale });

        const c = document.createElement('canvas');
        c.width = Math.floor(vp.width);
        c.height = Math.floor(vp.height);
        c.style.width = "100%";
        c.style.height = "auto";

        const tctx = c.getContext('2d', { alpha: false });
        tctx.fillStyle = "#fff";
        tctx.fillRect(0, 0, c.width, c.height);

        const task = p.render({ canvasContext: tctx, viewport: vp });
        thumbRenderTasks.push(task);
        await task.promise;

        holder.insertBefore(c, holder.firstChild);
      } catch { }
    });
  }, {
    root: thumbsPanel,
    rootMargin: "300px 0px",
    threshold: 0
  });

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const holder = document.createElement('div');
    holder.className = 'thumb';
    holder.title = `Page ${i}`;
    holder.dataset.page = String(i);
    holder.innerHTML = `<div class="num">${i}</div>`;
    thumbsEl.appendChild(holder);

    io.observe(holder);
    holder.addEventListener('click', () => goToPage(i));
  }
}

function markActiveThumb(n) {
  [...thumbsEl.children].forEach(el => {
    el.classList.toggle('active', Number(el.dataset.page) === n);
  });
}

/* ========= Outline ========= */
async function buildOutline() {
  if (outlineBuiltOnce) return;

  const outline = await pdfDoc.getOutline();
  if (!outline || !outline.length) {
    outlineList.innerHTML = '<li><em style="opacity:.7">No outline found in this PDF.</em></li>';
    outlineBuiltOnce = true;
    return;
  }

  const frag = document.createDocumentFragment();

  async function itemToLi(item, level = 1) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.textContent = item.title || '(untitled)';
    a.className = `lvl-${Math.min(level, 4)}`;
    a.href = '#';
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      const targetPage = await resolveDestToPage(item.dest, item.url);
      if (targetPage) {
        goToPage(targetPage);
        outlinePanel.classList.remove('open');
        outlineBtn.classList.remove('is-active');
        setDockOpenState();
      }
    });
    li.appendChild(a);
    frag.appendChild(li);

    if (item.items && item.items.length) {
      for (const child of item.items) {
        await itemToLi(child, level + 1);
      }
    }
  }

  for (const it of outline) {
    await itemToLi(it, 1);
  }

  outlineList.appendChild(frag);
  outlineBuiltOnce = true;
}

async function resolveDestToPage(dest, url) {
  if (url) {
    window.open(url, '_blank', 'noopener');
    return null;
  }
  try {
    let destArr = dest;
    if (typeof dest === 'string') {
      destArr = await pdfDoc.getDestination(dest);
    }
    if (Array.isArray(destArr) && destArr[0]) {
      const ref = destArr[0];
      const pageIndex = await pdfDoc.getPageIndex(ref);
      return pageIndex + 1;
    }
  } catch (e) {
    console.warn('Failed to resolve destination', e);
  }
  return null;
}

/* ========= Navigation ========= */
function goToPage(n) {
  n = Math.max(1, Math.min(pdfDoc.numPages, n));
  if (n === 1) {
    renderViewFast(1).then(fitPage);
  } else {
    const left = normalizeLeft(n);
    renderViewFast(left).then(fitPage);
  }
}

/* ========= UI Bindings ========= */
function bindUI() {
  const goPrev = () => {
    if (pageNum === 1) return;
    const step = currentIsSpread() ? 2 : 1;
    goToPage(Math.max(1, pageNum - step));
  };
  const goNext = () => {
    const step = currentIsSpread() ? 2 : 1;
    const target = Math.min(pdfDoc.numPages, pageNum + step);
    goToPage(target === 1 ? 2 : target);
  };

  prevBtn.onclick = goPrev;
  nextBtn.onclick = goNext;
  prevSideBtn.onclick = goPrev;
  nextSideBtn.onclick = goNext;

  fitWBtn.onclick = fitWidth;
  fitPBtn.onclick = fitPage;

  const cx = () => viewer.getBoundingClientRect().left + viewer.clientWidth / 2;
  const cy = () => viewer.getBoundingClientRect().top + viewer.clientHeight / 2;
  zInBtn.onclick = () => setZoom(stageScale * 1.2, cx(), cy());
  zOutBtn.onclick = () => setZoom(stageScale / 1.2, cx(), cy());
  preset.onchange = () => setZoom(parseFloat(preset.value), cx(), cy());
  centerBtn.onclick = () => { panX = 0; panY = 0; applyTransform(); };

  const isTouchUI = !window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function closeAllPanels() {
    outlinePanel.classList.remove('open');
    thumbsPanel.classList.remove('open');

    outlineBtn.classList.remove('is-active');
    thumbsToggle.classList.remove('is-active');

    outlineBtn.setAttribute('aria-expanded', "false");
    thumbsToggle.setAttribute('aria-expanded', "false");

    setDockOpenState();
  }

  async function openOutline() {
    thumbsPanel.classList.remove('open');
    thumbsToggle.classList.remove('is-active');
    thumbsToggle.setAttribute('aria-pressed', "false");

    outlinePanel.classList.add('open');
    outlineBtn.classList.add('is-active');
    outlineBtn.setAttribute('aria-expanded', "true");

    if (!outlineBuiltOnce) await buildOutline();
    setDockOpenState();
  }

  function openThumbs() {
    outlinePanel.classList.remove('open');
    outlineBtn.classList.remove('is-active');
    outlineBtn.setAttribute('aria-expanded', "false");

    thumbsPanel.classList.add('open');
    thumbsToggle.classList.add('is-active');
    thumbsToggle.setAttribute('aria-pressed', "true");

    setDockOpenState();
  }

  if (!isTouchUI) {
    let closeTimer = null;
    const cancelClose = () => { if (closeTimer) clearTimeout(closeTimer); };
    const scheduleClose = () => { cancelClose(); closeTimer = setTimeout(closeAllPanels, 140); };

    outlineBtn.addEventListener('mouseenter', () => { cancelClose(); openOutline(); });
    thumbsToggle.addEventListener('mouseenter', () => { cancelClose(); openThumbs(); });

    document.querySelector('.left-dock')?.addEventListener('mouseenter', cancelClose);
    document.querySelector('.left-dock')?.addEventListener('mouseleave', scheduleClose);

    outlinePanel.addEventListener('mouseenter', cancelClose);
    outlinePanel.addEventListener('mouseleave', scheduleClose);

    thumbsPanel.addEventListener('mouseenter', cancelClose);
    thumbsPanel.addEventListener('mouseleave', scheduleClose);
  } else {
    outlineBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const willOpen = !outlinePanel.classList.contains('open');
      if (willOpen) await openOutline();
      else closeAllPanels();
    });

    thumbsToggle.addEventListener('click', (e) => {
      e.preventDefault();
      const willOpen = !thumbsPanel.classList.contains('open');
      if (willOpen) openThumbs();
      else closeAllPanels();
    });

    document.addEventListener('click', (e) => {
      const inDock = e.target.closest('.left-dock');
      const inPanels = e.target.closest('#outlinePanel') || e.target.closest('#thumbsPanel');
      if (!inDock && !inPanels) closeAllPanels();
    });
  }

  // Pointer pan/pinch
  stage.addEventListener('pointer





