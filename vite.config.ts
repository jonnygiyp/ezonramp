import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import fs from "fs";

// Custom plugin to serve WASM files from node_modules
function serveParticleWasm(): Plugin {
  return {
    name: 'serve-particle-wasm',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Intercept requests for thresh_sig WASM file
        if (req.url?.includes('thresh_sig_wasm_bg.wasm')) {
          const wasmPath = path.resolve(
            __dirname,
            'node_modules/@particle-network/thresh-sig/wasm/thresh_sig_wasm_bg.wasm'
          );
          
          if (fs.existsSync(wasmPath)) {
            res.setHeader('Content-Type', 'application/wasm');
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
            res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
            const wasmBuffer = fs.readFileSync(wasmPath);
            res.end(wasmBuffer);
            return;
          }
        }
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    fs: {
      allow: ['..', 'node_modules'],
      strict: false,
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  plugins: [
    serveParticleWasm(),
    wasm(),
    topLevelAwait(),
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: ['@particle-network/thresh-sig'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      // Copy WASM files to output
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.wasm')) {
            return 'wasm/[name][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
  assetsInclude: ['**/*.wasm'],
}));
