// Parser for JDA POM343 Purchase Order text - handles both PDF text and OCR output

const NUM = "-?[\\d,]*\\.?\\.?\\d{2}";

// Standard JDA format
const SKU_PATTERN_STD = new RegExp(
  "(\\d{7}-\\d)\\s+" +
  "(.+?)\\s+" +
  "(?:\\d{10,})?\\s*" +
  "[EeBbmM][AaBb]\\s+(?:C\\d+|[EeBbmM][AaBb])\\s*" +
  `(${NUM})\\s+` +
  `(${NUM})\\s+` +
  `(${NUM})\\s+` +
  `(${NUM})\\s+` +
  `(?:${NUM})\\s+` +
  NUM,
  "g"
);

// Confirmation Report format
const SKU_PATTERN_CONFIRM = new RegExp(
  "(\\d{7}-\\d)\\s+" +
  "(.+?)\\s+" +
  "(?:\\d{10,})?\\s*" +
  "[EeBbmM][AaBb]\\s+[EeBbmM][AaBb]\\s+" +
  `(?:${NUM})\\s+` +
  `(${NUM})\\s+` +
  `(${NUM})\\s+` +
  `(${NUM})\\s+` +
  `(${NUM})\\s+` +
  `(?:${NUM})\\s+` +
  `(?:${NUM})\\s+` +
  NUM,
  "g"
);

function parseNum(s) {
  if (!s) return 0;
  let cleaned = s.replace(/,/g, "").trim();
  cleaned = cleaned.replace(/\.\.+/g, ".");
  if (cleaned.startsWith("-") && cleaned.length <= 3) cleaned = cleaned.substring(1);
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function extractShipTo(text) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/Ship\s+To\s*:/i.test(lines[i])) {
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        let next = lines[j];
        if (!next || !next.trim()) continue;
        next = next.replace(/\s{3,}(Status|Contact|Currency)\s*-.*$/i, "");
        const cand = next.replace(/\s+/g, " ").trim();
        if (cand && !/^(Status|Contact|Currency|Qty|Sell|SKU|Sub|Notes)/i.test(cand) && cand.length > 2) {
          return cand;
        }
        break;
      }
    }
  }
  // "Store-" line (Confirmation Report)
  for (const line of lines) {
    const m = line.match(/Store-?\s+\d+\s+(.+?)(?:\s{3,}|$)/i);
    if (m) return m[1].trim();
  }
  const patterns = [
    /(Trung\s+[Tt]am\s+[Pp]han\s+phoi\s+\S+(?:\s+\S+){0,2})/i,
    /(TTPP?\s+[A-Z\s/()]+?)(?:\s{2,}|$)/i,
    /(Co\.?op[Mm]art\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/,
    /(KHO\s+[A-Z\s]+?)(?:\s{2,}|$)/i,
    /(Trung\s+chuyen\s+\S+(?:\s*-\s*\d+)?)/i,
    /(Trung\s+tam\s+phan\s+phoi\s+\S+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return "";
}

// Extract Notes (chung cho cả PO): "Notes - Xin vui long ... Mot Hoa Don chi xuat cho mot PO"
function extractNotes(text) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const m = line.match(/Notes\s*-\s*(.+?)(?:\s{3,}\*|\s{3,}=|$)/);
    if (m) {
      let notes = m[1].trim();
      // Check next line(s) for continuation (e.g. "Mot Hoa Don chi xuat cho mot PO")
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const next = lines[j].trim();
        // Stop at FOB, Ship Via, etc.
        if (/^(FOB|Ship\s+Via|Ship\s+Point|Ship\s+Comment|Sub\s+Total|Total|\*+)/i.test(next)) break;
        if (!next) continue;
        // Skip lines that look like asterisks decoration
        if (/^\*+/.test(next)) break;
        notes += " " + next;
      }
      return notes.replace(/\s+/g, " ").trim();
    }
  }
  return "";
}

// Extract Total (cuối PO): "Total - 168,095,143.20" or "Total - .00"
function extractTotal(text) {
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (/Sub\s+Total/i.test(trimmed)) continue;
    // Allow ".00" or "123,456.00" format
    const m = trimmed.match(/^Total\s*-\s*([\d,]*\.?\d{2})/i);
    if (m) return parseNum(m[1]);
  }
  // Fallback search anywhere
  const allMatches = [...text.matchAll(/(\w+\s+)?Total\s*-\s*([\d,]*\.?\d{2})/gi)];
  for (const m of allMatches) {
    if (m[1] && /sub/i.test(m[1])) continue;
    return parseNum(m[2]);
  }
  return 0;
}

// Detect format
function isConfirmationFormat(text) {
  return /P\.?O\.?\s+Confirmation\s+Report/i.test(text) ||
         /Confirmation\s+Report\s+Request/i.test(text);
}

function runPattern(text, pattern) {
  const records = [];
  let m;
  pattern.lastIndex = 0;
  while ((m = pattern.exec(text)) !== null) {
    records.push(m);
    if (m.index === pattern.lastIndex) pattern.lastIndex++;
  }
  return records;
}

// Extract promo info that follows each SKU line
// Pattern: "MUA 7 TANG 1 (HKM NHAP GIA)" or "MUA / TANG 1 (HKM NHAP GIA)" etc.
function extractPromoForMatch(text, matchEndIdx) {
  // Look at next ~200 chars after the match for a promo line
  const lookahead = text.substring(matchEndIdx, matchEndIdx + 300);
  // Promo pattern: MUA <something> TANG <num> (HKM NHAP GIA) or similar
  const promoMatch = lookahead.match(/(MUA\s+\S+\s+TANG\s+\d+\s*\(HKM[^)]*\))/i);
  if (promoMatch) {
    return promoMatch[1].replace(/\s+/g, " ").trim();
  }
  return "";
}

export function parsePOText(text, fileName) {
  text = text.replace(/\x00/g, "");

  const poMatch = text.match(/P\s*[\/\\]\s*[O0]\.?\s+Number[:-]?\s+(\d+)/i);
  const poNumber = poMatch ? poMatch[1] : "";

  const locMatch = text.match(/P\s*[\/\\]\s*[O0]\.?\s+Location[:-]?\s+(\d+)/i);
  const poLocation = locMatch ? locMatch[1] : "";

  const shipTo = extractShipTo(text);
  const notes = extractNotes(text);
  const total = extractTotal(text);

  const stdMatches = runPattern(text, SKU_PATTERN_STD);
  const confirmMatches = runPattern(text, SKU_PATTERN_CONFIRM);

  let matches;
  if (isConfirmationFormat(text)) {
    matches = confirmMatches.length > 0 ? confirmMatches : stdMatches;
  } else {
    matches = stdMatches.length > 0 ? stdMatches : confirmMatches;
  }

  return matches.map((m) => {
    const matchEnd = m.index + m[0].length;
    const promo = extractPromoForMatch(text, matchEnd);
    return {
      sku: m[1],
      description: m[2].trim().replace(/\s+/g, " "),
      buyCost: parseNum(m[3]),
      netBuyCost: parseNum(m[4]),
      qtyCS: parseNum(m[5]),
      qtyPCS: parseNum(m[6]),
      poNumber,
      poLocation,
      shipTo,
      promo,         // NEW: HKM NHAP GIA info
      notes,         // NEW: Notes (shared across PO)
      total,         // NEW: PO Total (shared)
      _source: fileName,
    };
  });
}
