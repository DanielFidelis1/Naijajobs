/* NaijaJobs Service Worker
   - Push notifications (unchanged behaviour)
   - Offline support: network-first for same-origin files, so users always get
     the latest version when online and a working shell when offline.
   - Supabase / API traffic is never cached. */

const CACHE_NAME = "naijajobs-shell-v2";
const PRECACHE = [
    "/offline.html",
    "/css/style.css",
    "/css/polish.css",
    "/js/shell.js",
    "/js/polish.js",
    "/icons/naijajobs-192.png",
    "/icons/naijajobs-512.png",
    "/icons/naijajobs-96.png"
];

self.addEventListener("install", function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function (cache) { return cache.addAll(PRECACHE); })
            .catch(function () { /* never block install on a missing file */ })
            .then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener("activate", function (event) {
    event.waitUntil(
        caches.keys().then(function (names) {
            return Promise.all(names
                .filter(function (n) { return n.indexOf("naijajobs-") === 0 && n !== CACHE_NAME; })
                .map(function (n) { return caches.delete(n); }));
        }).then(function () { return self.clients.claim(); })
    );
});

self.addEventListener("fetch", function (event) {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;          // Supabase, fonts, CDN: browser handles
    if (url.pathname === "/sw.js" || url.pathname === "/service-worker.js") return;
    if (/\/(supabase|functions|rest|auth|storage)\//.test(url.pathname)) return;

    event.respondWith(
        fetch(request)
            .then(function (response) {
                if (response && response.ok && response.type === "basic") {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
                }
                return response;
            })
            .catch(function () {
                return caches.match(request).then(function (hit) {
                    if (hit) return hit;
                    if (request.mode === "navigate") return caches.match("/offline.html");
                    return Response.error();
                });
            })
    );
});

/* NaijaJobs Service Worker */

self.addEventListener("push", function (event) {
    let data = {
        title: "NaijaJobs",
        body: "You have a new notification.",
        url: "/dashboard.html"
    };

    if (event.data) {
        try {
            data = {
                ...data,
                ...event.data.json()
            };
        } catch (error) {
            data.body = event.data.text();
        }
    }

    const allowedPaths = [
        "/dashboard.html",
        "/browse.html",
        "/my-jobs.html",
        "/messages.html",
        "/profile.html",
        "/notifications.html"
    ];

    let targetUrl = "/dashboard.html";

    try {
        const url = new URL(data.url, self.location.origin);

        if (
            url.origin === self.location.origin &&
            allowedPaths.includes(url.pathname)
        ) {
            targetUrl = url.pathname + url.search;
        }
    } catch (error) {
        // Keep the safe dashboard fallback.
    }

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: "/icons/naijajobs-192.png",
            badge: "/icons/naijajobs-96.png",
            tag: data.tag || "naijajobs-notification",
            data: {
                url: targetUrl
            }
        })
    );
});

self.addEventListener("notificationclick", function (event) {
    event.notification.close();

    const targetUrl =
        new URL(
            event.notification.data?.url || "/dashboard.html",
            self.location.origin
        ).href;

    event.waitUntil(
        self.clients.matchAll({
            type: "window",
            includeUncontrolled: true
        }).then(function (clients) {
            for (const client of clients) {
                if (
                    new URL(client.url).origin === self.location.origin &&
                    "focus" in client
                ) {
                    return client.navigate(targetUrl).then(function () {
                        return client.focus();
                    });
                }
            }

            return self.clients.openWindow(targetUrl);
        })
    );
});
