{\rtf1}const pdfUrl = './pdf/portfolio.pdf';

const pageFlip = new St.PageFlip(
  document.getElementById("flipbook"),
  {
    width: 550,
    height: 700,
    size: "stretch",
    maxShadowOpacity: 0.25,
    showCover: true,
    mobileScrollSupport: false,
    useMouseEvents: true
  }
);

pdfjsLib.getDocument(pdfUrl).promise.then(pdf => {
  const pages = [];

  const renderPage = num => {
    return pdf.getPage(num).then(page => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      const viewport = page.getViewport({ scale: 2 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      return page.render({ canvasContext: ctx, viewport }).promise.then(() => {
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

  Promise.all(renders).then(() => {
    pageFlip.loadFromHTML(pages);
  });
});
