import { setApiBaseUrl } from "@ncct/api-client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { API_BASE_URL } from "./apiBaseUrl.js";
import App from "./App.tsx";

// Must run before anything renders: api-client holds the base URL in module
// state and defaults to localhost, which is wrong everywhere except a
// developer's own browser — on the Android build "localhost" is the phone.
setApiBaseUrl(API_BASE_URL);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
