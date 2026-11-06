
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "dist-pages");
const BASE = "/Naijajobs";

function copyFile(source, destination) {
    fs.copyFileSync(
        path.join(ROOT, source),
        path.join(OUTPUT, destination || source)
    );
}

function replaceRequired(content, oldText, newText, filename) {
    if (!content.includes(oldText)) {
        throw new Error(
            `Expected text was not found in ${filename}: ${oldText}`
        );
    }

    return content.replaceAll(oldText, newText);
}

function updateFile(relativePath, replacements) {
    const filePath = path.join(OUTPUT, relativePath);
    let content = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");

    for (const [oldText, newText] of replacements) {
        content = replaceRequired(
            content,
            oldText,
            newText,
            relativePath
        );
    }

    fs.writeFileSync(filePath, content, "utf8");
}

function copyDirectory(name) {
    const source = path.join(ROOT, name);

    if (!fs.existsSync(source)) {
        throw new Error(`Required folder is missing: ${name}`);
    }

    fs.cpSync(source, path.join(OUTPUT, name), {
        recursive: true
    });
}

function main() {
    if (fs.existsSync(OUTPUT)) {
        fs.rmSync(OUTPUT, {
            recursive: true,
            force: true
        });
    }

    fs.mkdirSync(OUTPUT, { recursive: true });

    // Copy every website HTML page.
    const htmlFiles = fs.readdirSync(ROOT)
        .filter(name => name.toLowerCase().endsWith(".html"));

    if (htmlFiles.length !== 24) {
        throw new Error(
            `Expected 24 HTML pages, found ${htmlFiles.length}.`
        );
    }

    for (const file of htmlFiles) {
        copyFile(file);
    }

    // Copy the website's static asset folders.
    for (const folder of ["css", "js", "icons"]) {
        copyDirectory(folder);
    }

    // Copy the PWA files.
    for (const file of [
        "manifest.json",
        "sw.js",
        "service-worker.js"
    ]) {
        copyFile(file);
    }

    // Update the copied PWA manifest.
    const manifestPath = path.join(OUTPUT, "manifest.json");
    const manifest = JSON.parse(
        fs.readFileSync(manifestPath, "utf8")
    );

    manifest.id = `${BASE}/`;
    manifest.start_url = `${BASE}/index.html`;
    manifest.scope = `${BASE}/`;

    for (const icon of manifest.icons || []) {
        icon.src = `${BASE}/${icon.src.replace(/^\/+/, "")}`;
    }

    for (const shortcut of manifest.shortcuts || []) {
        shortcut.url = `${BASE}/${shortcut.url.replace(/^\/+/, "")}`;

        for (const icon of shortcut.icons || []) {
            icon.src = `${BASE}/${icon.src.replace(/^\/+/, "")}`;
        }
    }

    fs.writeFileSync(
        manifestPath,
        JSON.stringify(manifest, null, 2) + "\n",
        "utf8"
    );

    // Fix the homepage service worker registration.
    updateFile("index.html", [
        [
            'navigator.serviceWorker.register("/sw.js")',
            `navigator.serviceWorker.register("${BASE}/sw.js")`
        ]
    ]);

    // Fix offline page paths.
    updateFile("offline.html", [
        ['href="/css/style.css"', `href="${BASE}/css/style.css"`],
        ['href="/css/polish.css"', `href="${BASE}/css/polish.css"`],
        ['href="/index.html"', `href="${BASE}/index.html"`]
    ]);

    // Fix browser push notification registration.
    updateFile("js/push-notifications.js", [
        [
            'navigator.serviceWorker.register("/sw.js")',
            `navigator.serviceWorker.register("${BASE}/sw.js")`
        ]
    ]);
    // Remove the native-only bundle reference from the browser website copy.
updateFile("dashboard.html", [
    [
        '    <script src="js/native-push.bundle.js"></script>\n',
        ""
    ]
]);

    // Adapt the main service worker to the GitHub Pages subdirectory.
    const swPaths = [
        "/offline.html",
        "/css/style.css",
        "/css/polish.css",
        "/js/shell.js",
        "/js/polish.js",
        "/icons/naijajobs-192.png",
        "/icons/naijajobs-512.png",
        "/icons/naijajobs-96.png",
        "/sw.js",
        "/service-worker.js",
        "/dashboard.html",
        "/browse.html",
        "/my-jobs.html",
        "/messages.html",
        "/profile.html",
        "/notifications.html"
    ];

    const swReplacements = swPaths.map(file => [
        `"${file}"`,
        `"${BASE}${file}"`
    ]);

    updateFile("sw.js", swReplacements);

    // Accept notification destinations sent using the old root paths.
    updateFile("sw.js", [
        [
            `        if (
            url.origin === self.location.origin &&
            allowedPaths.includes(url.pathname)
        ) {
            targetUrl = url.pathname + url.search;
        }`,
            `        const appPath = url.pathname.startsWith("${BASE}/")
            ? url.pathname
            : "${BASE}" + url.pathname;

        if (
            url.origin === self.location.origin &&
            allowedPaths.includes(appPath)
        ) {
            targetUrl = appPath + url.search;
        }`
        ]
    ]);

    // Adapt the legacy service worker import.
    updateFile("service-worker.js", [
        [
            'importScripts("/sw.js");',
            `importScripts("${BASE}/sw.js");`
        ]
    ]);

    // Prevent GitHub Pages from applying Jekyll processing.
    fs.writeFileSync(
        path.join(OUTPUT, ".nojekyll"),
        "",
        "utf8"
    );

    console.log("");
    console.log("NaijaJobs GitHub Pages copy prepared successfully.");
    console.log(`Website pages copied: ${htmlFiles.length}`);
    console.log("Asset folders copied: css, js, icons");
    console.log("PWA paths adapted for: " + BASE);
    console.log("Secrets and native app folders excluded.");
    console.log("");
    console.log("Output folder: dist-pages");
}

main();
