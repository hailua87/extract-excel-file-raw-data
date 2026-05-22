// Parser for JDA POM343 Purchase Order text - handles both PDF text and OCR output

// Number pattern - allows OCR artifacts like "-00" (missing dot), "34400..00" (extra dot)
const NUM = "-?[\\d,]*\\.?\\.?\\d{2}";

// Standard JDA format: SKU Desc EA C12/EA Buy Net CS Pcs Rec Ext
// OCR may garble "EA" as "EBA", "mA", "BA" - so we accept variants
const SKU_PATTERN_STD = new RegExp(
  "(\\d{7}-\\d)\\s+" +
  "(.+?)\\s+" +
  "(?:\\d{10,})?\\s*" +
  "[EeBbmM][AaBb]\\s+(?:C\\d+|[EeBbmM][AaBb])\\s*" +  // Tolerant EA matching
  `(${NUM})\\s+` +              // Buy Cost
  `(${NUM})\\s+` +              // Net Buy Cost
  `(${NUM})\\s+` +              // Qty CS
  `(${NUM})\\s+` +              // Qty Pcs
  `(?:${NUM})\\s+` +            // Qty Rec (skip)
  NUM,                            // Extended (skip)
  "g"
);

// Confirmation Report format: SKU Desc EA EA Sell Buy Net CS Pcs Rec SellExt BuyExt
const SKU_PATTERN_CONFIRM = new RegExp(
  "(\\d{7}-\\d)\\s+" +
  "(.+?)\\s+" +
  "(?:\\d{10,})?\\s*" +
  "[EeBbmM][AaBb]\\s+[EeBbmM][AaBb]\\s+" +
  `(?:${NUM})\\s+` +            // Sell Cost (skip)
  `(${NUM})\\s+` +              // Buy Cost
  `(${NUM})\\s+` +              // Net Buy
  `(${NUM})\\s+` +              // Qty CS
  `(${NUM})\\s+` +              // Qty Pcs
  `(?:${NUM})\\s+` +            // Qty Rec
  `(?:${NUM})\\s+` +            // Sell Extended (skip)
  NUM,                            // Buy Extended
  "g"
);

function parseNum(s) {
  if (!s) return 0;
  let cleaned = s.replace(/,/g, "").trim();
  // Handle OCR errors:
  // "34400..00" -> "34400.00"
  cleaned = cleaned.replace(/\.\.+/g, ".");
  // "-00" likely means 0 (OCR misread of ".00")
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
  const patterns = [
    /(Trung\s+[Tt]am\s+[Pp]han\s+phoi\s+\S+(?:\s+\S+){0,2})/i,
    /(TTPP?\s+[A-Z\s/()]+?)(?:\s{2,}|$)/i,
    /(Co\.?op[Mm]art\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i,
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
    // Prevent infinite loop on zero-width match
    if (m.index === pattern.lastIndex) pattern.lastIndex++;
  }
  return records;
}

export function parsePOText(text, fileName) {
  text = text.replace(/\x00/g, "");

  const poMatch = text.match(/P[\/\\][O0]\.?\s+Number[:-]?\s+(\d+)/i);
  const poNumber = poMatch ? poMatch[1] : "";

  const locMatch = text.match(/P[\/\\][O0]\.?\s+Location[:-]?\s+(\d+)/i);
  const poLocation = locMatch ? locMatch[1] : "";

  const shipTo = extractShipTo(text);

  // Try both patterns; pick whichever finds more records
  const stdMatches = runPattern(text, SKU_PATTERN_STD);
  const confirmMatches = runPattern(text, SKU_PATTERN_CONFIRM);

  // Prefer the format suggested by document text, but use whichever matches more
  let matches;
  if (isConfirmationFormat(text)) {
    matches = confirmMatches.length > 0 ? confirmMatches : stdMatches;
  } else {
    matches = stdMatches.length > 0 ? stdMatches : confirmMatches;
  }

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
    _source: fileName,
  }));
}
