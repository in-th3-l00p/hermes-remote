import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./chat.css";

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
