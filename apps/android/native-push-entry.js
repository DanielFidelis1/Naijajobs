
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { initializeNativePush } from "../../js/native-push-core.js";

initializeNativePush({
    Capacitor,
    PushNotifications
});
