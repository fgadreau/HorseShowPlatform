import { normalizeGvlUrl } from './gvlUrl';

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 8_000_000;
type QrReader = typeof import('jsqr')['default'];

function readQr(context: CanvasRenderingContext2D, width: number, height: number, jsQR: QrReader) {
  const pixels = context.getImageData(0, 0, width, height);
  // A certificate may also contain a clinic QR. Ignore unrelated codes and continue reading.
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = jsQR(pixels.data, width, height, { inversionAttempts: 'attemptBoth' });
    if (!code) return null;
    const url = normalizeGvlUrl(code.data, false);
    if (url) return url;
    const corners = [code.location.topLeftCorner,code.location.topRightCorner,code.location.bottomLeftCorner,code.location.bottomRightCorner];
    const left = Math.max(0, Math.floor(Math.min(...corners.map(p => p.x))) - 4);
    const top = Math.max(0, Math.floor(Math.min(...corners.map(p => p.y))) - 4);
    const right = Math.min(width, Math.ceil(Math.max(...corners.map(p => p.x))) + 4);
    const bottom = Math.min(height, Math.ceil(Math.max(...corners.map(p => p.y))) + 4);
    for (let y = top; y < bottom; y++) pixels.data.fill(255, (y * width + left) * 4, (y * width + right) * 4);
  }
  return null;
}

function urlFromText(text: string) {
  for (const match of text.matchAll(/(?:https?:\/\/)?(?:(?:www\.)?gvlcertcheck\.ai\/check|user\.globalvetlink\.com\/gvl2\/check)\/[0-9a-f-]+/gi)) {
    const url = normalizeGvlUrl(match[0], false);
    if (url) return url;
  }
  return null;
}

export async function extractGvlUrlFromFile(file: File) {
  if (file.size > MAX_BYTES) throw new Error('Le document Coggins dépasse 20 Mo. / Coggins document exceeds 20 MB.');
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  if (!isPdf && !isImage) throw new Error('Ajoute un PDF ou une image JPG/PNG/WebP. / Upload a PDF or JPG/PNG/WebP image.');
  const jsQR = (await import('jsqr')).default;
  if (isImage) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    try {
      const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (bitmap.width * bitmap.height)));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d', {willReadFrequently:true});
      if (ctx) {ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);const url = readQr(ctx,canvas.width,canvas.height,jsQR);if(url)return url;}
    } finally {bitmap.close();canvas.width=0;canvas.height=0;}
  } else {
    const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'),import('pdfjs-dist/build/pdf.worker.mjs?url')]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const loading = pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});
    try {
      const pdf = await loading.promise;
      if (pdf.numPages > 40) throw new Error('Le document Coggins contient trop de pages pour une lecture automatique. / Too many pages for automatic Coggins scanning.');
      // SmartCert puts the QR on the last page. Read that page first, then check the others.
      const pages = [pdf.numPages,...Array.from({length:pdf.numPages-1},(_,i)=>i+1)];
      for (const number of pages) {
        const page = await pdf.getPage(number);
        try {
          for (const annotation of await page.getAnnotations()) {
            const url = typeof annotation.url==='string' ? normalizeGvlUrl(annotation.url,false) : null;
            if(url)return url;
          }
          const text = await page.getTextContent();
          const url = urlFromText(text.items.map(item=>'str' in item?item.str:'').join(' '));
          if(url)return url;
          for (const requestedScale of [2,3,4]) {
            const base = page.getViewport({scale:1});
            const scale = Math.min(requestedScale,Math.sqrt(MAX_PIXELS/(base.width*base.height)));
            const viewport = page.getViewport({scale});
            const canvas = document.createElement('canvas');
            try {
              // First scan only the lower-right quadrant; it avoids other QR codes and saves mobile memory.
              for (const crop of [true,false]) {
                if(!crop && requestedScale!==2)continue;
                const x=crop?Math.floor(viewport.width/2):0;const y=crop?Math.floor(viewport.height/2):0;
                canvas.width=Math.ceil(viewport.width-x);canvas.height=Math.ceil(viewport.height-y);
                const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)continue;
                await page.render({canvas,canvasContext:ctx,viewport,transform:[1,0,0,1,-x,-y]}).promise;
                const found=readQr(ctx,canvas.width,canvas.height,jsQR);if(found)return found;
              }
            } finally {canvas.width=0;canvas.height=0;}
          }
        } finally {page.cleanup();}
      }
    } finally {await loading.destroy();}
  }
  throw new Error('QR GVL non détecté : le document peut être envoyé en révision, sans copier de lien. / No GVL QR detected: the document can be submitted for review without copying a link.');
}
export const extractGvlUrlFromPdf = extractGvlUrlFromFile;
