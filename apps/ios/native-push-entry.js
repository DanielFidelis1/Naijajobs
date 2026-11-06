import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { FCM } from "@capacitor-community/fcm";
import { initializeNativePush } from "../../js/native-push-core.js";

initializeNativePush({
    Capacitor,
    PushNotifications,
    FCM
});