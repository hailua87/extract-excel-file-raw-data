import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ["pdfjs-dist/build/pdf"],
    exclude: ["tesseract.js"],
  },
  worker: {
    format: "es",
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          pdfjs: ["pdfjs-dist"],
          tesseract: ["tesseract.js"],
          mammoth: ["mammoth"],
          xlsx: ["xlsx"],
        },
      },
    },
  },
});
