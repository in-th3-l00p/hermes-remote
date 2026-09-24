import { createRoot } from "react-dom/client";
import { Home } from "./home.tsx";
import "./site.css";

createRoot(document.getElementById("root") as HTMLElement).render(<Home />);
