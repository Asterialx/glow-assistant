import { accountStorage } from "../auth/accountStorage";
import { shouldNotifyReply } from "./notificationPolicy";
const sent = new Set<string>();
export async function enableReplyNotifications(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  const permission = await Notification.requestPermission();
  const enabled = permission === "granted";
  if (enabled && "serviceWorker" in navigator) await navigator.serviceWorker.register("/glow-notifications.js");
  accountStorage.setItem("glow.replyNotifications", enabled ? "1" : "0");
  return enabled;
}
export async function notifyReply(id: string, status: string) {
  if (!("Notification" in window) || sent.has(id) || !shouldNotifyReply(accountStorage.getItem("glow.replyNotifications") === "1", Notification.permission, document.hidden, status)) return;
  sent.add(id);
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.active) {
        await registration.showNotification("Glow", { body: accountStorage.getItem("glow.locale") === "en" ? "Your answer is ready." : "Ответ готов.", tag: `glow-reply-${id}` });
        return;
      }
    }
    const notice = new Notification("Glow", { body: accountStorage.getItem("glow.locale") === "en" ? "Your answer is ready." : "Ответ готов.", tag: `glow-reply-${id}` });
    notice.onclick = () => { window.focus(); notice.close(); };
  } catch { /* Platforms without desktop Notification constructor remain unsupported. */ }
}
