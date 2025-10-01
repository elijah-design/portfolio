const PDF_URL = "https://cdn.jsdelivr.net/gh/elijah-design/portfolio/cv%20portfolio%20spread.pdf";
const DOWNLOAD_PASSWORD = "Portfolio2025";

const bookEl = document.getElementById('book');
let pdfDoc = null;
let pagesCanvases = [];

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = "libs/pdf.worker.min.js";

// Load PDF
pdfjsLib.getDocument({ url: PDF_URL, password: DOWNLOAD_PASSWORD }).promise
  .then(doc => {
    pdfDoc = doc;
    return renderAllPages();
  })
  .then(() => {
    initializePageFlip();
  })
  .catch(err => {
    console.error("PDF load error:", err);
    bookEl.innerText = "Failed to load PDF.";
  });

async function renderAllPages() {
  const num = pdfDoc.numPages;
  for (let i = 1; i <= num; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    pagesCanvases.push(canvas);
  }
}

// Initialize the flipbook using page-flip
function initializePageFlip() {
  // Create PageFlip instance
  const pageFlip = new St.PageFlip(bookEl, {
    width: bookEl.clientWidth,
    height: bookEl.clientHeight,
    size: "fixed",
    drawShadow: true,
    flippingTime: 800,
    showCover: false
  });

  // Convert canvases to images or HTML elements
  const pageElements = pagesCanvases.map(canvas => {
    const wrapper = document.createElement('div');
    wrapper.classList.add('page-content');
    wrapper.appendChild(canvas);
    return wrapper;
  });

  pageFlip.loadFromHTML(pageElements);
}
