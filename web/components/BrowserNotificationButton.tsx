"use client";

import { useEffect, useState } from "react";
import { browserNotificationsSupported, requestBrowserNotifications } from "@/lib/browser-notifications";

export default function BrowserNotificationButton({ compact = false }: { compact?: boolean }) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [error, setError] = useState("");

  useEffect(() => {
    setPermission(browserNotificationsSupported() ? Notification.permission : "unsupported");
  }, []);

  async function enable() {
    setError("");
    try {
      const result = await requestBrowserNotifications();
      setPermission(result);
    } catch (requestError) {
      console.error("Could not request browser notification permission:", requestError);
      setError("Không thể bật thông báo. Hãy kiểm tra cài đặt trình duyệt.");
    }
  }

  if (permission === "unsupported") {
    return compact ? null : <p className="rounded-lg bg-amber-50 px-3 py-2 text-[10px] text-amber-800">Trình duyệt này không hỗ trợ thông báo hệ thống.</p>;
  }
  if (permission === "granted") {
    return compact
      ? <span title="Đã bật thông báo màn hình" aria-label="Đã bật thông báo màn hình" className="grid h-9 w-9 place-items-center rounded-xl border border-emerald-300/30 bg-emerald-400/10 text-emerald-200">✓</span>
      : <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[10px] font-semibold text-emerald-700">Đã bật thông báo trên màn hình thiết bị.</p>;
  }
  if (permission === "denied") {
    return compact
      ? <span title="Cho phép thông báo trong cài đặt trình duyệt" aria-label="Thông báo bị chặn trong cài đặt trình duyệt" className="grid h-9 w-9 place-items-center rounded-xl border border-white/15 text-slate-400">!</span>
      : <p className="rounded-lg bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800">Thông báo đang bị chặn. Hãy cho phép trang web gửi thông báo trong cài đặt trình duyệt.</p>;
  }

  return (
    <>
      <button type="button" onClick={() => void enable()} title="Bật thông báo trên màn hình" aria-label="Bật thông báo trên màn hình"
        className={compact
          ? "grid h-9 w-9 place-items-center rounded-xl border border-white/15 bg-white/5 text-white transition hover:bg-white/15"
          : "w-full rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-left text-[10px] font-bold text-orange-800 transition hover:bg-orange-100"}>
        {compact ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
            <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : "Bật thông báo trên màn hình thiết bị"}
      </button>
      {error && !compact && <p role="alert" className="mt-1.5 text-[10px] text-rose-700">{error}</p>}
    </>
  );
}
