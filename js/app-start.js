
document.addEventListener("DOMContentLoaded", async function () {
    const isNativeApp =
        window.Capacitor &&
        typeof window.Capacitor.isNativePlatform === "function" &&
        window.Capacitor.isNativePlatform();

    // Keep the normal website homepage unchanged.
    if (!isNativeApp) return;

    const hasLoggedInBefore =
        localStorage.getItem("naijajobs_app_has_logged_in") === "true";

    const supabase = window.supabaseClient;

    function goToLoginOrSignup() {
        window.location.replace(
            hasLoggedInBefore ? "login.html" : "signup.html"
        );
    }

    if (!supabase) {
        console.error("NaijaJobs Supabase client is unavailable.");
        goToLoginOrSignup();
        return;
    }

    try {
        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;

        const session = data.session;

        // No active session.
        if (!session) {
            goToLoginOrSignup();
            return;
        }

        // Remember this as a returning user.
        localStorage.setItem("naijajobs_app_has_logged_in", "true");

        // Check whether the user is an administrator.
        const { data: admin, error: adminError } = await supabase
            .from("admin_users")
            .select("user_id")
            .eq("user_id", session.user.id)
            .maybeSingle();

        if (adminError) throw adminError;

        // Administrators go to their dashboard.
        if (admin) {
            window.location.replace("admin-dashboard.html");
            return;
        }

        // Verify that an ordinary user's profile exists and is not suspended.
        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("is_suspended")
            .eq("id", session.user.id)
            .maybeSingle();

        if (profileError || !profile) {
            console.error(
                "App startup account verification failed:",
                profileError
            );

            await supabase.auth.signOut();
            window.location.replace("login.html");
            return;
        }

        if (profile.is_suspended === true) {
            await supabase.auth.signOut();
            window.location.replace("login.html");
            return;
        }

        // Verified ordinary user.
        window.location.replace("dashboard.html");

    } catch (error) {
        console.error("NaijaJobs app startup error:", error);
        goToLoginOrSignup();
    }
});
