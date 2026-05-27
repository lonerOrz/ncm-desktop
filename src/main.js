const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  session,
  dialog,
  ipcMain,
  Notification,
  nativeTheme,
  shell,
} = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");

app.setName("ncm-desktop");

const DEFAULT_URL = "https://music.163.com/st/webplayer";
const targetUrl = process.argv[2] || DEFAULT_URL;
const stateFile = path.join(app.getPath("userData"), "window-state.json");
const customDir = path.join(app.getPath("userData"), "custom");

let mainWindow = null;
let tray = null;
let isQuitting = false;
let followSystemTheme = true;
let saveTimer = null;
let injectedCssKeys = [];
let customDirWatcher = null;

// --- Linux 适配 ---
if (process.platform === "linux") {
  app.commandLine.appendSwitch("enable-features", "UseOzonePlatform");
  app.commandLine.appendSwitch("ozone-platform-hint", "auto");
  app.commandLine.appendSwitch("enable-wayland-ime");
}

// --- 窗口状态管理 ---
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveWindowState, 300);
}

function saveWindowState() {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  const maximized = mainWindow.isMaximized();
  try {
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ ...bounds, maximized, followSystemTheme }),
    );
  } catch {}
}

function loadWindowState() {
  try {
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (state.hasOwnProperty("followSystemTheme")) {
      followSystemTheme = state.followSystemTheme;
    }
    return state;
  } catch {
    return null;
  }
}

function getIconPath() {
  const local = path.join(__dirname, "icon.png");
  if (fs.existsSync(local)) return local;
  return path.join(__dirname, "..", "icon.png");
}

// --- 自定义资源管理 ---
function initCustomDir() {
  if (!fs.existsSync(customDir)) {
    try {
      fs.mkdirSync(customDir, { recursive: true });
    } catch {}
  }
}

async function loadCustomResources() {
  if (!mainWindow) return;
  initCustomDir();

  try {
    const files = fs.readdirSync(customDir).sort();

    for (const key of injectedCssKeys) {
      try {
        await mainWindow.webContents.removeInsertedCSS(key);
      } catch {}
    }
    injectedCssKeys = [];

    const cssFiles = files.filter((f) => f.endsWith(".css"));
    for (const file of cssFiles) {
      try {
        const filePath = path.join(customDir, file);
        const cssContent = fs.readFileSync(filePath, "utf8");
        const key = await mainWindow.webContents.insertCSS(cssContent);
        injectedCssKeys.push(key);
      } catch (err) {
        console.error(`Failed to inject custom CSS [${file}]:`, err);
      }
    }

    const jsFiles = files.filter((f) => f.endsWith(".js"));
    for (const file of jsFiles) {
      try {
        const filePath = path.join(customDir, file);
        const jsContent = fs.readFileSync(filePath, "utf8");
        const safeJs = `
          (function() {
            try {
              ${jsContent}
            } catch (e) {
              console.error("Error in custom script [${file}]:", e);
            }
          })();
        `;
        mainWindow.webContents.executeJavaScript(safeJs).catch((err) => {
          console.error(`Failed to execute custom JS [${file}]:`, err);
        });
      } catch (err) {
        console.error(`Failed to load custom JS [${file}]:`, err);
      }
    }
  } catch (e) {
    console.error("Failed to load custom resources:", e);
  }
}

function watchCustomDirectory() {
  if (customDirWatcher) {
    try {
      customDirWatcher.close();
    } catch {}
  }

  try {
    customDirWatcher = fs.watch(customDir, (eventType, filename) => {
      if (filename && (filename.endsWith(".css") || filename.endsWith(".js"))) {
        loadCustomResources();
      }
    });
  } catch (err) {
    console.error("Failed to watch custom directory:", err);
  }
}

// --- 核心业务监听 ---
// 注册主题请求处理
ipcMain.handle("get-theme", () => {
  return followSystemTheme && nativeTheme.shouldUseDarkColors;
});

// 注册通知监听
ipcMain.on("track-update", (event, data) => {
  if (!data || !data.title) return;
  const n = new Notification({
    title: data.title,
    body: data.artist,
    icon: getIconPath(),
  });
  n.on("click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  n.show();
});

// --- 版本检查 ---
function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

function checkForUpdates() {
  const statePath = path.join(app.getPath("userData"), "update-state.json");
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {}

  const req = https.get(
    "https://api.github.com/repos/lonerOrz/ncm-desktop/releases/latest",
    {
      headers: {
        "User-Agent": "ncm-desktop",
        Accept: "application/vnd.github.v3+json",
      },
      timeout: 10000,
    },
    (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          const release = JSON.parse(body);
          const latest = release.tag_name.replace(/^v/, "");
          const current = app.getVersion();

          if (
            latest !== state.checkedVersion &&
            compareVersions(latest, current) > 0
          ) {
            const n = new Notification({
              title: "ncm-desktop Update Available",
              body: `v${latest} released (current: v${current})`,
            });
            n.on("click", () => {
              require("electron").shell.openExternal(
                "https://github.com/lonerOrz/ncm-desktop/releases/latest",
              );
            });
            n.show();
          }

          state.checkedVersion = latest;
          fs.writeFileSync(statePath, JSON.stringify(state));
        } catch {}
      });
    },
  );
  req.on("error", () => {});
  req.end();
}

