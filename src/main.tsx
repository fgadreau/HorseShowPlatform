import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { EnvironmentBanner } from "./components/EnvironmentBanner";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <EnvironmentBanner />
    <App />
  </React.StrictMode>,
);
