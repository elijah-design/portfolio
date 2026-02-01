const container = document.getElementById("flipbook");

// Show a basic loading message (this will be overwritten on success)
container.innerHTML = '<div style="padding:16px; font-family: Montserrat, sans-serif; color:#444;">Loading portfolio…</div>';

// Configure PDF.js worker (must match the script in index.html)
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
} else {
  container.innerHTML = "<p style='padding:16px; color:#b00; font-family: Montserrat, sans-serif;'>Error: PDF.js failed to load.</p>";
}

// Path to your PDF
const pdfUrl = "./portfolio.pdf";


// If PDF.js is available, try to render
if (window.pdfjsLib) {
  pdfjsLib
    .getDocument(pdfUrl)
    .promise.then((pdf) => {
      const pages = [];

      const renderPage = (num) => {
        return pdf.getPage(num).then((page) => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          const viewport = page.getViewport({ scale: 2 });
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          return page
            .render({ canvasContext: ctx, viewport })
            .promise.then(() => {
              const img = document.createElement("img");
              img.src = canvas.toDataURL("image/jpeg", 0.95);
              img.classList.add("page");
              img.setAttribute("data-page", num);
              pages.push(img);
            });
        });
      };

      const renders = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        renders.push(renderPage(i));
      }

      return Promise.all(renders).then(() => {
        // Clear loading text
        container.innerHTML = "";

        // Init flipbook
        const pageFlip = new St.PageFlip(container, {
          width: 550,
          height: 700,
          size: "stretch",
          maxShadowOpacity: 0.15,
          showCover: true,
          mobileScrollSupport: false,
          useMouseEvents: true,
        });

        pageFlip.loadFromHTML(pages);
      });
    })
    .catch((err) => {
      container.innerHTML =
        "<p style='padding:16px; color:#b00; font-family: Montserrat, sans-serif;'>Error loading PDF: " +
        (err && err.message ? err.message : String(err)) +
        "</p>";
    });
}


