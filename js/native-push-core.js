
export function initializeNativePush({ Capacitor, PushNotifications, FCM }) {
    if (!Capacitor.isNativePlatform()) {
        return;
    }

    let supabaseClient = null;
    let listenersRegistered = false;
    let pendingRegistration = null;

    async function saveDeviceToken(token) {
        if (!supabaseClient) {
            throw new Error("Please sign in before registering notifications.");
        }

        const { data: sessionData, error: sessionError } =
            await supabaseClient.auth.getSession();

        if (sessionError || !sessionData.session) {
            throw new Error("Please sign in again to enable notifications.");
        }

        const platform = Capacitor.getPlatform();

        const { data, error } =
            await supabaseClient.functions.invoke(
                "save-device-token",
                {
                    body: {
                        token,
                        platform
                    }
                }
            );

        if (error || !data?.success) {
            console.error("Device token registration failed:", error || data);
            throw new Error("Could not register this device.");
        }

        console.log("NaijaJobs native device registered:", platform);
    }

    async function registerListeners() {
        if (listenersRegistered) return;

        await PushNotifications.addListener(
    "registration",
    async (tokenData) => {
        try {
            let deviceToken = tokenData.value;

            // iOS provides an APNs token through Capacitor.
            // We need the FCM token for Firebase delivery instead.
            if (Capacitor.getPlatform() === "ios") {
                if (!FCM || typeof FCM.getToken !== "function") {
                    throw new Error("iOS Firebase messaging is not configured.");
                }

                const fcmTokenData = await FCM.getToken();
                deviceToken = fcmTokenData?.token;
            }

            if (typeof deviceToken !== "string" || !deviceToken.trim()) {
                throw new Error("Could not obtain a valid device token.");
            }

            await saveDeviceToken(deviceToken);

            if (pendingRegistration) {
                pendingRegistration.resolve(true);
                pendingRegistration = null;
            }
        } catch (error) {
                    console.error("Native push registration failed:", error);

                    if (pendingRegistration) {
                        pendingRegistration.reject(error);
                        pendingRegistration = null;
                    }
                }
            }
        );

        await PushNotifications.addListener(
            "registrationError",
            (error) => {
                console.error("Native push registration error:", error);

                if (pendingRegistration) {
                    pendingRegistration.reject(
                        new Error("Device registration failed.")
                    );
                    pendingRegistration = null;
                }
            }
        );

        await PushNotifications.addListener(
            "pushNotificationActionPerformed",
            (action) => {
                const link = action.notification?.data?.link;

                if (typeof link !== "string" || !link.trim()) {
                    return;
                }

                try {
                    const destination = new URL(
                        link,
                        window.location.origin
                    );

                    if (
                        destination.origin !== window.location.origin ||
                        destination.protocol !== window.location.protocol
                    ) {
                        return;
                    }

                    window.location.assign(
                        destination.pathname +
                        destination.search +
                        destination.hash
                    );
                } catch (error) {
                    console.error("Invalid notification destination:", error);
                }
            }
        );

        listenersRegistered = true;
    }

    async function enable(client) {
        if (!client) {
            throw new Error("NaijaJobs is not ready. Please refresh.");
        }

        supabaseClient = client;

        await registerListeners();

        let permission = await PushNotifications.checkPermissions();

        if (permission.receive !== "granted") {
            permission = await PushNotifications.requestPermissions();
        }

        if (permission.receive !== "granted") {
            throw new Error("Notification permission was not granted.");
        }

        if (pendingRegistration) {
            throw new Error("Device registration is already in progress.");
        }

        const registrationPromise = new Promise((resolve, reject) => {
            pendingRegistration = { resolve, reject };

            setTimeout(() => {
                if (pendingRegistration) {
                    pendingRegistration = null;
                    reject(
                        new Error("Device registration timed out. Please try again.")
                    );
                }
            }, 30000);
        });

        try {
            await PushNotifications.register();
            await registrationPromise;

            return true;
        } catch (error) {
            pendingRegistration = null;
            throw error;
        }
    }

    window.NaijaJobsNativePush = {
        isNative: true,
        enable
    };

    console.log("NaijaJobs native push handler initialized.");
}
