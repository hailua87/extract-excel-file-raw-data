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

// Build SKU → promo map by walking the text top-to-bottom.
// Promo lines apply to the SKU IMMEDIATELY ABOVE only.
// Recognized patterns (all variations of khuyến mãi keywords):
//   - "MUA X TANG Y (HKM NHAP GIA)"        e.g. "MUA 7 TANG 1 (HKM NHAP GIA)"
//   - "MUA X+Y (NHAP GIA)"                 e.g. "MUA 5+1 (NHAP GIA)"
//   - "Mua X+Y GIAM GIA"                   e.g. "Mua 05+01 GIAM GIA"
//   - "MUA X+Y GIAM GIA"                   e.g. "MUA 05T + 01T GIAM GIA"
//   - "Mua X chai tang Y hop tt"           e.g. "Mua 01 chai tang 1 hop tt"
//   - "X+Y GIAM GIA"  (no Mua prefix)      e.g. "2+1 GIAM GIA"
function buildPromoMap(text) {
  const lines = text.split("\n");
  const map = {};
  const skuRegex = /(\d{7}-\d)/;

  // Broad promo pattern: any line that starts with "MUA" (any case),
  // OR starts with "N+N GIAM GIA" pattern.
  // Excludes regular text lines like "Mot Hoa Don" because they don't start with MUA+number/space.
  const promoRegex = /^\s*(MUA\s+.+|\d+\s*\+\s*\d+\s+GIAM\s+GIA.*)$/i;

  // Collect SKUs in order with line index
  const skuLines = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(skuRegex);
    if (m && /EA\s+(C\d+|EA)/.test(lines[i])) {
      skuLines.push({ sku: m[1], lineIdx: i });
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Skip if this is an SKU line (false positive from broad regex)
    if (skuRegex.test(lines[i]) && /EA\s+(C\d+|EA)/.test(lines[i])) continue;

    const m = lines[i].match(promoRegex);
    if (!m) continue;

    // Normalize: collapse multiple spaces, trim
    const promoStr = m[1].replace(/\s+/g, " ").trim();

    // Find nearest SKU above
    let nearest = null;
    for (const s of skuLines) {
      if (s.lineIdx < i && (!nearest || s.lineIdx > nearest.lineIdx)) {
        nearest = s;
      }
    }
    if (nearest) {
      map[nearest.sku] = promoStr;
    }
  }

  return map;
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

  // Build promo map once for entire text
  const promoMap = buildPromoMap(text);

  return matches.map((m) => ({
    sku: m[1],
    description: m[2].trim().replace(/\s+/g, " "),
    buyCost: parseNum(m[3]),
    netBuyCost: parseNum(m[4]),
    qtyCS: parseNum(m[5]),
    qtyPCS: parseNum(m[6]),
    poNumber,
    poLocation,
    shipTo,
    promo: promoMap[m[1]] || "",
    notes,
    total,
    _source: fileName,
  }));
}
