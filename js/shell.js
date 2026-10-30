/* =========================================
   NaijaJobs - shared navigation
   Edit the menu here once and every page updates.
   Must load BEFORE app.js (app.js wires up the
   menu button, overlay and logout button).
   ========================================= */
(function () {
    "use strict";

    var current = (location.pathname.split("/").pop() || "index.html").replace(".html", "");

    // Pages that belong under another menu item.
    var parent = { job: "browse", applicants: "my-jobs" };
    var active = parent[current] || current;

    var icons = {
        home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v12h14V9"/>',
        search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
        doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h6"/>',
        bag: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2"/><path d="M3 13h18"/>',
        plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
        chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
        user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
        bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7"/><path d="M10 20a2 2 0 0 0 4 0"/>',
        support: '<path d="M4 14v-3a8 8 0 0 1 16 0v3"/><path d="M4 14H3a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h3v-6H4z"/><path d="M20 14h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-3v-6h2z"/>',
        user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
        out: '<path d="M9 21H5V3h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
        megaphone: '<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M15 3.50312C15 2.47681 13.9924 1.75361 13.0201 2.08197L2.02008 5.7966C1.41043 6.00248 1 6.57427 1 7.21776V8.78323C1 9.42595 1.40947 9.99725 2.01813 10.2037L4 10.876V12C4 13.6568 5.34315 15 7 15C8.35497 15 9.50014 14.1017 9.87246 12.8681L13.0181 13.9353C13.9909 14.2652 15 13.5419 15 12.5148V3.50312ZM13.34 3.02941C13.6641 2.91995 14 3.16102 14 3.50312V12.5148C14 12.8572 13.6636 13.0983 13.3394 12.9883L2.33938 9.25673C2.13649 9.1879 2 8.99747 2 8.78323V7.21776C2 7.00326 2.13681 6.81266 2.34003 6.74404L13.34 3.02941ZM8.9244 12.5465C8.68661 13.3854 7.91507 14 7 14C5.89543 14 5 13.1045 5 12V11.2153L8.9244 12.5465Z"/></svg>'
    };

    var menu = [
        { page: "dashboard", href: "dashboard.html", label: "Dashboard", icon: "home" },
        { group: "Find work" },
        { page: "browse", href: "browse.html", label: "Find jobs", icon: "search" },
        { page: "applications", href: "applications.html", label: "My applications", icon: "doc" },
        { group: "Hire" },
        { page: "post-job", href: "post-job.html", label: "Post a job", icon: "plus" },
        { page: "my-jobs", href: "my-jobs.html", label: "My jobs", icon: "bag" },
        { group: "Account" },
        { page: "messages", href: "messages.html", label: "Messages", icon: "chat", badge: "messages-unread-badge" },
        {page: "notifications", href: "notifications.html", label: "Notifications", icon: "bell", badge: 'notifications-unread-badge'},
       { page: "announcements", href: "announcements.html", label: "Announcements", icon: "megaphone" },
       { page: "support", href: "support.html", label: "Contact Support", icon: "support" },
        { page: "profile", href: "profile.html", label: "Profile", icon: "user" }
    ];

    function svg(name) {
        return '<svg viewBox="0 0 24 24" aria-hidden="true">' + icons[name] + "</svg>";
    }

    var links = menu.map(function (item) {
        if (item.group) {
            return '<p class="nav-label">' + item.group + "</p>";
        }
        var isActive = item.page === active;
        return '<a class="nav-link" href="' + item.href + '"' +
            (isActive ? ' aria-current="page"' : "") + ">" +
            svg(item.icon) +
            "<span>" + item.label + "</span>" +
            (item.badge
                ? '<span class="nav-unread-badge" id="' +
                item.badge +
                '" hidden aria-label="Unread items">0</span>'
                : "") +
            (item.notifBadge ? '<span class="nav-badge" id="nav-unread" hidden></span>' : "") +
            "</a>";
            }).join("");


    // ---- Public pages (job list and job details) can be viewed without an account.
    // If there is no saved login on this device, show a simple header instead of the app menu.
    function hasSavedLogin() {
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (/^sb-.+-auth-token$/.test(key) && localStorage.getItem(key)) {
                    return true;
                }
            }
        } catch (e) { /* storage blocked: treat as logged out */ }
        return false;
    }

    if (document.body.hasAttribute("data-public") && !hasSavedLogin()) {
        document.body.classList.remove("app");
        document.body.classList.add("public-view");
        document.body.insertAdjacentHTML("afterbegin",
            '<header class="site-header">' +
                '<div class="container bar">' +
                    '<a href="index.html" class="logo" aria-label="NaijaJobs home">Naija<span>Jobs</span></a>' +
                    '<nav aria-label="Main navigation">' +
                        '<a href="browse.html" class="hide-sm">Find jobs</a>' +
                        '<a href="login.html">Log in</a>' +
                        '<a href="signup.html" class="btn btn-sm">Sign up</a>' +
                    "</nav>" +
                "</div>" +
            "</header>");
        return;
    }

    var html =
        '<header class="mobar">' +
            '<a class="logo" href="dashboard.html">Naija<span>Jobs</span></a>' +
            '<button type="button" class="menu-btn" id="nj-menu-toggle" ' +
                'aria-label="Open navigation menu" aria-controls="nj-sidebar" aria-expanded="false">\u2630</button>' +
        "</header>" +
        '<div class="scrim" id="nj-sidebar-overlay"></div>' +
        '<aside class="sidebar" id="nj-sidebar" aria-label="Main navigation">' +
            '<a class="logo" href="dashboard.html">Naija<span>Jobs</span></a>' +
            "<nav>" + links + "</nav>" +
            '<div class="sidebar-bottom">' +
                '<button type="button" class="nav-link" id="logout-button">' + svg("out") + "<span>Log out</span></button>" +
            "</div>" +
        "</aside>";

    document.body.insertAdjacentHTML("afterbegin", html);
})();
