# 📋 PO SGC Extractor

Tool trích xuất dữ liệu Purchase Order (JDA POM343) từ file PDF/DOC/DOCX/TXT/Excel ra Excel theo template chuẩn.

## ✨ Đặc điểm

- **100% chạy trên trình duyệt** — Không cần API, không cần backend, miễn phí hoàn toàn
- **OCR built-in** — Tự động OCR scanned PDF bằng Tesseract.js (chạy ngay trong trình duyệt)
- **Bảo mật tuyệt đối** — File không upload lên server, xử lý ngay trên máy user
- **Hỗ trợ nhiều format**: PDF, DOC, DOCX, TXT, Excel
- **Xử lý hàng loạt**: upload 100+ file cùng lúc

## ⚡ Tốc độ

- File PDF text bình thường: < 1 giây/file
- File scanned PDF (OCR): 30-60 giây/page
- Lần đầu OCR: thêm 30-60s để tải Tesseract engine (~10MB, cached sau đó)

---

## 🚀 Deploy qua GitHub + Vercel

### Bước 1: Push code lên GitHub
Dùng GitHub Desktop hoặc Git CLI.

### Bước 2: Deploy lên Vercel
1. Vào [vercel.com/new](https://vercel.com/new)
2. Import repo
3. Bấm **Deploy** — KHÔNG cần Environment Variables

Vercel sẽ cho link `https://po-sgc-extractor.vercel.app`. Share link cho team.

---

## 🛠️ Phát triển local

```bash
npm install
npm run dev          # localhost:5173
npm run build        # build production
npm run preview      # preview build
```

## 📁 Cấu trúc

```
po-sgc-extractor/
├── src/
│   ├── main.jsx          # Entry point
│   ├── App.jsx           # Main UI
│   ├── parser.js         # Logic parse JDA POM343
│   └── fileReaders.js    # Đọc file + OCR (Tesseract.js)
├── index.html
├── vite.config.js
└── package.json
```

## 🔧 Cách hoạt động

1. User upload file PO trên browser
2. **PDF text bình thường**: PDF.js đọc text trực tiếp (nhanh)
3. **PDF scanned**: 
   - Detect text < 100 ký tự → xác định scanned
   - Render từng page ra canvas (scale 2x cho rõ)
   - Tesseract.js OCR canvas (hỗ trợ tiếng Anh + tiếng Việt)
4. Regex parser tách dữ liệu SKU, P/O Number, Ship To, etc.
5. User review/edit trên bảng → xuất Excel theo template

**Tất cả xử lý trên browser user — không upload lên server, không cần API key, không phát sinh chi phí.**

## ⚠️ Lưu ý

- File scanned PDF dùng OCR sẽ chậm (30-60s/page). Bundle size lớn hơn do phải tải Tesseract engine
- OCR sẽ kém chính xác hơn so với text PDF — cần check kết quả 3 file scanned cẩn thận
