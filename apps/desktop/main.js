
/* NaijaJobs desktop shell (Electron).
   Loads the bundled website from a local, loopback-only server. */

const {
    app,
    BrowserWindow,
    shell,
    Menu,
    dialog
} = require("electron");

const path = require("path");
const { start } = require("./server");

// Fixed port preserves login and settings between launches.
const PORT = 38417;
const ORIGIN = "http://127.0.0.1:" + PORT;

let win;
let server;
let isQuitting = false;

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on("second-instance", () => {
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
    });
}

function showStartupError(title, message) {
    dialog.showMessageBox({
        type: "error",
        title,
        message,
        detail: message,
        buttons: ["Close"],
        defaultId: 0
    }).finally(() => {
        app.quit();
    });
}

async function createWindow() {
    try {
        server = await start(
            path.join(__dirname, "web"),
            PORT
        );
    } catch (error) {
        console.error("Could not start local server:", error);

        showStartupError(
            "NaijaJobs could not start",
            "The app could not start its local server.\n\n" +
            "Please restart NaijaJobs. If the problem continues, " +
            "contact support.\n\n" +
            "Error: " + (error.message || "Unknown error")
        );

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

        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    // Show the window only after the first page is ready.
    win.once("ready-to-show", () => {
        if (win && !win.isDestroyed()) {
            win.show();
        }
    });

    // Keep navigation inside the app.
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (
            /^https?:/i.test(url) &&
            !url.startsWith(ORIGIN)
        ) {
            shell.openExternal(url);
        }

        return { action: "deny" };
    });

    win.webContents.on("will-navigate", (event, url) => {
        if (!url.startsWith(ORIGIN)) {
            event.preventDefault();

            if (/^https?:/i.test(url)) {
                shell.openExternal(url);
            }
        }
    });

    // Handle website loading failures.
    win.webContents.on("did-fail-load", (
        event,
        errorCode,
        errorDescription,
        validatedURL,
        isMainFrame
    ) => {
        if (
            isMainFrame &&
            validatedURL.startsWith(ORIGIN) &&
            errorCode !== -3 &&
            win &&
            !win.isDestroyed()
        ) {
            console.error(
                "NaijaJobs page failed to load:",
                errorCode,
                errorDescription
            );

            dialog.showMessageBox({
                type: "error",
                title: "Unable to load NaijaJobs",
                message: "NaijaJobs could not load its home screen.",
                detail:
                    "Please close and reopen the app. " +
                    "If the problem continues, contact support.\n\n" +
                    "Error: " + errorDescription,
                buttons: ["Close"]
            }).then(() => {
                if (win && !win.isDestroyed()) {
                    win.close();
                }
            });
        }
    });

    win.on("closed", () => {
        win = null;
    });

    win.loadURL(ORIGIN + "/index.html").catch(error => {
        console.error("NaijaJobs page loading error:", error);
    });
}

app.whenReady().then(() => {
    Menu.setApplicationMenu(null);

    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on("before-quit", () => {
    isQuitting = true;

    if (server) {
        server.close();
        server = null;
    }
});

app.on("window-all-closed", () => {
    if (!isQuitting && server) {
        server.close();
        server = null;
    }

    if (process.platform !== "darwin") {
        app.quit();
    }
});