// --- 窗口创建 ---
function createWindow() {
  const saved = loadWindowState();

  mainWindow = new BrowserWindow({
    width: saved?.width || 1920,
    height: saved?.height || 1080,
    x: saved?.x,
    y: saved?.y,
    icon: getIconPath(),
    autoHideMenuBar: true, // 隐藏菜单栏
    show: false, // 配合 ready-to-show
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: false,
      webviewTag: true,
      spellcheck: false,
    },
  });

  if (saved?.maximized) {
    mainWindow.maximize();
  }

  // 彻底移除默认菜单
  mainWindow.setMenu(null);

  mainWindow.webContents.userAgent =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  mainWindow.loadURL(targetUrl);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.on("did-finish-load", () => {
    loadCustomResources();
    watchCustomDirectory();
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("resize", scheduleSave);
  mainWindow.on("move", scheduleSave);
  mainWindow.on("maximize", scheduleSave);
  mainWindow.on("unmaximize", scheduleSave);
}

function updateThemeState() {
  mainWindow?.webContents.send(
    "theme-changed",
    followSystemTheme && nativeTheme.shouldUseDarkColors,
  );
}

nativeTheme.on("updated", () => {
  if (followSystemTheme) {
    updateThemeState();
  }
});

// --- 托盘与 About ---
function updateTrayMenu() {
  const visible = mainWindow?.isVisible() ?? true;
  const menu = Menu.buildFromTemplate([
    {
      label: visible ? "Hide ncm-desktop" : "Show ncm-desktop",
      click: () => {
        if (mainWindow?.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow?.show();
        }
      },
    },
    {
      label: `Follow System Theme: ${followSystemTheme ? "[ON]" : "[OFF]"}`,
      click: () => {
        followSystemTheme = !followSystemTheme;
        scheduleSave();
        updateThemeState();
        updateTrayMenu();
      },
    },
    { type: "separator" },
    {
      label: "Reload",
      click: () => mainWindow?.webContents?.reload(),
    },
    {
      label: "DevTools",
      click: () => mainWindow?.webContents?.toggleDevTools(),
    },
    { type: "separator" },
    {
      label: "Open Custom Folder",
      click: () => {
        shell.openPath(customDir);
      },
    },
    { type: "separator" },
    {
      label: "About ncm-desktop",
      click: () => showAboutDialog(),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function showAboutDialog() {
  const iconBase64 = fs.readFileSync(getIconPath()).toString("base64");
  const isDark = followSystemTheme && nativeTheme.shouldUseDarkColors;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg: #fff;
      --text-main: #1a1a1a;
      --text-sub: #888;
      --text-desc: #555;
      --border: #f0f0f0;
      --btn-bg: #fafafa;
      --btn-hover: #f0f0f0;
    }
    body.dark-theme {
      --bg: #1e1e1e;
      --text-main: #e0e0e0;
      --text-sub: #aaa;
      --text-desc: #ccc;
      --border: #333;
      --btn-bg: #2a2a2a;
      --btn-hover: #383838;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      text-align: center;
      padding: 36px 40px 0;
      -webkit-font-smoothing: antialiased;
      background: var(--bg);
      color: var(--text-main);
    }
    img { width: 64px; height: 64px; border-radius: 14px; margin-bottom: 14px; }
    h1 { font-size: 17px; font-weight: 600; color: var(--text-main); margin-bottom: 2px; }
    .version { font-size: 12px; color: var(--text-sub); margin-bottom: 18px; }
    .desc { font-size: 13px; color: var(--text-desc); line-height: 1.6; margin-bottom: 14px; }
    .link { font-size: 12px; color: var(--text-sub); }
    .link a { color: #007aff; text-decoration: none; }
    .link a:hover { text-decoration: underline; }
    .footer {
      position: fixed; bottom: 0; left: 0; right: 0;
      padding: 14px 40px;
      border-top: 1px solid var(--border);
      text-align: right;
    }
    button {
      font-size: 13px; padding: 6px 28px;
      border: 1px solid var(--border); border-radius: 6px;
      background: var(--btn-bg); cursor: pointer; color: var(--text-main);
    }
    button:hover { background: var(--btn-hover); }
  </style>
</head>
<body class="${isDark ? "dark-theme" : ""}">
  <img src="data:image/png;base64,${iconBase64}" alt="ncm-desktop">
  <h1>ncm-desktop</h1>
  <p class="version">Version ${app.getVersion()}</p>
  <p class="desc">An unofficial desktop client<br>for NetEase Cloud Music</p>
  <p class="link"><a href="#" id="ghLink">github.com/lonerOrz/ncm-desktop</a></p>
  <div class="footer"><button id="okBtn">OK</button></div>
  <script>
    document.getElementById("okBtn").addEventListener("click", () => window.close());
    document.getElementById("ghLink").addEventListener("click", (e) => {
      e.preventDefault();
      window.open("https://github.com/lonerOrz/ncm-desktop");
    });
  </script>
</body>
</html>`;

  const win = new BrowserWindow({
    width: 380,
    height: 350,
    resizable: false,
    maximizable: false,
    minimizable: false,
    title: "About ncm-desktop",
    parent: mainWindow,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
    },
  });

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  win.webContents.setWindowOpenHandler(() => {
    require("electron").shell.openExternal(
      "https://github.com/lonerOrz/ncm-desktop",
    );
    return { action: "deny" };
  });

  win.removeMenu();
}

function createTray() {
  const icon = nativeImage.createFromPath(getIconPath());
  tray = new Tray(icon.resize({ width: 24, height: 24 }));
  tray.setToolTip("ncm-desktop");

  updateTrayMenu();

  mainWindow.on("show", updateTrayMenu);
  mainWindow.on("hide", updateTrayMenu);

  tray.on("click", () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
    }
  });
}

// --- 启动流程 ---
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  initCustomDir();
  createWindow();
  createTray();
  checkForUpdates();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on("browser-window-created", function (e, window) {
  window.setMenu(null);
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});
