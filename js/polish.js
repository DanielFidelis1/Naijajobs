/* =====================================================
   NaijaJobs polish layer (progressive enhancement)
   Adds: skip link, live-region announcements, toasts,
   offline notice, install prompt, mobile tab bar.
   Never touches app.js logic; every part is wrapped so a
   failure here cannot break the app.
   ===================================================== */
(function () {
    "use strict";

    function safe(fn) { try { fn(); } catch (e) { console.warn("NaijaJobs polish:", e); } }

    /* ---------- toasts: window.njToast(message, {type, action, onAction, duration}) ---------- */
    var toastHost;
    function host() {
        if (!toastHost) {
            toastHost = document.createElement("div");
            toastHost.className = "nj-toasts";
            toastHost.setAttribute("role", "status");
            toastHost.setAttribute("aria-live", "polite");
            document.body.appendChild(toastHost);
        }
        return toastHost;
    }
    window.njToast = function (message, opts) {
        opts = opts || {};
        var el = document.createElement("div");
        el.className = "nj-toast" + (opts.type ? " is-" + opts.type : "");
        var text = document.createElement("span");
        text.textContent = message;
        el.appendChild(text);
        function close() {
            el.classList.add("is-leaving");
            setTimeout(function () { el.remove(); }, 220);
        }
        if (opts.action) {
            var b = document.createElement("button");
            b.type = "button";
            b.textContent = opts.action;
            b.addEventListener("click", function () { if (opts.onAction) opts.onAction(); close(); });
            el.appendChild(b);
        }
        host().appendChild(el);
        setTimeout(close, opts.duration || 4500);
        return close;
    };

    /* ---------- accessibility helpers ---------- */
    safe(function () {
        var main = document.querySelector("main");
        if (main && !document.querySelector(".skip-link")) {
            if (!main.id) main.id = "main-content";
            main.setAttribute("tabindex", "-1");
            var skip = document.createElement("a");
            skip.className = "skip-link";
            skip.href = "#" + main.id;
            skip.textContent = "Skip to main content";
            document.body.insertBefore(skip, document.body.firstChild);
        }

        // Make status messages announce themselves to screen readers.
        document.querySelectorAll(".form-message, .auth-message, .profile-message, .nj-chat-notice").forEach(function (el) {
            if (!el.hasAttribute("role")) el.setAttribute("role", "status");
            if (!el.hasAttribute("aria-live")) el.setAttribute("aria-live", "polite");
        });
        document.querySelectorAll(".notice, .nj-chat-error").forEach(function (el) {
            if (!el.hasAttribute("role")) el.setAttribute("role", "alert");
        });

        // Decorative SVGs shouldn't be read out; images need alt text.
        document.querySelectorAll("svg:not([role]):not([aria-label])").forEach(function (s) { s.setAttribute("aria-hidden", "true"); });
        document.querySelectorAll("img:not([alt])").forEach(function (i) { i.setAttribute("alt", ""); });
        document.querySelectorAll("img:not([loading])").forEach(function (i) { i.setAttribute("loading", "lazy"); });

        // Helpful mobile keyboards without changing any existing field behaviour.
        document.querySelectorAll('input[type="email"]:not([autocomplete])').forEach(function (i) { i.setAttribute("autocomplete", "email"); });
        document.querySelectorAll('input[type="password"]:not([autocomplete])').forEach(function (i) {
            i.setAttribute("autocomplete", /login/.test(location.pathname) ? "current-password" : "new-password");
        });
    });

    /* ---------- offline / online notice ---------- */
    safe(function () {
        var bar = document.createElement("div");
        bar.className = "nj-offline";
        bar.setAttribute("role", "status");
        bar.textContent = "You're offline. Some things may not load until you reconnect.";
        document.body.appendChild(bar);

        function update(announce) {
            var off = navigator.onLine === false;
            bar.classList.toggle("is-visible", off);
            if (announce && !off) window.njToast("Back online", { type: "success", duration: 2500 });
        }
        window.addEventListener("offline", function () { update(false); });
        window.addEventListener("online", function () { update(true); });
        update(false);
    });

    /* ---------- install prompt (Android Chrome, desktop Chrome/Edge) ---------- */
    safe(function () {
        var deferred;
        var DISMISS_KEY = "nj-install-dismissed";
        function dismissed() {
            try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < 7 * 864e5; } catch (e) { return false; }
        }
        var isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
        if (isStandalone) return;

        var card = document.createElement("div");
        card.className = "nj-install";
        card.setAttribute("role", "dialog");
        card.setAttribute("aria-label", "Install NaijaJobs");
        card.innerHTML =
            '<img src="icons/naijajobs-96.png" alt="" width="48" height="48">' +
            '<div><strong>Install NaijaJobs</strong><small>Faster access, full screen, works offline.</small></div>' +
            '<button type="button" class="btn btn-yellow nj-install-go">Install</button>' +
            '<button type="button" class="nj-install-close" aria-label="Dismiss install prompt">\u00d7</button>';
        document.body.appendChild(card);

        window.addEventListener("beforeinstallprompt", function (e) {
            e.preventDefault();
            deferred = e;
            if (!dismissed()) card.classList.add("is-visible");
        });
        card.querySelector(".nj-install-go").addEventListener("click", function () {
            if (!deferred) return;
            deferred.prompt();
            deferred.userChoice.finally(function () { deferred = null; card.classList.remove("is-visible"); });
        });
        card.querySelector(".nj-install-close").addEventListener("click", function () {
            card.classList.remove("is-visible");
            try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) { /* ignore */ }
        });
        window.addEventListener("appinstalled", function () {
            card.classList.remove("is-visible");
            window.njToast("NaijaJobs installed", { type: "success" });
        });
    });

    /* ---------- mobile app shell: header, profile menu, role-based liquid tab bar ----------
       All of this is hidden by CSS above 768px, so laptops keep the normal sidebar.
       The original sidebar stays in the page (hidden on phones) because app.js
       wires up its Log out button and unread badges. */
    safe(function () {
        var body = document.body;
        if (!body.classList.contains("app") || !document.getElementById("nj-sidebar")) return;

        var page = (location.pathname.split("/").pop() || "index.html").replace(".html", "");
        body.setAttribute("data-page", page);
        body.classList.add("nj-has-appbar");

        var ICONS = {
            home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
            plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
            work: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M3 13h18"/>',
            chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
            search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
            clip: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4.5h6V3H9z"/><path d="M9 11h6M9 15h6"/>',
            bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7"/><path d="M10 20a2 2 0 0 0 4 0"/>',
            user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
            gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
            mega: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a4 4 0 0 1 0 6"/><path d="M18 6.5a8 8 0 0 1 0 11"/>',
            help: '<path d="M4 14v-3a8 8 0 0 1 16 0v3"/><path d="M4 14H3a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h3v-6H4z"/><path d="M20 14h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-3v-6h2z"/>',
            out: '<path d="M9 21H5V3h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
            chev: '<path d="m9 6 6 6-6 6"/>'
        };
        function svg(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[n] + "</svg>"; }

        /* ----- who is signed in (read-only, same query app.js already makes) ----- */
        var CACHE_KEY = "nj-me";
        var me = { role: null, name: "", pic: "" };
        try { var c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); if (c) { me.role = c.role; me.name = c.name || ""; } } catch (e) { /* ignore */ }

        function greeting() {
            var h = new Date().getHours();
            return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
        }
        function firstName() { return (me.name || "").trim().split(/\s+/)[0] || ""; }
        function initial() { return (me.name || "N").trim().charAt(0).toUpperCase(); }

        /* ----- header ----- */
        var bar = document.createElement("header");
        bar.className = "nj-appbar";
        bar.innerHTML =
            '<a class="nj-brand" href="dashboard.html" aria-label="NaijaJobs home">' +
                '<span class="nj-mark" aria-hidden="true">N</span>' +
                '<span class="nj-brand-text"><b>Naija<em>Jobs</em></b><small>Find your next opportunity</small></span>' +
            "</a>" +
            '<a class="nj-bell" href="notifications.html" aria-label="Notifications">' + svg("bell") +
                '<span class="nj-bell-badge" id="nj-bell-badge" hidden></span></a>' +
            '<button type="button" class="nj-avatar-btn" id="nj-avatar-btn" aria-label="Open profile menu" aria-haspopup="menu" aria-expanded="false" aria-controls="nj-profile-menu">' +
                '<span class="nj-avatar-letter" id="nj-avatar-letter">' + initial() + "</span>" +
                '<img class="nj-avatar-img" id="nj-avatar-img" alt="" hidden></button>';
        body.insertBefore(bar, body.firstChild);

        /* ----- profile menu ----- */
        var scrim = document.createElement("div");
        scrim.className = "nj-menu-scrim";
        scrim.hidden = true;
        var menu = document.createElement("div");
        menu.className = "nj-profile-menu";
        menu.id = "nj-profile-menu";
        menu.setAttribute("role", "menu");
        menu.setAttribute("aria-label", "Profile menu");
        menu.hidden = true;
        menu.innerHTML =
            '<a class="nj-pm-head" href="profile.html" role="menuitem">' +
                '<span class="nj-pm-avatar"><span id="nj-pm-letter">' + initial() + '</span><img id="nj-pm-img" alt="" hidden></span>' +
                '<span class="nj-pm-who"><strong id="nj-pm-name">' + (me.name || "Your account") + "</strong><small>View and manage your account</small></span>" +
                svg("chev") + "</a>" +
            '<a class="nj-pm-item" href="profile.html" role="menuitem">' + svg("user") + "<span>My Profile</span>" + svg("chev") + "</a>" +
            '<a class="nj-pm-item" href="profile.html#email-alerts-card" role="menuitem">' + svg("gear") + "<span>Settings</span>" + svg("chev") + "</a>" +
            '<a class="nj-pm-item" href="announcements.html" role="menuitem">' + svg("mega") + "<span>Announcements</span>" + svg("chev") + "</a>" +
            '<a class="nj-pm-item" href="support.html" role="menuitem">' + svg("help") + "<span>Support</span>" + svg("chev") + "</a>" +
            '<button type="button" class="nj-pm-item nj-pm-logout" role="menuitem">' + svg("out") + "<span>Log Out</span></button>";
        body.appendChild(scrim);
        body.appendChild(menu);

        var avatarBtn = document.getElementById("nj-avatar-btn");
        function openMenu() {
            menu.hidden = false; scrim.hidden = false;
            requestAnimationFrame(function () { menu.classList.add("is-open"); scrim.classList.add("is-open"); });
            avatarBtn.setAttribute("aria-expanded", "true");
            var first = menu.querySelector("a,button"); if (first) first.focus({ preventScroll: true });
        }
        function closeMenu(returnFocus) {
            menu.classList.remove("is-open"); scrim.classList.remove("is-open");
            avatarBtn.setAttribute("aria-expanded", "false");
            setTimeout(function () { menu.hidden = true; scrim.hidden = true; }, 180);
            if (returnFocus) avatarBtn.focus({ preventScroll: true });
        }
        avatarBtn.addEventListener("click", function () { menu.hidden ? openMenu() : closeMenu(true); });
        scrim.addEventListener("click", function () { closeMenu(false); });
        document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !menu.hidden) closeMenu(true); });
        menu.querySelector(".nj-pm-logout").addEventListener("click", function () {
            closeMenu(false);
            try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* ignore */ }
            var real = document.getElementById("logout-button"); // app.js confirms and signs out
            if (real) real.click();
        });

        /* ----- bell badge mirrors the unread count app.js already maintains ----- */
        function mirror(srcId, dst) {
            var src = document.getElementById(srcId);
            if (!src || !dst) return;
            function sync() {
                var n = (src.textContent || "").trim();
                var show = !src.hidden && n && n !== "0";
                dst.hidden = !show;
                dst.textContent = show ? (Number(n) > 9 ? "9+" : n) : "";
            }
            new MutationObserver(sync).observe(src, { attributes: true, childList: true, characterData: true, subtree: true });
            sync();
        }
        mirror("notifications-unread-badge", document.getElementById("nj-bell-badge"));

        /* ----- bottom navigation: different for clients and workers ----- */
        var tabbar = null;
        function tabsFor(role) {
            return role === "client"
                ? [
                    { page: "dashboard", href: "dashboard.html", label: "Home", icon: "home", match: ["dashboard"] },
                    { page: "post-job", href: "post-job.html", label: "Post Job", icon: "plus", match: ["post-job"] },
                    { page: "my-jobs", href: "my-jobs.html", label: "My Work", icon: "work", match: ["my-jobs", "applicants"] },
                    { page: "messages", href: "messages.html", label: "Messages", icon: "chat", match: ["messages", "message"], badge: true }
                ]
                : [
                    { page: "dashboard", href: "dashboard.html", label: "Home", icon: "home", match: ["dashboard"] },
                    { page: "browse", href: "browse.html", label: "Find Jobs", icon: "search", match: ["browse", "job"] },
                    { page: "applications", href: "applications.html", label: "Applications", icon: "clip", match: ["applications"] },
                    { page: "messages", href: "messages.html", label: "Messages", icon: "chat", match: ["messages", "message"], badge: true }
                ];
        }
        function buildTabbar(role) {
            if (tabbar) tabbar.remove();
            var tabs = tabsFor(role);
            tabbar = document.createElement("nav");
            tabbar.className = "nj-tabbar";
            tabbar.setAttribute("aria-label", role === "client" ? "Client navigation" : "Worker navigation");
            var activeIdx = -1;
            tabs.forEach(function (t, i) { if (t.match.indexOf(page) !== -1) activeIdx = i; });
            tabbar.innerHTML = '<span class="nj-pill" aria-hidden="true"></span>' + tabs.map(function (t, i) {
                return '<a class="nj-tab' + (i === activeIdx ? " is-active" : "") + '" href="' + t.href + '"' + (i === activeIdx ? ' aria-current="page"' : "") + ">" +
                    '<span class="nj-tab-icon">' + svg(t.icon) + (t.badge ? '<span class="nj-tab-badge" id="nj-tab-messages-badge" hidden aria-hidden="true"></span>' : "") + "</span>" +
                    "<span class=\"nj-tab-label\">" + t.label + "</span></a>";
            }).join("");
            body.appendChild(tabbar);
            body.classList.add("nj-has-tabbar");
            mirror("messages-unread-badge", document.getElementById("nj-tab-messages-badge"));

            // Liquid pill: slide from the tab you were on to the one you're on now.
            var pill = tabbar.querySelector(".nj-pill");
            var tabEls = tabbar.querySelectorAll(".nj-tab");
            function place(i, animate) {
                var el = tabEls[i];
                if (!el) return;
                pill.style.transition = animate ? "" : "none";
                pill.style.width = el.offsetWidth + "px";
                pill.style.transform = "translateX(" + el.offsetLeft + "px)";
            }
            if (activeIdx === -1) { pill.style.opacity = "0"; }
            else {
                var from = -1;
                try { var prev = JSON.parse(sessionStorage.getItem("nj-tab-prev") || "null"); if (prev && prev.role === role) from = prev.idx; } catch (e) { /* ignore */ }
                place(from > -1 ? from : activeIdx, false);
                void pill.offsetWidth;
                requestAnimationFrame(function () { place(activeIdx, true); });
                try { sessionStorage.setItem("nj-tab-prev", JSON.stringify({ role: role, idx: activeIdx })); } catch (e) { /* ignore */ }
            }
            window.addEventListener("resize", function () { if (activeIdx > -1) place(activeIdx, false); });
            tabEls.forEach(function (el, i) {
                el.addEventListener("click", function () {
                    if (i === activeIdx) return;
                    place(i, true);
                    try { sessionStorage.setItem("nj-tab-prev", JSON.stringify({ role: role, idx: activeIdx })); } catch (e) { /* ignore */ }
                });
            });
        }

        function applyMe() {
            var role = me.role === "client" ? "client" : "worker";
            body.setAttribute("data-role", role);
            if (!tabbar || tabbar.getAttribute("data-role") !== role) { buildTabbar(role); tabbar.setAttribute("data-role", role); }
            var L = initial();
            ["nj-avatar-letter", "nj-pm-letter"].forEach(function (id) { var el = document.getElementById(id); if (el) el.textContent = L; });
            var nm = document.getElementById("nj-pm-name"); if (nm && me.name) nm.textContent = me.name;

            // Friendly greeting on the home screen (phones only)
            if (page === "dashboard" && window.matchMedia("(max-width: 768px)").matches && firstName()) {
                var h1 = document.querySelector(".page-head h1");
                var sub = document.querySelector(".page-head .sub");
                if (h1) h1.textContent = greeting() + ", " + firstName();
                if (sub) sub.textContent = role === "client" ? "Here\u2019s what\u2019s happening with your jobs today." : "Find the right job and grow your skills.";
            }
        }

        applyMe(); // instant, from the cached role (defaults to worker on the very first visit)

        var sb = window.supabaseClient;
        if (sb && sb.auth) {
            sb.auth.getUser().then(function (r) {
                var u = r && r.data && r.data.user;
                if (!u) return;
                return sb.from("profiles").select("account_type, full_name, profile_picture_path").eq("id", u.id).maybeSingle().then(function (res) {
                    var p = res && res.data;
                    if (!p) return;
                    me.role = p.account_type === "client" ? "client" : "worker";
                    me.name = p.full_name || "";
                    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ role: me.role, name: me.name })); } catch (e) { /* ignore */ }
                    applyMe();
                    if (p.profile_picture_path && sb.storage) {
                        sb.storage.from("profile-pictures").createSignedUrl(p.profile_picture_path, 3600).then(function (pic) {
                            var url = pic && pic.data && pic.data.signedUrl;
                            if (!url) return;
                            [["nj-avatar-img", "nj-avatar-letter"], ["nj-pm-img", "nj-pm-letter"]].forEach(function (pair) {
                                var img = document.getElementById(pair[0]), let_ = document.getElementById(pair[1]);
                                if (!img) return;
                                img.onload = function () { img.hidden = false; if (let_) let_.hidden = true; };
                                img.src = url;
                            });
                        });
                    }
                });
            }).catch(function () { /* keep cached/default view */ });
        }
    });

    /* ---------- smooth page transitions on supported browsers ---------- */
    safe(function () {
        if (!("startViewTransition" in document) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        var s = document.createElement("style");
        s.textContent = "@view-transition { navigation: auto; } ::view-transition-old(root), ::view-transition-new(root) { animation-duration: .18s; }";
        document.head.appendChild(s);
    });
})();
