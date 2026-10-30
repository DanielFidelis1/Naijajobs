
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

    if (!("PushManager" in window) || !("Notification" in window)) {
        status.textContent =
            "Your browser does not support push notifications.";
        button.disabled = true;
        return;
    }

    if (!window.supabaseClient) {
        status.textContent =
            "Notifications are temporarily unavailable. Please refresh the page.";
        button.disabled = true;
        return;
    }
    if (Notification.permission === "granted") {
    button.hidden = true;
    status.hidden = true;
}

    button.addEventListener("click", async function () {
        button.disabled = true;
        status.textContent = "Setting up browser notifications...";

        try {
            if (Notification.permission === "denied") {
                status.textContent =
                    "Notifications are blocked in your browser settings. Allow them there, then try again.";
                return;
            }

            const permission = await Notification.requestPermission();

            if (permission !== "granted") {
                status.textContent =
                    "Notification permission was not granted.";
                return;
            }

            const { data: sessionData, error: sessionError } =
                await supabaseClient.auth.getSession();

            if (sessionError || !sessionData.session) {
                status.textContent =
                    "Please sign in again before enabling notifications.";
                return;
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

            const { data, error } =
                await supabaseClient.functions.invoke(
                    PUSH_SUBSCRIBE_FUNCTION,
                    {
                        body: {
                            subscription: subscription.toJSON()
                        }
                    }
                );

            if (error || !data?.success) {
                console.error(
                    "Could not save push subscription:",
                    error || data?.error
                );
                status.textContent =
                    "Notifications were enabled in your browser, but saving failed. Please try again.";
                return;
            }

            button.dataset.subscriptionSaved = "true";
            
            button.hidden = true;
            status.hidden = true;

        } catch (error) {
            console.error("Push notification setup failed:", error);
            status.textContent =
                "Could not enable notifications. Please refresh and try again.";
        } finally {
            button.disabled = false;
        }
    });
});
