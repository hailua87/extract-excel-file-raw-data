// Parser for JDA POM343 Purchase Order text - pure JavaScript

const NUM = "[\\d,]*\\.?\\d{2}";

const SKU_PATTERN = new RegExp(
  "(\\d{7}-\\d)\\s+" +
  "(.+?)\\s+" +
  "(?:\\d{10,})?\\s*" +
  "EA\\s+(?:C\\d+|EA)\\s+" +
  `(${NUM})\\s+` +
  `(${NUM})\\s+` +
  `(${NUM})\\s+` +
  `(${NUM})\\s+` +
  `(?:${NUM})\\s+` +
  NUM,
  "g"
);

function parseNum(s) {
  if (!s) return 0;
  const n = parseFloat(s.replace(/,/g, "").trim());
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
    /(Trung\s+[Tt]am\s+[Pp]han\s+phoi\s+\S+(?:\s+\S+){0,2})/,
    /(TTPP?\s+[A-Z\s/()]+?)(?:\s{2,}|$)/,
    /(Co\.opMart\s+\S+(?:\s+\S+)?)/,
    /(KHO\s+[A-Z\s]+?)(?:\s{2,}|$)/,
    /(Trung\s+chuyen\s+\S+(?:\s*-\s*\d+)?)/,
    /(Trung\s+tam\s+phan\s+phoi\s+\S+)/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return "";
}

export function parsePOText(text, fileName) {
  text = text.replace(/\x00/g, "");

  const poMatch = text.match(/P\/O\s+Number:\s+(\d+)/);
  const poNumber = poMatch ? poMatch[1] : "";

  const locMatch = text.match(/P\/O\s+Location:\s+(\d+)/);
  const poLocation = locMatch ? locMatch[1] : "";

  const shipTo = extractShipTo(text);

  const records = [];
  let m;
  SKU_PATTERN.lastIndex = 0;
  while ((m = SKU_PATTERN.exec(text)) !== null) {
    records.push({
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
    });
  }

  return records;
}
