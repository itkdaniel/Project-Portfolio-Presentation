import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, X, Info, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { usePubSub } from "@/lib/websocket";

interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  link?: string;
  createdAt: string;
}

function getToken() {
  return typeof localStorage !== "undefined" ? localStorage.getItem("nexus_token") : null;
}

async function apiFetch(url: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function typeIcon(type: string) {
  const cls = "w-3.5 h-3.5 shrink-0 mt-0.5";
  switch (type) {
    case "success":       return <CheckCircle className={`${cls} text-green-400`} />;
    case "warning":       return <AlertTriangle className={`${cls} text-yellow-400`} />;
    case "error":         return <XCircle className={`${cls} text-red-400`} />;
    case "scope_request":
    case "scope_update":  return <Bell className={`${cls} text-purple-400`} />;
    default:              return <Info className={`${cls} text-blue-400`} />;
  }
}

export function NotificationBell() {
  const token = getToken();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: resp } = useQuery<{ unreadCount: number; notifications: AppNotification[] }>({
    queryKey: ["/api/notifications"],
    queryFn:  () => apiFetch("/api/notifications"),
    enabled:  !!token,
    refetchInterval: 30_000,
  });
  const notifs  = resp?.notifications ?? [];
  const unreadCount = resp?.unreadCount ?? 0;

  usePubSub(token ? "notification:created" : undefined, (notification: AppNotification) => {
    qc.setQueryData<{ unreadCount: number; notifications: AppNotification[] }>(
      ["/api/notifications"],
      (current) => {
        if (!current || current.notifications.some((n) => n.id === notification.id)) return current;
        return {
          unreadCount: current.unreadCount + (notification.read ? 0 : 1),
          notifications: [notification, ...current.notifications].slice(0, 20),
        };
      },
    );
    qc.invalidateQueries({ queryKey: ["/api/notifications"] });
    toast({
      title: notification.title,
      description: notification.body,
    });
  });

  const markRead = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => apiFetch("/api/notifications/read-all", { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const unread  = notifs.filter(n => !n.read);
  const preview = notifs.slice(0, 6);

  if (!token) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Notifications"
        data-testid="btn-notification-bell"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center px-0.5"
            data-testid="notif-unread-count"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 bg-card border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
          data-testid="notification-panel"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">{unreadCount}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 px-2 py-1 rounded"
                  title="Mark all read"
                  data-testid="btn-mark-all-read-bell"
                >
                  <CheckCheck className="w-3 h-3" /> All read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {preview.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm" data-testid="notif-bell-empty">
                <Bell className="w-6 h-6 mx-auto mb-2 opacity-30" />
                No notifications yet
              </div>
            ) : (
              preview.map((n, i) => (
                <div key={n.id}>
                  {i > 0 && <div className="h-px bg-white/5" />}
                  <div
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-white/3 transition-colors ${!n.read ? "bg-primary/3" : ""}`}
                    onClick={() => {
                      if (!n.read) markRead.mutate(n.id);
                      if (n.link) { window.location.href = n.link; setOpen(false); }
                    }}
                    data-testid={`bell-notif-${n.id}`}
                  >
                    <div className="mt-0.5 relative shrink-0">
                      {typeIcon(n.type)}
                      {!n.read && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium leading-tight ${!n.read ? "text-foreground" : "text-muted-foreground"}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-0.5 line-clamp-2">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground/40 mt-1">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-white/5 px-4 py-2.5">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs text-primary hover:underline block text-center"
              data-testid="link-all-notifications"
            >
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
