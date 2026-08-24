import { createRoot } from "react-dom/client";
import { Home } from "./home.tsx";
import "./index.css";

createRoot(document.getElementById("root") as HTMLElement).render(<Home />);
