# 📋 PO SGC Extractor

Tool trích xuất dữ liệu Purchase Order (JDA POM343) từ file PDF/DOC/DOCX/TXT/Excel ra Excel theo template chuẩn.

## ✨ Đặc điểm

- **Parse text-based PDF**: 100% chạy trên trình duyệt, không cần API, miễn phí
- **OCR cho scanned PDF**: dùng Google Vision API (1000 OCR/tháng miễn phí)
- **Bảo mật**: file không upload lên server (trừ OCR ảnh khi cần)
- **Hỗ trợ**: PDF, DOC, DOCX, TXT, Excel — upload nhiều file cùng lúc

---

## 🚀 Deploy qua GitHub + Vercel

### Bước 1: Cài đặt công cụ (làm 1 lần)

- **Git**: tải tại [git-scm.com](https://git-scm.com/downloads) (Windows/Mac/Linux)
- **GitHub account**: [github.com/signup](https://github.com/signup)
- **Vercel account**: [vercel.com/signup](https://vercel.com/signup) → chọn **"Continue with GitHub"**

### Bước 2: Lấy Google Vision API Key

1. Vào [Google Cloud Console](https://console.cloud.google.com/) → đăng nhập bằng Google account
2. Bấm **"Select a project"** → **"NEW PROJECT"** → đặt tên (ví dụ: `po-sgc-ocr`) → Create
3. Bật Vision API: vào [link này](https://console.cloud.google.com/apis/library/vision.googleapis.com) → bấm **ENABLE**
4. Tạo API Key:
   - Vào [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
   - **+ CREATE CREDENTIALS** → **API key**
   - Copy key dạng `AIzaSyXX...` — **giữ lại để dùng ở Bước 5**
5. (Khuyến nghị) Restrict key:
   - Bấm vào key vừa tạo → **Application restrictions: None** (giữ nguyên)
   - **API restrictions: Restrict key** → tick **Cloud Vision API** → Save

> 💰 **Chi phí**: 1000 requests đầu tiên/tháng MIỄN PHÍ. Sau đó $1.50/1000. Folder 110 file PO của bạn dùng hết ~6 OCR/tháng → free thoải mái.

### Bước 3: Tạo repo trên GitHub

1. Vào [github.com/new](https://github.com/new)
2. Điền:
   - **Repository name**: `po-sgc-extractor`
   - **Public** (cần Public để dùng Vercel free)
   - **KHÔNG** check "Add README"
3. Bấm **Create repository**
4. Copy URL repo dạng `https://github.com/YOUR_USERNAME/po-sgc-extractor.git`

### Bước 4: Push code lên GitHub

Giải nén file source mình đã gửi, mở Terminal (Mac/Linux) hoặc Git Bash (Windows) trong thư mục project:

```bash
cd path/to/po-sgc-extractor

git init
git add .
git commit -m "Initial commit"
git branch -M main

# Thay YOUR_USERNAME bằng username GitHub của bạn
git remote add origin https://github.com/YOUR_USERNAME/po-sgc-extractor.git
git push -u origin main
```

Lần đầu push, GitHub có thể hỏi login. Nếu prompt token thay vì password: tạo token tại [github.com/settings/tokens](https://github.com/settings/tokens) (chọn scope `repo`).

### Bước 5: Deploy trên Vercel

1. Vào [vercel.com/new](https://vercel.com/new)
2. Phần **Import Git Repository** → bấm **Import** cạnh repo `po-sgc-extractor`
3. Mở phần **Environment Variables**:
   - **Name**: `GOOGLE_VISION_API_KEY`
   - **Value**: paste API key từ Bước 2
   - Bấm **Add**
4. Để tất cả setting khác mặc định (Vercel tự detect Vite)
5. Bấm **Deploy** → đợi 1-2 phút

🎉 Xong! Vercel cho link kiểu `https://po-sgc-extractor.vercel.app`. **Share link này cho team**.

### Bước 6: Update code sau này

Khi cần sửa code, chỉ cần:
```bash
git add .
git commit -m "Update something"
git push
```
Vercel tự deploy lại trong ~1 phút.

---

## 🛠️ Phát triển local

```bash
npm install

# Tạo file .env.local với GOOGLE_VISION_API_KEY (chỉ cần nếu test OCR)
cp .env.example .env.local

# Chạy dev server
npm run dev          # localhost:5173

# Build production
npm run build
```

**Lưu ý local dev**: API serverless function (`/api/ocr`) chỉ work khi deploy lên Vercel hoặc chạy với `vercel dev`. Nếu test local: `npm i -g vercel && vercel dev`.

---

## 📁 Cấu trúc project

```
po-sgc-extractor/
├── api/
│   └── ocr.js              # Serverless function gọi Google Vision OCR
├── src/
│   ├── main.jsx            # Entry point
│   ├── App.jsx             # Main UI
│   ├── parser.js           # Logic parse JDA POM343 format
│   └── fileReaders.js      # Đọc PDF/DOC/DOCX/TXT/Excel + render OCR
├── index.html
├── vite.config.js
├── vercel.json             # Config Vercel
├── package.json
└── .env.example
```

## 🔧 Cách hoạt động

1. User upload file PO trên trình duyệt
2. JavaScript đọc text từ file (PDF.js/Mammoth/binary scan/UTF-16 decode)
3. **Nếu PDF không có text layer** (scanned) → render từng trang ra ảnh JPEG → gửi lên Vercel function → Vercel gọi Google Vision API → trả về text
4. Regex parser tách dữ liệu SKU, P/O Number, Ship To, etc.
5. Hiển thị bảng để user review/edit
6. Xuất file Excel theo template chuẩn

## ⚠️ Lưu ý

- **API key bảo mật**: chỉ lưu trên Vercel server (env variable), không bao giờ lộ ra browser
- **Limit OCR**: 1000 requests free/tháng. Mỗi page scanned PDF = 1 request
- **Format hỗ trợ**: chỉ JDA POM343 Purchase Order. Format khác cần điều chỉnh parser

## 🐛 Troubleshooting

| Lỗi | Cách xử lý |
|---|---|
| "GOOGLE_VISION_API_KEY chưa được cấu hình" | Vercel → Project Settings → Environment Variables → thêm key → redeploy |
| OCR trả về text rỗng | Check Vision API đã ENABLE chưa, check key có đúng quyền không |
| Push lên GitHub bị reject | Tạo Personal Access Token, dùng thay password |
| Build báo lỗi worker | Đảm bảo Node.js >= 18 (`node --version`) |
