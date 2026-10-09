"use client";

export function browserNotificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestBrowserNotifications() {
  if (!browserNotificationsSupported()) return "unsupported" as const;
  return Notification.requestPermission();
}

export async function showBrowserNotification(title: string, body: string) {
  if (!browserNotificationsSupported() || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;

  const options: NotificationOptions = {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: "fnb-shift-update",
  };

  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (registration) {
      await registration.showNotification(title, options);
      return;
    }
  }
  new Notification(title, options);
}
