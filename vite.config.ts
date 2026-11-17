import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  /* Ścieżki względne i adresy z krzyżykiem: ten sam build działa lokalnie
     i w podkatalogu GitHub Pages, bez konfiguracji i bez 404.html. */
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        /* Stałe nazwy plików. GitHub Pages trzyma index.html w pamięci
           podręcznej przez 10 minut; przy nazwach z hashem stary index
           wskazywałby po wdrożeniu na pliki, których już nie ma. */
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
        /* Biblioteki osobno: zmiana w aplikacji nie unieważnia ich w pamięci podręcznej. */
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
