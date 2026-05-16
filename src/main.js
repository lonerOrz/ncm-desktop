const { app, BrowserWindow, Tray, Menu, nativeImage, session } = require("electron");
const path = require("path");
const fs = require("fs");

const DEFAULT_URL = "https://music.163.com/st/webplayer";
const targetUrl = process.argv[2] || DEFAULT_URL;

let mainWindow = null;
let tray = null;
let isQuitting = false;

function getIconPath() {
    const local = path.join(__dirname, "icon.png");
    if (fs.existsSync(local)) return local;
    return path.join(__dirname, "..", "icon.png");
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        icon: getIconPath(),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: false,
            webviewTag: true,
        },
    });

    mainWindow.webContents.userAgent =
        "Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0";
    mainWindow.loadURL(targetUrl);

    mainWindow.on("close", (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

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
            label: visible ? "Hide ncm desktop" : "Show ncm desktop",
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
            label: "Quit",
            click: () => {
                isQuitting = true;
                app.quit();
            },
        },
    ]);
    tray.setContextMenu(menu);
}

function createTray() {
    const icon = nativeImage.createFromPath(getIconPath());
    tray = new Tray(icon.resize({ width: 24, height: 24 }));
    tray.setToolTip("ncm desktop");

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

app.whenReady().then(() => {
    createWindow();
    createTray();

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

// Don't quit — tray keeps the app alive when all windows are hidden
app.on("window-all-closed", function () {});
