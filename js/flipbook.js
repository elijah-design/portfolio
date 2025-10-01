const PDF_URL = "https://cdn.jsdelivr.net/gh/elijah-design/portfolio/cv%20portfolio%20spread.pdf";
const DOWNLOAD_PASSWORD = "Portfolio2025";

const bookEl = document.getElementById('book');
let pdfDoc = null;
let pagesCanvases = [];

if (!pdfjsLib || !St || !St.PageFlip) {
  console.error("Libraries not loaded correctly.");
  bookEl.innerText = "Flipbook initialization error.";
} else {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "libs/pdf.worker.min.js";

  pdfjsLib.getDocument({ url: PDF_URL, password: DOWNLOAD_PASSWORD }).promise
    .then(doc => {
      pdfDoc = doc;
      console.log("PDF loaded:", doc.numPages, "pages");
      return renderAllPages();
    })
    .then(() => {
      if (pagesCanvases.length === 0) {
        bookEl.innerText = "Failed to render PDF pages.";
        return;
      }
      initializePageFlip();
    })
    .catch(err => {
      console.error("PDF.js error:", err);
      bookEl.innerText = "Error loading PDF.";
    });

  async function renderAllPages() {
    const num = pdfDoc.numPages;
    for (let i = 1; i <= num; i++) {
      try {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        pagesCanvases.push(canvas);
      } catch (err) {
        console.error("Error rendering page", i, err);
      }
    }
  }

  function initializePageFlip() {
    const pageFlip = new St.PageFlip(bookEl, {
      width: bookEl.clientWidth,
      height: bookEl.clientHeight,
      size: "fixed",
      drawShadow: true,
      flippingTime: 800,
      showCover: false
    });

    const pageElements = pagesCanvases.map(canvas => {
      const wrapper = document.createElement('div');
      wrapper.classList.add('page-content');
      wrapper.appendChild(canvas);
      return wrapper;
    });

    pageFlip.loadFromHTML(pageElements);
  }
}
