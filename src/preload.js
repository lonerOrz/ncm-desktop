const { ipcRenderer, contextBridge } = require("electron");

// 媒体监控：轮询当前播放曲目并通过受控 IPC 上报给主进程发通知
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

// 仅暴露必要、受控的 API 给页面（contextIsolation: true）
contextBridge.exposeInMainWorld("ncm", {
  notifyTrack: (data) => ipcRenderer.send("track-update", data),
});

window.addEventListener("DOMContentLoaded", () => {
  initMediaMonitor();
});
