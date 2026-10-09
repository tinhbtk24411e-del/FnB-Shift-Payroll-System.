"use client";

import { useEffect, useRef, useState } from "react";
import { useNotifications } from "@/hooks/useNotifications";
import type { Notification } from "@/lib/types";
import BrowserNotificationButton from "./BrowserNotificationButton";

function notificationDate(value: string) {
  return new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NotificationBell({
  recipientId,
  onOpenApprovals,
}: {
  recipientId: string;
  onOpenApprovals: () => void;
}) {
  const {
    notifications,
    toastNode,
    unreadCount,
    loading,
    error,
    loadNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotifications(recipientId);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event instanceof MouseEvent && !containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, [open]);

  async function openApproval(notification: Notification) {
    if (!(await markAsRead(notification))) return;
    setOpen(false);
    onOpenApprovals();
  }

  async function readAll() {
    await markAllAsRead();
  }

  return (
    <div ref={containerRef} className="relative">
      {toastNode}
      <button
        type="button"
        aria-label={`Thông báo${unreadCount ? `, ${unreadCount} chưa đọc` : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className="relative grid h-9 w-9 place-items-center rounded-xl border border-white/15 bg-white/5 text-white transition hover:bg-white/15"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-[#202d3d] bg-rose-500 px-1 text-[9px] font-extrabold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="Thông báo quản lý"
          className="absolute right-0 top-11 z-50 w-[min(90vw,380px)] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div><h2 className="text-sm font-extrabold">Thông báo</h2><p className="mt-0.5 text-[10px] text-slate-400">{unreadCount} chưa đọc</p></div>
            <button type="button" onClick={readAll} disabled={!unreadCount} className="text-[10px] font-bold text-orange-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-300">Đọc tất cả</button>
          </div>
          <div className="border-b border-slate-100 p-3">
            <BrowserNotificationButton />
            <p className="mt-1.5 text-[9px] leading-4 text-slate-400">Thông báo hệ thống sẽ hiện khi bạn đang ở tab khác hoặc ứng dụng chạy nền.</p>
          </div>
          {error && (
            <div role="alert" className="m-3 rounded-lg border border-rose-100 bg-rose-50 p-2.5 text-[10px] leading-4 text-rose-700">
              <p>{error}</p>
              <button type="button" onClick={() => void loadNotifications()} className="mt-1 font-bold underline">Thử tải lại</button>
            </div>
          )}
          <div className="max-h-[min(65vh,440px)] overflow-y-auto p-2">
            {loading ? (
              <p className="px-3 py-8 text-center text-xs text-slate-400">Đang tải thông báo…</p>
            ) : notifications.length ? (
              <ul className="space-y-1">
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <button type="button" onClick={() => void openApproval(notification)}
                      className={`w-full rounded-xl p-3 text-left transition hover:bg-orange-50 ${notification.is_read ? "bg-white" : "bg-orange-50/70"}`}>
                      <span className="flex items-start gap-2.5">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.is_read ? "bg-slate-200" : "bg-rose-500"}`} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className="text-xs font-bold text-slate-800">{notification.title}</span>
                            <time className="shrink-0 text-[9px] text-slate-400">{notificationDate(notification.created_at)}</time>
                          </span>
                          <span className="mt-1 block text-[11px] leading-4 text-slate-600">{notification.body}</span>
                          <span className="mt-1.5 block text-[9px] font-semibold text-orange-700">Mở màn hình duyệt ›</span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : !error ? (
              <p className="px-3 py-8 text-center text-xs text-slate-400">Bạn chưa có thông báo nào.</p>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}
