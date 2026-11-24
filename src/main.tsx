import ReactDOM from "react-dom/client";
import App from "./App";
import { UserProvider } from "./contexts/UserContext";
import { ToastProvider } from "./contexts/ToastContext";

import { applySavedZoom } from './utils/viewZoom';

applySavedZoom();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <UserProvider>
    <ToastProvider>
      <App />
    </ToastProvider>
  </UserProvider>
);

// Fade the splash screen (index.html) out once the app is mounted, but keep it up for at least 1.6 s.
const splash = document.getElementById('splash');
if (splash) {
  window.setTimeout(() => {
    splash.classList.add('hide');
    window.setTimeout(() => { splash.remove(); document.getElementById('splash-style')?.remove(); }, 600);
  }, Math.max(0, 1600 - performance.now()));
}
