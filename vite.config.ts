import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import fs from "fs";
import inject from "@rollup/plugin-inject";
import commonjs from "@rollup/plugin-commonjs";

// Note: vite-plugin-static-copy is installed but not needed since we use custom middleware

// Custom plugin to serve WASM files from node_modules
function serveParticleWasm(): Plugin {
  return {
    name: "serve-particle-wasm",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Intercept requests for thresh_sig WASM file
        if (req.url?.includes("thresh_sig_wasm_bg.wasm")) {
          const wasmPath = path.resolve(
            __dirname,
            "node_modules/@particle-network/thresh-sig/wasm/thresh_sig_wasm_bg.wasm"
          );

          if (fs.existsSync(wasmPath)) {
            res.setHeader("Content-Type", "application/wasm");
            res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
            res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
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
      allow: ["..", "node_modules"],
      strict: false,
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  plugins: [
    serveParticleWasm(),
    wasm(),
    topLevelAwait(),

    // Ensure Node-style globals like Buffer exist inside bundled chunks (incl. Particle SDK)
    inject({
      Buffer: ["buffer", "Buffer"],
    }),

    // Ensure CommonJS deps (e.g. borsh) are transformed so named exports work in Rollup
    commonjs({
      include: [/node_modules/],
      transformMixedEsModules: true,
    }),

    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  define: {
    // Polyfill global and process for Particle Network SDK compatibility
    global: "globalThis",
    "process.env": JSON.stringify({}),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Force @solana/web3.js to resolve the installed borsh package
      borsh: path.resolve(__dirname, "node_modules/borsh"),
    },
  },
  optimizeDeps: {
    include: [
      "buffer",
      "@particle-network/thresh-sig",
      "@particle-network/connectkit",
      "@particle-network/connectkit/auth",
      "@particle-network/connectkit/evm",
      "@particle-network/connectkit/solana",
      "@particle-network/connectkit/wallet",
      "@particle-network/connectkit/chains",
      // Fix Particle OTP runtime error in Vite by pre-bundling auth-core
      "@particle-network/auth-core",
      "@coinbase/cbpay-js",
    ],
    esbuildOptions: {
      target: "esnext",
      define: {
        global: "globalThis",
      },
    },
  },
  build: {
    target: "esnext",
    // Disable minification to preserve class names for Particle SDK
    minify: false,
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
      // Fix "Class extends value undefined" error in production
      esmExternals: true,
      requireReturnsDefault: "auto",
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith(".wasm")) {
            return "wasm/[name][extname]";
          }
          return "assets/[name]-[hash][extname]";
        },
        // Keep Particle SDK in a single chunk to preserve class inheritance
        manualChunks(id) {
          if (id.includes("@particle-network")) {
            return "particle-sdk";
          }
        },
      },
      treeshake: {
        moduleSideEffects: true,
      },
    },
  },
  assetsInclude: ["**/*.wasm"],
}));
