import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { createWorker } from "tesseract.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

let ocrWorker = null;

async function getOcrWorker(onProgress) {
  if (ocrWorker) return ocrWorker;
  if (onProgress) onProgress("Tải OCR engine (~30s, chỉ lần đầu)...");
  ocrWorker = await createWorker(["eng"], 1, { logger: () => {} });
  return ocrWorker;
}

// Read text from PDF text layer
async function readPDFText(pdf) {
  let text = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const items = content.items.map((item) => {
      const [a, b, c, d, e, f] = item.transform;
      let lineKey, colKey;
      if (Math.abs(a) < 0.01 && Math.abs(d) < 0.01) {
        lineKey = Math.round(e); colKey = f;
      } else {
        lineKey = Math.round(f); colKey = e;
      }
      return { lineKey, colKey, text: item.str, w: item.width || item.str.length * 4 };
    });
    const lines = {};
    for (const it of items) {
      if (!lines[it.lineKey]) lines[it.lineKey] = [];
      lines[it.lineKey].push(it);
    }
    const sortedKeys = Object.keys(lines).map(Number).sort((a, b) => a - b);
    for (const k of sortedKeys) {
      const lineItems = lines[k].sort((a, b) => a.colKey - b.colKey);
      let lineText = "", lastEnd = 0;
      for (let j = 0; j < lineItems.length; j++) {
        const it = lineItems[j];
        if (j === 0) { lineText = it.text; lastEnd = it.colKey + it.w; }
        else {
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

async function renderPageToCanvas(page, scale, rotation = 0) {
  const viewport = page.getViewport({ scale, rotation });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

// Score OCR text by counting expected markers
function scoreOcrText(text) {
  const markers = [
    "P/O Number", "P/O Location", "Ship To",
    "Purchase Order", "SKU Number", "Vendor",
    "Buy Cost", "Net Buy", "Description"
  ];
  let score = 0;
  for (const m of markers) {
    if (text.includes(m)) score += 2;
    else if (text.toLowerCase().includes(m.toLowerCase())) score += 1;
  }
  if (/\d{7}-\d/.test(text)) score += 3;
  return score;
}

// Robust OCR with rotation detection + progressive scale
async function ocrPageRobust(page, worker, onProgress) {
  let bestText = "";
  let bestScore = -1;

  // First: try all 4 rotations at low scale (1.5x) to find correct orientation
  const rotations = [0, 90, 180, 270];
  let bestRotation = 0;

  for (const rot of rotations) {
    if (onProgress) onProgress(`Detect orientation (${rot}°)...`);
    const canvas = await renderPageToCanvas(page, 1.5, rot);
    const { data } = await worker.recognize(canvas);
    const score = scoreOcrText(data.text);
    if (score > bestScore) {
      bestScore = score;
      bestRotation = rot;
      bestText = data.text;
    }
  }

  // Found a workable rotation? Re-OCR at higher resolution for accuracy
  if (bestScore >= 4) {
    // Always retry at higher scale - quality matters more than speed for these 3 files
    if (onProgress) onProgress(`OCR rotation ${bestRotation}° @ 3x (high quality)...`);
    const canvas = await renderPageToCanvas(page, 3, bestRotation);
    const { data } = await worker.recognize(canvas);
    const score = scoreOcrText(data.text);
    if (score >= bestScore) {
      bestScore = score;
      bestText = data.text;
    }
  } else {
    // Low confidence - try higher scale on each rotation to be sure
    if (onProgress) onProgress("Low quality detected, trying higher resolution...");
    for (const rot of rotations) {
      const canvas = await renderPageToCanvas(page, 3, rot);
      const { data } = await worker.recognize(canvas);
      const score = scoreOcrText(data.text);
      if (score > bestScore) {
        bestScore = score;
        bestRotation = rot;
        bestText = data.text;
      }
    }
  }

  return bestText;
}

async function ocrPDF(pdf, onProgress) {
  const worker = await getOcrWorker(onProgress);
  let allText = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const text = await ocrPageRobust(page, worker, (stage) => {
      if (onProgress) onProgress(`Page ${pageNum}/${pdf.numPages}: ${stage}`);
    });
    allText += text + "\n\n";
  }
  return allText;
}

async function readPDF(file, onProgress) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const text = await readPDFText(pdf);
  if (text.replace(/\s/g, "").length < 100) {
    if (onProgress) onProgress("Scanned PDF, starting OCR...");
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
    if ((c >= 0x20 && c <= 0x7e) || c === 0x09 || c === 0x0a || c === 0x0d) text += String.fromCharCode(c);
    else text += " ";
  }
  const runs = text.match(/[\x20-\x7E\t\n\r]{4,}/g) || [];
  return runs.join("\n");
}

async function readTXT(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf.slice(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(buf.slice(2));
  let nullCount = 0;
  for (let i = 0; i < Math.min(100, bytes.length); i++) if (bytes[i] === 0) nullCount++;
  if (nullCount > 20) return new TextDecoder("utf-16le").decode(buf);
  return new TextDecoder("utf-8").decode(buf);
}

async function readExcel(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  let text = "";
  for (const name of wb.SheetNames) text += XLSX.utils.sheet_to_csv(wb.Sheets[name]) + "\n";
  return text;
}

export async function extractText(file, onProgress) {
  const ext = file.name.split(".").pop().toLowerCase();
  switch (ext) {
    case "pdf": return readPDF(file, onProgress);
    case "docx": return readDOCX(file);
    case "doc": return readDOC(file);
    case "txt": return readTXT(file);
    case "xlsx":
    case "xls":
    case "csv": return readExcel(file);
    default: throw new Error(`Định dạng không hỗ trợ: .${ext}`);
  }
}

export async function cleanupOCR() {
  if (ocrWorker) { await ocrWorker.terminate(); ocrWorker = null; }
}
