const { ipcRenderer, contextBridge } = require("electron");

// 媒体监控：监听当前播放曲目变化并通过受控 IPC 上报给主进程发通知。
// 网易云会在换歌时更新标签页标题，这里用 MutationObserver 监听标题变化
// （事件驱动），比固定 3s 轮询更省资源、换歌响应也更即时。
let lastTitle = "";
function reportTrack() {
  const meta = navigator.mediaSession?.metadata;
  const title = meta?.title || document.title;
  if (title && title !== lastTitle) {
    lastTitle = title;
    ipcRenderer.send("track-update", {
      title,
      artist: meta?.artist || "Unknown Artist",
    });
  }
}

function initMediaMonitor() {
  reportTrack();

  const titleEl = document.querySelector("title");
  if (titleEl) {
    const observer = new MutationObserver(() => reportTrack());
    observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
  }
}

// 仅暴露必要、受控的 API 给页面（contextIsolation: true）
contextBridge.exposeInMainWorld("ncm", {
  notifyTrack: (data) => ipcRenderer.send("track-update", data),
});

window.addEventListener("DOMContentLoaded", () => {
  initMediaMonitor();
});
