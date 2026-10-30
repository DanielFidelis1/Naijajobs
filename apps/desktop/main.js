/* NaijaJobs desktop shell (Electron). Loads the bundled website from a local,
   loopback-only server so the app works exactly like the web version. */
const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");
const { start } = require("./server");

// Fixed port = fixed origin, so the saved login and settings persist between launches.
const PORT = 38417;
const ORIGIN = "http://127.0.0.1:" + PORT;

let win;
let server;

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on("second-instance", () => {
        if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    });
}

async function createWindow() {
    try {
        server = await start(path.join(__dirname, "web"), PORT);
    } catch (e) {
        console.error("Could not start local server:", e);
        app.quit();
        return;
    }

    win = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 420,
        minHeight: 600,
        title: "NaijaJobs",
        backgroundColor: "#f3f5f1",
        autoHideMenuBar: true,
        show: false,
        icon: path.join(__dirname, "build", "icon.png"),
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });

    win.once("ready-to-show", () => win.show());
    win.loadURL(ORIGIN + "/index.html");

    // Keep navigation inside the app; open everything else in the user's browser.
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:/i.test(url) && !url.startsWith(ORIGIN)) shell.openExternal(url);
        return { action: "deny" };
    });
    win.webContents.on("will-navigate", (event, url) => {
        if (!url.startsWith(ORIGIN)) {
            event.preventDefault();
            if (/^https?:/i.test(url)) shell.openExternal(url);
        }
    });

    win.on("closed", () => { win = null; });
}

app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => {
    if (server) server.close();
    if (process.platform !== "darwin") app.quit();
});
