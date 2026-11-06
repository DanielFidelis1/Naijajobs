/* NaijaJobs - shared appearance settings */
(function () {
    "use strict";

    var STORAGE_KEY = "naijajobs-theme";
    var validThemes = ["light", "dark", "system"];

    function getSavedTheme() {
        try {
            var saved = localStorage.getItem(STORAGE_KEY);
            return validThemes.indexOf(saved) !== -1 ? saved : "system";
        } catch (error) {
            return "system";
        }
    }

    function applyTheme(preference) {
        var theme = preference;

        if (preference === "system") {
            theme = window.matchMedia &&
                window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light";
        }

        document.documentElement.setAttribute("data-theme", theme);
        document.documentElement.style.colorScheme = theme;
    }

    function saveTheme(preference) {
        if (validThemes.indexOf(preference) === -1) return;

        try {
            localStorage.setItem(STORAGE_KEY, preference);
        } catch (error) {
            // The theme can still be applied for this page.
        }

        applyTheme(preference);
    }

    // Apply the saved preference immediately, before the page is painted.
    var currentPreference = getSavedTheme();
    applyTheme(currentPreference);

    // Update the theme selector when the page is ready.
    document.addEventListener("DOMContentLoaded", function () {
        var selector = document.getElementById("theme-mode");

        if (selector) {
            selector.value = getSavedTheme();

            selector.addEventListener("change", function () {
                saveTheme(selector.value);
            });
        }
    });

    // Follow operating-system changes when System mode is selected.
    if (window.matchMedia) {
        var systemPreference = window.matchMedia("(prefers-color-scheme: dark)");

        function handleSystemChange() {
            if (getSavedTheme() === "system") {
                applyTheme("system");
            }
        }

        if (systemPreference.addEventListener) {
            systemPreference.addEventListener("change", handleSystemChange);
        } else if (systemPreference.addListener) {
            systemPreference.addListener(handleSystemChange);
        }
    }

    // Keep other open NaijaJobs tabs in sync.
    window.addEventListener("storage", function (event) {
        if (event.key === STORAGE_KEY) {
            applyTheme(getSavedTheme());
        }
    });

    // Appearance card controls
    function syncThemeCards() {
        var preference = getSavedTheme();

        document.querySelectorAll("[data-theme-choice]").forEach(function (button) {
            var selected = button.getAttribute("data-theme-choice") === preference;
            button.setAttribute("aria-pressed", selected ? "true" : "false");
        });
    }

    document.addEventListener("DOMContentLoaded", function () {
        document.querySelectorAll("[data-theme-choice]").forEach(function (button) {
            button.addEventListener("click", function () {
                saveTheme(button.getAttribute("data-theme-choice"));
                syncThemeCards();
            });
        });

        syncThemeCards();
    });

    window.addEventListener("storage", syncThemeCards);

})();
