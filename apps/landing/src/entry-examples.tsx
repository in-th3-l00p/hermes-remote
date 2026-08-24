import { createRoot } from "react-dom/client";
import { Examples } from "./examples.tsx";
import "./index.css";

createRoot(document.getElementById("root") as HTMLElement).render(<Examples />);
