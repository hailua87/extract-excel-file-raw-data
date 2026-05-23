import { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { extractText } from "./fileReaders.js";
import { parsePOText } from "./parser.js";

const HEADERS = [
  { key: "sku", label: "SKU Number" },
  { key: "description", label: "Description" },
  { key: "buyCost", label: "Buy Cost" },
  { key: "netBuyCost", label: "Net Buy Cost" },
  { key: "qtyCS", label: "QtyOrd/CS" },
  { key: "qtyPCS", label: "QtyOrd/PCS" },
  { key: "poNumber", label: "P/O Number" },
  { key: "poLocation", label: "P/O Location" },
  { key: "shipTo", label: "Ship To" },
  { key: "promo", label: "Khuyến mãi" },
  { key: "notes", label: "Notes" },
  { key: "total", label: "Total" },
];

export default function App() {
  const [rows, setRows] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ i: 0, n: 0, file: "", stage: "" });
  const [errors, setErrors] = useState([]);
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = useCallback(async (fileList) => {
    const valid = Array.from(fileList).filter((f) =>
      /\.(pdf|doc|docx|txt|xlsx|xls|csv)$/i.test(f.name)
    );
    if (!valid.length) return;

    setProcessing(true);
    setErrors([]);
    const newRows = [];
    const newNames = [];
    const newErrors = [];

    for (let i = 0; i < valid.length; i++) {
      const f = valid[i];
      setProgress({ i: i + 1, n: valid.length, file: f.name, stage: "" });

      try {
        const text = await extractText(f, (stage) => {
          setProgress({ i: i + 1, n: valid.length, file: f.name, stage });
        });
        if (!text || !text.trim()) {
          newErrors.push(`${f.name}: File trống hoặc không đọc được`);
          continue;
        }
        const records = parsePOText(text, f.name);
        if (records.length === 0) {
          newErrors.push(`${f.name}: Không tìm thấy dòng SKU`);
        } else {
          newRows.push(...records);
          newNames.push(f.name);
        }
      } catch (e) {
        newErrors.push(`${f.name}: ${e.message}`);
      }
    }

    setRows((prev) => [...prev, ...newRows]);
    setFiles((prev) => [...prev, ...newNames]);
    setErrors(newErrors);
    setProcessing(false);
  }, []);

  const handleExport = useCallback(() => {
    if (!rows.length) return;
    const wb = XLSX.utils.book_new();
    const headerRow = HEADERS.map((h) => h.label);
    const dataRows = rows.map((r) =>
      HEADERS.map((h) => {
        const v = r[h.key];
        if (["buyCost", "netBuyCost", "qtyCS", "qtyPCS", "total"].includes(h.key)) {
          const n = Number(v);
          return isNaN(n) ? v || "" : n;
        }
        return v ?? "";
      })
    );
    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
    ws["!cols"] = [
      { wch: 14 }, { wch: 43 }, { wch: 13 }, { wch: 13 },
      { wch: 9 }, { wch: 9 }, { wch: 13 }, { wch: 11 }, { wch: 28 },
      { wch: 28 }, { wch: 50 }, { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const d = new Date();
    const ds = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    XLSX.writeFile(wb, `PO_SGC_Extract_${ds}.xlsx`);
  }, [rows]);

  const drop = (e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); };
  const pct = progress.n ? Math.round((progress.i / progress.n) * 100) : 0;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.logo}>📋</div>
        <div>
          <h1 style={styles.title}>PO SGC Extractor</h1>
          <p style={styles.subtitle}>Upload file PO → Extract dữ liệu → Xuất Excel</p>
        </div>
        <div style={styles.badge}>🔒 100% offline · OCR built-in</div>
      </div>

      <div
        style={{ ...styles.dropzone, borderColor: dragOver ? "#2563eb" : "#cbd5e1", background: dragOver ? "#eff6ff" : "#fff" }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={drop}
        onClick={() => !processing && inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" multiple accept=".pdf,.doc,.docx,.txt,.xlsx,.xls,.csv"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />

        {processing ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1e40af" }}>
              Đang xử lý {progress.i}/{progress.n} ({pct}%)
            </div>
            <div style={{ fontSize: 12, color: "#64748b", margin: "4px 0 2px" }}>{progress.file}</div>
            {progress.stage && (
              <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 600, marginBottom: 8 }}>
                🔍 {progress.stage}
              </div>
            )}
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${pct}%` }} />
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📂</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1e293b" }}>Kéo thả file hoặc bấm để chọn</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
              PDF, DOC, DOCX, TXT, Excel — nhiều file cùng lúc
            </div>
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div style={styles.errorBox}>
          {errors.map((e, i) => <div key={i} style={{ fontSize: 12, color: "#dc2626", marginBottom: 2 }}>⚠️ {e}</div>)}
        </div>
      )}

      {rows.length > 0 && (
        <div style={styles.actionBar}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
            📊 {rows.length} dòng từ {files.length} file
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setRows([]); setFiles([]); setErrors([]); }} style={styles.btnSecondary}>
              🗑️ Xóa tất cả
            </button>
            <button onClick={handleExport} style={styles.btnPrimary}>📥 Xuất Excel</button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                {HEADERS.map((h) => <th key={h.key} style={styles.th}>{h.label}</th>)}
                <th style={styles.th}>Nguồn</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ background: i % 2 ? "#f8fafc" : "#fff" }}>
                  <td style={styles.td}>{i + 1}</td>
                  {HEADERS.map((h) => (
                    <td key={h.key} style={styles.td}>
                      <input
                        style={styles.cellInput}
                        value={row[h.key] ?? ""}
                        onChange={(e) => setRows((p) => { const n = [...p]; n[i] = { ...n[i], [h.key]: e.target.value }; return n; })}
                      />
                    </td>
                  ))}
                  <td style={{ ...styles.td, fontSize: 10, color: "#94a3b8", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row._source}
                  </td>
                  <td style={styles.td}>
                    <button onClick={() => setRows((p) => p.filter((_, j) => j !== i))} style={styles.delBtn}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!rows.length && !processing && (
        <div style={{ textAlign: "center", padding: "36px 16px", color: "#94a3b8" }}>
          <div style={{ fontSize: 44, marginBottom: 10, opacity: 0.35 }}>📄</div>
          <div style={{ fontSize: 13, marginBottom: 14 }}>Upload file PO (JDA POM343) để bắt đầu</div>
          <div style={{ display: "inline-block", textAlign: "left", fontSize: 12, color: "#cbd5e1", lineHeight: 1.8 }}>
            <strong style={{ color: "#94a3b8" }}>Cách sử dụng:</strong><br />
            1. Kéo thả hoặc chọn file PO (PDF/DOC/DOCX/TXT/Excel)<br />
            2. Tool tự động trích xuất dữ liệu trên máy bạn (không upload lên server)<br />
            3. Kiểm tra, chỉnh sửa trực tiếp trên bảng<br />
            4. Bấm "Xuất Excel" để tải file theo template chuẩn
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", maxWidth: 1200, margin: "0 auto", padding: "24px 20px", minHeight: "100vh" },
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 24, flexWrap: "wrap" },
  logo: { width: 44, height: 44, borderRadius: 11, background: "linear-gradient(135deg,#1e40af,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#fff", flexShrink: 0 },
  title: { margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.3px" },
  subtitle: { margin: "2px 0 0", fontSize: 13, color: "#64748b" },
  badge: { marginLeft: "auto", fontSize: 11, fontWeight: 600, color: "#059669", background: "#d1fae5", padding: "5px 10px", borderRadius: 6 },
  dropzone: { border: "2px dashed #cbd5e1", borderRadius: 12, padding: "40px 24px", cursor: "pointer", transition: "all 0.2s" },
  progressBar: { width: 220, height: 5, background: "#e2e8f0", borderRadius: 3, margin: "0 auto", overflow: "hidden" },
  progressFill: { height: "100%", background: "linear-gradient(90deg,#2563eb,#7c3aed)", borderRadius: 3, transition: "width 0.3s" },
  errorBox: { marginTop: 14, padding: "10px 14px", background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" },
  actionBar: { marginTop: 18, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 },
  btnSecondary: { padding: "8px 16px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btnPrimary: { padding: "8px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#1e40af,#7c3aed)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 10px rgba(30,64,175,0.25)" },
  tableWrap: { marginTop: 14, overflowX: "auto", borderRadius: 8, border: "1px solid #e2e8f0", maxHeight: "60vh", overflow: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 1050 },
  th: { padding: "9px 7px", textAlign: "left", fontWeight: 700, fontSize: 11, color: "#475569", background: "#f1f5f9", borderBottom: "2px solid #e2e8f0", whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 1 },
  td: { padding: "3px 5px", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" },
  cellInput: { width: "100%", border: "1px solid transparent", borderRadius: 3, padding: "4px 5px", fontSize: 12, background: "transparent", outline: "none", boxSizing: "border-box" },
  delBtn: { background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14, padding: "2px 6px" },
};
