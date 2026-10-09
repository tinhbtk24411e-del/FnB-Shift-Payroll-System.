"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showBrowserNotification } from "@/lib/browser-notifications";
import type { Notification } from "@/lib/types";
import { useToast } from "@/Toast";

export function useNotifications(recipientId: string) {
  const { toast, node: toastNode } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const activeRef = useRef(false);

  const loadNotifications = useCallback(async () => {
    const [listResult, unreadResult] = await Promise.all([
      supabase.from("notifications")
        .select("id, recipient_id, type, title, body, ref_table, ref_id, is_read, created_at")
        .eq("recipient_id", recipientId)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", recipientId)
        .eq("is_read", false),
    ]);
    if (!activeRef.current) return;
    if (listResult.error || unreadResult.error) {
      setError("Không tải được thông báo: " + (listResult.error?.message ?? unreadResult.error?.message));
    } else {
      setError("");
      setNotifications((listResult.data ?? []) as Notification[]);
      setUnreadCount(unreadResult.count ?? 0);
    }
    setLoading(false);
  }, [recipientId]);

  useEffect(() => {
    activeRef.current = true;
    setLoading(true);
    void loadNotifications();
    const channel = supabase.channel(`manager-notifications-${recipientId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `recipient_id=eq.${recipientId}`,
      }, (payload) => {
        const notification = payload.new as Notification;
        if (notification.recipient_id !== recipientId) return;
        setNotifications((current) => [
          notification,
          ...current.filter((item) => item.id !== notification.id),
        ].slice(0, 30));
        setError("");
        toast("info", `${notification.title}: ${notification.body}`);
        void showBrowserNotification(notification.title, notification.body).catch((error: unknown) => {
          console.error("Could not display browser notification:", error);
        });
        void loadNotifications();
      })
      .subscribe((status, subscriptionError) => {
        if (!activeRef.current) return;
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setError(subscriptionError?.message || "Mất kết nối thông báo trực tiếp. Hãy tải lại trang.");
        }
      });

    return () => {
      activeRef.current = false;
      void supabase.removeChannel(channel);
    };
  }, [loadNotifications, recipientId, toast]);

  const markAsRead = useCallback(async (notification: Notification) => {
    if (notification.is_read) return true;
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notification.id)
      .eq("recipient_id", recipientId);
    if (updateError) {
      setError("Không thể đánh dấu thông báo đã đọc: " + updateError.message);
      toast("err", "Không thể đánh dấu thông báo đã đọc.");
      return false;
    }
    setNotifications((current) => current.map((item) =>
      item.id === notification.id ? { ...item, is_read: true } : item));
    setUnreadCount((count) => Math.max(0, count - 1));
    return true;
  }, [recipientId, toast]);

  const markAllAsRead = useCallback(async () => {
    const unreadIds = notifications.filter((item) => !item.is_read).map((item) => item.id);
    if (!unreadIds.length) return true;
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("recipient_id", recipientId)
      .eq("is_read", false);
    if (updateError) {
      setError("Không thể đánh dấu thông báo đã đọc: " + updateError.message);
      toast("err", "Không thể đánh dấu tất cả thông báo đã đọc.");
      return false;
    }
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    setUnreadCount(0);
    return true;
  }, [notifications, recipientId, toast]);

  return {
    notifications,
    toastNode,
    unreadCount,
    loading,
    error,
    loadNotifications,
    markAsRead,
    markAllAsRead,
  };
}
