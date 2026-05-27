const { ipcRenderer } = require("electron");

// Dark 模式
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

// 媒体监控
let lastTitle = "";
function initMediaMonitor() {
  setInterval(() => {
    const meta = navigator.mediaSession?.metadata;
    if (meta && meta.title && meta.title !== lastTitle) {
      lastTitle = meta.title;
      ipcRenderer.send("track-update", {
        title: meta.title,
        artist: meta.artist || "Unknown Artist",
      });
    }
  }, 3000);
}

ipcRenderer.on("theme-changed", (event, isDark) => {
  updateTheme(isDark);
});

window.__ncmTrackUpdate = (data) => {
  ipcRenderer.send("track-update", data);
};

window.addEventListener("DOMContentLoaded", () => {
  const style = document.createElement("style");
  style.innerHTML = DARK_STYLE;
  document.head.appendChild(style);

  ipcRenderer.invoke("get-theme").then(updateTheme);

  initMediaMonitor();
});
