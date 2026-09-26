import {
  getMyNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "@ncct/api-client";
import { NOTIFICATION_POLL_INTERVAL_MS } from "@ncct/constants";
import type { AppNotification } from "@ncct/shared-types";
import { useEffect, useRef, useState } from "react";
import { useLocale, type Locale } from "../i18n/LocaleContext.js";
import {
  describeNotification,
  formatRelativeTime,
  type NotificationTarget,
} from "./notificationContent.js";

interface NotificationBellProps {
  accessToken: string;
  onNavigate: (target: NotificationTarget) => void;
}

const text: Record<
  Locale,
  { title: string; markAllRead: string; empty: string; loading: string; error: string }
> = {
  en: {
    title: "Notifications",
    markAllRead: "Mark all as read",
    empty: "You're all caught up.",
    loading: "Loading…",
    error: "Couldn't load notifications.",
  },
  hi: {
    title: "सूचनाएं",
    markAllRead: "सभी को पढ़ा हुआ चिह्नित करें",
    empty: "कोई नई सूचना नहीं है।",
    loading: "लोड हो रहा है…",
    error: "सूचनाएं लोड नहीं हो सकीं।",
  },
};

// In-app notification bell (docs/DECISIONS.md #65), shared by the trainee
// and management shells. Polls a count-only endpoint rather than holding a
// realtime connection: clients never talk to Supabase directly (CLAUDE.md),
// so Supabase Realtime isn't an option, and a minute's delay is fine for
// this kind of news. A failed poll (e.g. offline) is silently skipped — the
// badge just keeps its last known value until the next one succeeds.
export function NotificationBell({ accessToken, onNavigate }: NotificationBellProps) {
  const { locale } = useLocale();
  const t = text[locale];
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    function refreshCount() {
      if (document.visibilityState === "hidden") return;
      getUnreadNotificationCount(accessToken)
        .then((res) => {
          if (!cancelled) setUnread(res.unread_count);
        })
        .catch(() => {});
    }
    refreshCount();
    const interval = window.setInterval(refreshCount, NOTIFICATION_POLL_INTERVAL_MS);
    window.addEventListener("focus", refreshCount);
    document.addEventListener("visibilitychange", refreshCount);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshCount);
      document.removeEventListener("visibilitychange", refreshCount);
    };
  }, [accessToken]);

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    setFailed(false);
    getMyNotifications(accessToken)
      .then((page) => {
        setItems(page.notifications);
        setUnread(page.unread_count);
      })
      .catch(() => setFailed(true));
  }

  function handleSelect(notification: AppNotification) {
    if (!notification.read_at) {
      const readAt = new Date().toISOString();
      setItems(
        (prev) =>
          prev?.map((n) => (n.id === notification.id ? { ...n, read_at: readAt } : n)) ?? prev,
      );
      setUnread((count) => Math.max(0, count - 1));
      void markNotificationRead(accessToken, notification.id).catch(() => {});
    }
    setOpen(false);
    onNavigate(describeNotification(notification, locale).target);
  }

  function handleMarkAllRead() {
    const readAt = new Date().toISOString();
    setItems((prev) => prev?.map((n) => (n.read_at ? n : { ...n, read_at: readAt })) ?? prev);
    setUnread(0);
    void markAllNotificationsRead(accessToken).catch(() => {});
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread > 0 ? `${t.title} (${unread})` : t.title}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container cursor-pointer md:h-9 md:w-9"
      >
        <span className="material-symbols-outlined text-[18px] md:text-[20px]">notifications</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-cta px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t.title}
          className="absolute right-0 top-full z-50 mt-2 flex max-h-[70vh] w-[min(360px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-card shadow-xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-outline-variant px-4 py-3">
            <span className="text-label-md font-bold text-on-surface">{t.title}</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-label-sm font-semibold text-interactive hover:underline cursor-pointer"
              >
                {t.markAllRead}
              </button>
            )}
          </div>

          <div className="overflow-y-auto">
            {failed ? (
              <p className="px-4 py-6 text-center text-body-sm text-on-surface-variant">
                {t.error}
              </p>
            ) : items === null ? (
              <p className="px-4 py-6 text-center text-body-sm text-on-surface-variant">
                {t.loading}
              </p>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-1 px-4 py-8 text-center text-on-surface-variant">
                <span className="material-symbols-outlined text-[28px]">notifications_off</span>
                <p className="text-body-sm">{t.empty}</p>
              </div>
            ) : (
              <ul className="flex flex-col">
                {items.map((notification) => {
                  const view = describeNotification(notification, locale);
                  const isUnread = !notification.read_at;
                  return (
                    <li
                      key={notification.id}
                      className="border-b border-outline-variant/60 last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => handleSelect(notification)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-container-low cursor-pointer ${
                          isUnread ? "bg-interactive/5" : ""
                        }`}
                      >
                        <span
                          className={`material-symbols-outlined mt-0.5 shrink-0 text-[20px] ${
                            isUnread ? "text-interactive" : "text-on-surface-variant"
                          }`}
                        >
                          {view.icon}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span
                            className={`text-label-md leading-snug text-on-surface ${isUnread ? "font-bold" : "font-medium"}`}
                          >
                            {view.title}
                          </span>
                          {view.body && (
                            <span className="text-body-sm leading-snug text-on-surface-variant">
                              {view.body}
                            </span>
                          )}
                          <span className="text-[11px] text-on-surface-variant/80">
                            {formatRelativeTime(notification.created_at, locale)}
                          </span>
                        </span>
                        {isUnread && (
                          <span
                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-cta"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
