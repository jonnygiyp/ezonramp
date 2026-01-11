// Import polyfills FIRST - before any other imports
import "./polyfills";

// Install error logging BEFORE importing the app (captures module init crashes)
import "./earlyErrorLogger";

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
