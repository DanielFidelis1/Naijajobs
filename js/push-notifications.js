
/* NaijaJobs Push Notification Setup */
const VAPID_PUBLIC_KEY = "BA2ATLX-e9gEyBe49gQqmrFLc4L2kfqNRo0hG8XVff24BkQSsjxx5prd5SRJmRxZFsrGtpKUhW-IvW68t-wFnfs";
const PUSH_SUBSCRIBE_FUNCTION = "save-push-subscription";
(async function initializePushNotifications() {
    if (!("serviceWorker" in navigator)) {
        console.warn("This browser does not support service workers.");
        return;
    }

    try {
        const registration = await navigator.serviceWorker.register("/sw.js");

        await navigator.serviceWorker.ready;

        console.log(
            "NaijaJobs service worker registered successfully:",
            registration.scope
        );
    } catch (error) {
        console.error(
            "NaijaJobs service worker registration failed:",
            error
        );
    }
})();

/* ===== NaijaJobs Push Notification Opt-In ===== */

function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; i++) {
        outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
}

/* ===== Shared NaijaJobs Browser Push Registration ===== */

async function enableNaijaJobsBrowserPush(client) {
    if (!client) {
        throw new Error("Supabase is not available. Please refresh the page.");
    }

    const { data: sessionData, error: sessionError } =
        await client.auth.getSession();

    if (sessionError || !sessionData.session) {
        throw new Error("Please sign in again before enabling notifications.");
    }

    const userId = sessionData.session.user.id;

    try {
        // Save the ON preference before registering the subscription.
        const { error: preferenceError } = await client
            .from("profiles")
            .update({ push_notifications_enabled: true })
            .eq("id", userId);

        if (preferenceError) throw preferenceError;

        if (Notification.permission === "denied") {
            throw new Error(
                "Notifications are blocked in your browser settings. Allow them there, then try again."
            );
        }

        const permission = await Notification.requestPermission();

        if (permission !== "granted") {
            throw new Error("Notification permission was not granted.");
        }

        const registration = await navigator.serviceWorker.ready;

        let subscription =
            await registration.pushManager.getSubscription();

        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey:
                    urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
        }

        const { data, error } = await client.functions.invoke(
            PUSH_SUBSCRIBE_FUNCTION,
            {
                body: {
                    subscription: subscription.toJSON()
                }
            }
        );

        if (error || !data?.success) {
            throw new Error(
                data?.error || error?.message ||
                "Could not save your push subscription."
            );
        }

        return true;

    } catch (error) {
        // Roll back the preference if registration fails.
        const { error: rollbackError } = await client
            .from("profiles")
            .update({ push_notifications_enabled: false })
            .eq("id", userId);

        if (rollbackError) {
            console.error("Could not restore push preference:", rollbackError);
        }

        throw error;
    }
}

window.NaijaJobsBrowserPush = {
    enable: enableNaijaJobsBrowserPush
};

function updatePushNotificationPrompt(button, status) {
    if (
        Notification.permission === "granted" &&
        button.dataset.subscriptionSaved === "true"
    ) {
        button.hidden = true;
        status.hidden = true;
        return;
    }

    button.hidden = false;
    status.hidden = false;

    if (Notification.permission === "denied") {
        button.textContent = "Enable Notifications";
        status.textContent =
            "Notifications are blocked. Allow them in your browser settings to enable them again.";
    }
}

document.addEventListener("DOMContentLoaded", function () {
    const button = document.getElementById("enable-push-notifications");
    const status = document.getElementById("push-notification-status");

    if (!button || !status) return;

    if (!window.supabaseClient) {
        status.textContent =
            "Notifications are temporarily unavailable. Please refresh the page.";
        button.disabled = true;
        return;
    }

    /* ===== NATIVE ANDROID / IOS PUSH ===== */

    if (window.NaijaJobsNativePush?.isNative) {
        button.addEventListener("click", async function () {
            button.disabled = true;
            status.textContent = "Setting up mobile notifications...";

            try {
                const { data: sessionData, error: sessionError } =
                    await window.supabaseClient.auth.getSession();

                if (sessionError || !sessionData.session) {
                    throw new Error("Please sign in again.");
                }

                const { error: preferenceError } =
                    await window.supabaseClient
                        .from("profiles")
                        .update({ push_notifications_enabled: true })
                        .eq("id", sessionData.session.user.id);

                if (preferenceError) throw preferenceError;

                await window.NaijaJobsNativePush.enable(
                    window.supabaseClient
                );

                status.textContent =
                    "Mobile notifications have been enabled.";
                button.hidden = true;

            } catch (error) {
                console.error("Mobile notification setup failed:", error);

                status.textContent =
                    error.message ||
                    "Could not enable mobile notifications. Please try again.";

            } finally {
                button.disabled = false;
            }
        });

        return;
    }

    /* ===== BROWSER PUSH ===== */

    if (!("PushManager" in window) || !("Notification" in window)) {
        status.textContent =
            "Your browser does not support push notifications.";
        button.disabled = true;
        return;
    }

    button.addEventListener("click", async function () {
        button.disabled = true;
        status.textContent = "Setting up browser notifications...";

        try {
            await window.NaijaJobsBrowserPush.enable(
                window.supabaseClient
            );

            button.dataset.subscriptionSaved = "true";
            button.hidden = true;
            status.hidden = true;

        } catch (error) {
            console.error("Push notification setup failed:", error);

            status.textContent =
                error.message ||
                "Could not enable notifications. Please try again.";

        } finally {
            button.disabled = false;
        }
    });
});
