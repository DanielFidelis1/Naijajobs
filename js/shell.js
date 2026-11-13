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
        settings: '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M12 9C10.3425 9 9.00002 10.3425 9.00002 12C9.00002 13.6575 10.3425 15 12 15C13.6575 15 15 13.6575 15 12C15 10.3425 13.6575 9 12 9ZM12 13.5C11.172 13.5 10.5 12.828 10.5 12C10.5 11.172 11.172 10.5 12 10.5C12.828 10.5 13.5 11.172 13.5 12C13.5 12.828 12.828 13.5 12 13.5ZM21.8475 14.5725L19.9185 12.942C19.8675 12.8985 19.8195 12.8505 19.776 12.7995C19.332 12.279 19.3965 11.5005 19.9185 11.058L21.8475 9.4275C22.0395 9.2655 22.113 9.0045 22.0365 8.766C21.579 7.3545 20.823 6.06 19.8285 4.962C19.7085 4.83 19.5405 4.758 19.368 4.758C19.2975 4.758 19.227 4.77 19.1595 4.794L16.779 5.6415C16.716 5.664 16.65 5.682 16.584 5.694C16.509 5.7075 16.434 5.715 16.3605 5.715C15.7725 5.715 15.2505 5.298 15.141 4.701L14.6865 2.223C14.6415 1.977 14.451 1.782 14.205 1.7295C13.485 1.5765 12.7485 1.5 12.0015 1.5C11.2545 1.5 10.5165 1.578 9.79652 1.7295C9.55052 1.782 9.36002 1.977 9.31502 2.223L8.86202 4.701C8.85002 4.767 8.83202 4.8315 8.80952 4.8945C8.62802 5.4 8.15102 5.715 7.64102 5.715C7.50302 5.715 7.36202 5.691 7.22402 5.643L4.84352 4.7955C4.77602 4.7715 4.70402 4.7595 4.63502 4.7595C4.46252 4.7595 4.29452 4.8315 4.17452 4.9635C3.17852 6.0615 2.42402 7.356 1.96502 8.7675C1.88702 9.006 1.96202 9.267 2.15402 9.429L4.08302 11.0595C4.13402 11.103 4.18202 11.151 4.22552 11.202C4.66952 11.7225 4.60502 12.501 4.08302 12.9435L2.15402 14.574C1.96202 14.736 1.88852 14.997 1.96502 15.2355C2.42252 16.647 3.17852 17.9415 4.17452 19.0395C4.29452 19.1715 4.46252 19.2435 4.63502 19.2435C4.70552 19.2435 4.77602 19.2315 4.84352 19.2075L7.22402 18.36C7.28702 18.3375 7.35302 18.3195 7.41902 18.3075C7.49402 18.294 7.56902 18.288 7.64252 18.288C8.23052 18.288 8.75252 18.705 8.86202 19.302L9.31502 21.78C9.36002 22.026 9.55052 22.221 9.79652 22.2735C10.5165 22.4265 11.2545 22.503 12.0015 22.503C12.7485 22.503 13.4865 22.425 14.205 22.2735C14.451 22.221 14.6415 22.026 14.6865 21.78L15.141 19.302C15.153 19.236 15.171 19.1715 15.1935 19.1085C15.375 18.603 15.852 18.288 16.362 18.288C16.5 18.288 16.641 18.312 16.779 18.36L19.158 19.2075C19.227 19.2315 19.2975 19.2435 19.3665 19.2435C19.539 19.2435 19.707 19.1715 19.827 19.0395C20.823 17.9415 21.5775 16.647 22.035 15.2355C22.113 14.997 22.038 14.736 21.846 14.574L21.8475 14.5725ZM19.092 17.589L17.2815 16.944C16.9845 16.839 16.6755 16.785 16.362 16.785C15.2085 16.785 14.1705 17.514 13.782 18.5985C13.731 18.738 13.6935 18.882 13.6665 19.029L13.3215 20.9055C12.8865 20.9685 12.444 21 12.0015 21C11.559 21 11.1165 20.9685 10.68 20.904L10.3365 19.0275C10.098 17.727 8.96552 16.7835 7.64252 16.7835C7.48052 16.7835 7.31552 16.7985 7.14902 16.8285C7.00352 16.8555 6.86102 16.893 6.72002 16.9425L4.90952 17.5875C4.35752 16.896 3.91652 16.1385 3.59102 15.321L5.05202 14.0865C5.61152 13.614 5.95202 12.951 6.01202 12.222C6.07202 11.493 5.84252 10.785 5.36702 10.227C5.27102 10.1145 5.16452 10.008 5.05202 9.912L3.59102 8.6775C3.91652 7.86 4.35752 7.101 4.90952 6.411L6.72002 7.056C7.01702 7.161 7.32602 7.215 7.64102 7.215C8.79452 7.215 9.83252 6.486 10.221 5.4015C10.272 5.2605 10.3095 5.1165 10.3365 4.971L10.68 3.0945C11.1165 3.0315 11.559 2.9985 12.0015 2.9985C12.444 2.9985 12.8865 3.03 13.3215 3.093L13.665 4.9695C13.9035 6.27 15.036 7.2135 16.359 7.2135C16.521 7.2135 16.686 7.1985 16.851 7.1685C16.9965 7.1415 17.1405 7.104 17.2815 7.0545L19.092 6.4095C19.644 7.0995 20.085 7.8585 20.4105 8.676L18.951 9.9105C18.3915 10.383 18.0495 11.046 17.991 11.775C17.931 12.504 18.1605 13.2135 18.636 13.77C18.7335 13.884 18.8385 13.989 18.9525 14.085L20.4135 15.3195C20.088 16.137 19.647 16.896 19.095 17.586L19.092 17.589Z"/></svg>',
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
        { page: "profile", href: "profile.html", label: "Profile", icon: "user" },
        { page: "settings", href: "settings.html", label: "Settings", icon: "settings" }
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
