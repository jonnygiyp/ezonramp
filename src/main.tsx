import { Buffer } from 'buffer';

// Polyfill Buffer for browser compatibility (required by Particle Network)
window.Buffer = Buffer;

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);