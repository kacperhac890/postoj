import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/* Zasady bezpieczeństwa treści (CSP) w zbudowanej stronie. GitHub Pages nie
   pozwala ustawić nagłówków, więc zasady idą w znaczniku <meta>. Skrypty
   tylko z tej strony, połączenia tylko do własnego projektu Supabase:
   wstrzyknięty obcy skrypt nie wyśle danych nigdzie indziej. */
function contentSecurityPolicy(supabaseUrl: string | undefined): Plugin {
  let api = "";
  try {
    if (supabaseUrl) {
      const u = new URL(supabaseUrl);
      api = ` ${u.origin} wss://${u.host}`;
    }
  } catch {
    api = "";
  }
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    /* Style w atrybutach (paski, animacje) i reguły podświetlenia grafiku. */
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${api}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
  return {
    name: "postoj-csp",
    apply: "build",
    transformIndexHtml: () => [
      { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: policy }, injectTo: "head" },
    ],
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    /* Ścieżki względne i adresy z krzyżykiem: ten sam build działa lokalnie
       i w podkatalogu GitHub Pages, bez konfiguracji i bez 404.html. */
    base: "./",
    plugins: [react(), tailwindcss(), contentSecurityPolicy(env.VITE_SUPABASE_URL)],
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
  };
});
