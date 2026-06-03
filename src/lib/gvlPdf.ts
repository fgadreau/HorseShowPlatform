const GVL_CHECK_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export async function extractGvlUrlFromPdf(file: File) {
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    throw new Error("Le fichier Coggins doit etre un PDF.");
  }

  const { getDocument, jsQR } = await loadPdfQrTools();
  const pdf = await getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise;

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);

      for (const scale of [2, 3, 4]) {
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { willReadFrequently: true });

        if (!context) {
          continue;
        }

        await page.render({
          canvas,
          canvasContext: context,
          viewport,
        }).promise;

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "attemptBoth",
        });
        const url = normalizeGvlUrl(qrCode?.data);

        if (url) {
          return url;
        }
      }
    }
  } finally {
    await pdf.destroy();
  }

  throw new Error("Aucun code QR GVL lisible trouve dans ce PDF.");
}

export function normalizeGvlUrl(value: string | null | undefined) {
  const uuid = value?.match(GVL_CHECK_RE)?.[0].toLowerCase();
  return uuid ? `https://gvlcertcheck.ai/check/${uuid}` : null;
}

async function loadPdfQrTools() {
  const [pdfjs, jsQrModule, pdfWorkerModule] = await Promise.all([
    import("pdfjs-dist"),
    import("jsqr"),
    import("pdfjs-dist/build/pdf.worker.mjs?url"),
  ]);

  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerModule.default;

  return {
    getDocument: pdfjs.getDocument,
    jsQR: jsQrModule.default,
  };
}
