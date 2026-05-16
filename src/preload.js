// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
const { ipcRenderer } = require("electron");

const DARK_STYLE = `
    html.ncm-dark-theme {
        filter: invert(0.9) hue-rotate(180deg) !important;
    }
    html.ncm-dark-theme img,
    html.ncm-dark-theme video,
    html.ncm-dark-theme iframe,
    html.ncm-dark-theme .u-cover,
    html.ncm-dark-theme [style*="background-image"] {
        filter: invert(1) hue-rotate(180deg) !important;
    }
`;

function updateTheme(isDark) {
  if (isDark) {
    document.documentElement.classList.add("ncm-dark-theme");
  } else {
    document.documentElement.classList.remove("ncm-dark-theme");
  }
}

ipcRenderer.on("theme-changed", (event, isDark) => {
  updateTheme(isDark);
});

window.__ncmTrackUpdate = (data) => {
  ipcRenderer.send("track-update", data);
};

window.addEventListener("DOMContentLoaded", () => {
  // Inject dark theme styles
  const style = document.createElement("style");
  style.innerHTML = DARK_STYLE;
  document.head.appendChild(style);

  // Initial theme sync
  ipcRenderer.invoke("get-theme").then(updateTheme);
});
