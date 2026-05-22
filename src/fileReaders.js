import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { createWorker } from "tesseract.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// Reusable Tesseract worker (initialized lazily on first use)
let ocrWorker = null;

async function getOcrWorker(onProgress) {
  if (ocrWorker) return ocrWorker;
  if (onProgress) onProgress("Khởi tạo OCR engine (chỉ lần đầu)...");
  ocrWorker = await createWorker(["eng", "vie"], 1, {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) {
        onProgress(`OCR: ${Math.round(m.progress * 100)}%`);
      }
    },
  });
  return ocrWorker;
}

// Read text from PDF using PDF.js with rotation-aware layout
async function readPDFText(pdf) {
  let text = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    const items = content.items.map((item) => {
      const [a, b, c, d, e, f] = item.transform;
      let lineKey, colKey;
      if (Math.abs(a) < 0.01 && Math.abs(d) < 0.01) {
        lineKey = Math.round(e);
        colKey = f;
      } else {
        lineKey = Math.round(f);
        colKey = e;
      }
      return {
        lineKey,
        colKey,
        text: item.str,
        w: item.width || item.str.length * 4,
      };
    });

    const lines = {};
    for (const it of items) {
      if (!lines[it.lineKey]) lines[it.lineKey] = [];
      lines[it.lineKey].push(it);
    }

    const sortedKeys = Object.keys(lines).map(Number).sort((a, b) => a - b);

    for (const k of sortedKeys) {
      const lineItems = lines[k].sort((a, b) => a.colKey - b.colKey);
      let lineText = "";
      let lastEnd = 0;
      for (let j = 0; j < lineItems.length; j++) {
        const it = lineItems[j];
        if (j === 0) {
          lineText = it.text;
          lastEnd = it.colKey + it.w;
        } else {
          const gap = it.colKey - lastEnd;
          const spaces = Math.max(1, Math.round(gap / 3));
          lineText += " ".repeat(spaces) + it.text;
          lastEnd = it.colKey + it.w;
        }
      }
      text += lineText + "\n";
    }
  }

  return text;
}

// Render a PDF page to canvas at high resolution for OCR
async function renderPageToCanvas(page, scale = 2) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

// OCR a scanned PDF page-by-page with Tesseract.js
async function ocrPDF(pdf, onProgress) {
  const worker = await getOcrWorker(onProgress);
  let allText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    if (onProgress) onProgress(`OCR page ${pageNum}/${pdf.numPages}...`);
    const page = await pdf.getPage(pageNum);
    const canvas = await renderPageToCanvas(page, 2);
    const { data } = await worker.recognize(canvas);
    allText += data.text + "\n\n";
  }

  return allText;
}

async function readPDF(file, onProgress) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;

  // First try to extract text directly (fast path)
  const text = await readPDFText(pdf);

  // If too little text, it's a scanned PDF — use OCR
  if (text.replace(/\s/g, "").length < 100) {
    if (onProgress) onProgress("Scanned PDF, đang OCR...");
    return await ocrPDF(pdf, onProgress);
  }

  return text;
}

async function readDOCX(file) {
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return result.value;
}

async function readDOC(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let text = "";
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if ((c >= 0x20 && c <= 0x7e) || c === 0x09 || c === 0x0a || c === 0x0d) {
      text += String.fromCharCode(c);
    } else {
      text += " ";
    }
  }
  const runs = text.match(/[\x20-\x7E\t\n\r]{4,}/g) || [];
  return runs.join("\n");
}

async function readTXT(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buf.slice(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buf.slice(2));
  }
  let nullCount = 0;
  for (let i = 0; i < Math.min(100, bytes.length); i++) {
    if (bytes[i] === 0) nullCount++;
  }
  if (nullCount > 20) return new TextDecoder("utf-16le").decode(buf);
  return new TextDecoder("utf-8").decode(buf);
}

async function readExcel(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  let text = "";
  for (const name of wb.SheetNames) {
    text += XLSX.utils.sheet_to_csv(wb.Sheets[name]) + "\n";
  }
  return text;
}

export async function extractText(file, onProgress) {
  const ext = file.name.split(".").pop().toLowerCase();

  switch (ext) {
    case "pdf":
      return readPDF(file, onProgress);
    case "docx":
      return readDOCX(file);
    case "doc":
      return readDOC(file);
    case "txt":
      return readTXT(file);
    case "xlsx":
    case "xls":
    case "csv":
      return readExcel(file);
    default:
      throw new Error(`Định dạng không hỗ trợ: .${ext}`);
  }
}

// Cleanup function (optional - call on app unmount)
export async function cleanupOCR() {
  if (ocrWorker) {
    await ocrWorker.terminate();
    ocrWorker = null;
  }
}
