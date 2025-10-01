const PDF_URL = "https://cdn.jsdelivr.net/gh/elijah-design/portfolio/cv%20portfolio%20spread.pdf";
const DOWNLOAD_PASSWORD = "Portfolio2025";

const container = document.getElementById('book');
let pdfDoc = null;
let pages = [];

// PDF.js setup
pdfjsLib.GlobalWorkerOptions.workerSrc = "libs/pdf.worker.min.js";

pdfjsLib.getDocument({ url: PDF_URL, password: DOWNLOAD_PASSWORD }).promise
  .then(doc => {
    pdfDoc = doc;
    return loadPages();
  })
  .then(() => {
    setupFlipLogic();
  })
  .catch(err => {
    console.error("Error loading PDF:", err);
    container.innerText = "Failed to load PDF.";
  });

async function loadPages() {
  const count = pdfDoc.numPages;
  for (let i = 1; i <= count; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    const pageDiv = document.createElement('div');
    pageDiv.classList.add('page', 'front', 'hidden');
    pageDiv.style.width = viewport.width + "px";
    pageDiv.style.height = viewport.height + "px";
    pageDiv.appendChild(canvas);

    container.appendChild(pageDiv);
    pages.push(pageDiv);
  }

  // mark the first page visible
  if (pages.length > 0) {
    pages[0].classList.remove('hidden');
    pages[0].classList.add('visible');
  }
}

function setupFlipLogic() {
  pages.forEach((pg, idx) => {
    pg.addEventListener('click', () => {
      // flip this page
      if (!pg.classList.contains('flipped')) {
        pg.classList.add('flipped');
        pg.classList.remove('visible');
        pg.classList.add('hidden');
        // reveal next page if exists
        const next = pages[idx + 1];
        if (next) {
          next.classList.remove('hidden');
          next.classList.add('visible');
        }
      } else {
        // flip back
        pg.classList.remove('flipped');
        pg.classList.remove('visible');
        pg.classList.add('hidden');
        // show previous page
        const prev = pages[idx - 1];
        if (prev) {
          prev.classList.remove('hidden');
          prev.classList.add('visible');
        }
      }
    });
  });
}
