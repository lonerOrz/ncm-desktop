const { app, BrowserWindow, Tray, Menu, nativeImage, session, dialog, ipcMain, Notification } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");

const DEFAULT_URL = "https://music.163.com/st/webplayer";
const targetUrl = process.argv[2] || DEFAULT_URL;

let mainWindow = null;
let tray = null;
let isQuitting = false;

const stateFile = path.join(app.getPath("userData"), "window-state.json");

let saveTimer = null;
function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveWindowState, 300);
}

function saveWindowState() {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    const maximized = mainWindow.isMaximized();
    try {
        fs.writeFileSync(stateFile, JSON.stringify({ ...bounds, maximized }));
    } catch {}
}

function loadWindowState() {
    try {
        return JSON.parse(fs.readFileSync(stateFile, "utf8"));
    } catch {
        return null;
    }
}

function getIconPath() {
    const local = path.join(__dirname, "icon.png");
    if (fs.existsSync(local)) return local;
    return path.join(__dirname, "..", "icon.png");
}

function injectTrackDetector() {
    mainWindow?.webContents.executeJavaScript(`
        var __ncmLastTitle = '';
        setInterval(function() {
            try {
                var ms = navigator.mediaSession;
                if (ms && ms.metadata && ms.metadata.title) {
                    var t = ms.metadata.title;
                    if (t !== __ncmLastTitle) {
                        __ncmLastTitle = t;
                        window.__ncmTrackUpdate({ 
                            title: t, 
                            artist: ms.metadata.artist || 'Now Playing'
                        });
                    }
                }
            } catch(e) {}
        }, 3000);
    `).catch(() => {});
}

ipcMain.on("track-update", (event, data) => {
    if (!data || !data.title) return;
    const n = new Notification({ 
        title: data.title, 
        body: data.artist, 
        icon: getIconPath() 
    });
    n.on("click", () => {
        mainWindow?.show();
        mainWindow?.focus();
    });
    n.show();
});

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
    try { state = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch {}

    const req = https.get("https://api.github.com/repos/lonerOrz/ncm-desktop/releases/latest", {
        headers: { "User-Agent": "ncm-desktop", Accept: "application/vnd.github.v3+json" },
        timeout: 10000,
    }, (res) => {
        let body = "";
        res.on("data", (c) => body += c);
        res.on("end", () => {
            try {
                const release = JSON.parse(body);
                const latest = release.tag_name.replace(/^v/, "");
                const current = app.getVersion();

                if (latest !== state.checkedVersion && compareVersions(latest, current) > 0) {
                    const n = new Notification({
                        title: "ncm-desktop Update Available",
                        body: `v${latest} released (current: v${current})`,
                    });
                    n.on("click", () => {
                        require("electron").shell.openExternal("https://github.com/lonerOrz/ncm-desktop/releases/latest");
                    });
                    n.show();
                }

                state.checkedVersion = latest;
                fs.writeFileSync(statePath, JSON.stringify(state));
            } catch {}
        });
    });
    req.on("error", () => {});
    req.end();
}

function createWindow() {
    const saved = loadWindowState();

    mainWindow = new BrowserWindow({
        width: saved?.width || 1920,
        height: saved?.height || 1080,
        x: saved?.x,
        y: saved?.y,
        icon: getIconPath(),
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

    mainWindow.webContents.userAgent =
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    mainWindow.loadURL(targetUrl);

    mainWindow.webContents.on("did-finish-load", () => {
        injectTrackDetector();
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

    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const url = details.url.toLowerCase();
        const adDomains = [
            "doubleclick.net",
            "google-analytics.com",
            "googleadservices.com",
            "googlesyndication.com",
            "adnxs.com",
            "amazon-adsystem.com",
            "advertising.com",
        ];
        if (adDomains.some((domain) => url.includes(domain))) {
            callback({ cancel: true });
        } else {
            callback({ cancel: false });
        }
    });
}

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

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      text-align: center;
      padding: 36px 40px 0;
      -webkit-font-smoothing: antialiased;
      background: #fff;
    }
    img { width: 64px; height: 64px; border-radius: 14px; margin-bottom: 14px; }
    h1 { font-size: 17px; font-weight: 600; color: #1a1a1a; margin-bottom: 2px; }
    .version { font-size: 12px; color: #888; margin-bottom: 18px; }
    .desc { font-size: 13px; color: #555; line-height: 1.6; margin-bottom: 14px; }
    .link { font-size: 12px; color: #999; }
    .link a { color: #007aff; text-decoration: none; }
    .link a:hover { text-decoration: underline; }
    .footer {
      position: fixed; bottom: 0; left: 0; right: 0;
      padding: 14px 40px;
      border-top: 1px solid #f0f0f0;
      text-align: right;
    }
    button {
      font-size: 13px; padding: 6px 28px;
      border: 1px solid #ddd; border-radius: 6px;
      background: #fafafa; cursor: pointer; color: #333;
    }
    button:hover { background: #f0f0f0; }
    button:active { background: #e8e8e8; }
  </style>
</head>
<body>
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
        require("electron").shell.openExternal("https://github.com/lonerOrz/ncm-desktop");
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

app.on("window-all-closed", function () {});
