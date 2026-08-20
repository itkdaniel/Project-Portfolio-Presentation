import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Bell, CheckCheck, Trash2, Info, CheckCircle, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";

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
      ...(opts?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

function typeIcon(type: string) {
  switch (type) {
    case "success": return <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />;
    case "warning": return <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />;
    case "error":   return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
    case "scope_request": return <Bell className="w-4 h-4 text-purple-400 shrink-0" />;
    case "scope_update":  return <Bell className="w-4 h-4 text-blue-400 shrink-0" />;
    default:        return <Info className="w-4 h-4 text-blue-400 shrink-0" />;
  }
}

function typeLabel(type: string) {
  switch (type) {
    case "success":       return "success";
    case "warning":       return "warning";
    case "error":         return "error";
    case "scope_request": return "scope";
    case "scope_update":  return "scope";
    default:              return "info";
  }
}

type StatusFilter = "all" | "unread" | "read";
type TypeFilter   = "all" | "info" | "success" | "warning" | "error" | "scope";

const TYPE_TABS: { key: TypeFilter; label: string }[] = [
  { key: "all",     label: "All types"  },
  { key: "info",    label: "Info"       },
  { key: "success", label: "Success"    },
  { key: "warning", label: "Warning"    },
  { key: "error",   label: "Error"      },
  { key: "scope",   label: "Scope"      },
];

export default function NotificationsPage() {
  const token = getToken();
  const isAuthenticated = !!token;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter,   setTypeFilter]   = useState<TypeFilter>("all");

  const { data: resp, isLoading } = useQuery<{ unreadCount: number; notifications: AppNotification[] }>({
    queryKey: ["/api/notifications/all"],
    queryFn:  () => apiFetch("/api/notifications/all"),
    enabled:  isAuthenticated,
    refetchInterval: 15_000,
  });
  const notifs = resp?.notifications ?? [];

  const markRead = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications/all"] });
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => apiFetch("/api/notifications/read-all", { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications/all"] });
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({ title: "All notifications marked as read" });
    },
  });

  const deleteNotif = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/notifications/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications/all"] });
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const clearRead = useMutation({
    mutationFn: () => apiFetch("/api/notifications/clear-read", { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications/all"] });
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({ title: "Read notifications cleared" });
    },
  });

  const filtered = notifs.filter(n => {
    const passStatus =
      statusFilter === "unread" ? !n.read :
      statusFilter === "read"   ?  n.read :
      true;
    const passType =
      typeFilter === "all"   ? true :
      typeFilter === "scope" ? (n.type === "scope_request" || n.type === "scope_update") :
      n.type === typeFilter;
    return passStatus && passType;
  });

  const unreadCount = resp?.unreadCount ?? notifs.filter(n => !n.read).length;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Bell className="w-12 h-12 text-muted-foreground mx-auto" />
            <h2 className="text-xl font-semibold">Sign in to view notifications</h2>
            <Link href="/login"><Button>Sign In</Button></Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 md:px-6 py-24">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold" data-testid="notifications-title">Notifications</h1>
              <p className="text-sm text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending} className="gap-2" data-testid="btn-mark-all-read">
                <CheckCheck className="w-4 h-4" /> Mark all read
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => clearRead.mutate()} disabled={clearRead.isPending} className="gap-2 text-muted-foreground" data-testid="btn-clear-read">
              <Trash2 className="w-4 h-4" /> Clear read
            </Button>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center gap-1 mb-3 bg-white/5 rounded-lg p-1 w-fit" data-testid="notifications-filter">
          {(["all", "unread", "read"] as StatusFilter[]).map(t => (
            <button
              key={t}
              data-testid={`filter-status-${t}`}
              onClick={() => setStatusFilter(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${
                statusFilter === t ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
              {t === "unread" && unreadCount > 0 && (
                <span className="ml-1.5 bg-primary text-white text-xs rounded-full px-1.5 py-0.5">{unreadCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Type filter tabs */}
        <div className="flex items-center gap-1 mb-6 flex-wrap" data-testid="notifications-type-filter">
          {TYPE_TABS.map(({ key, label }) => (
            <button
              key={key}
              data-testid={`filter-type-${key}`}
              onClick={() => setTypeFilter(key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                typeFilter === key
                  ? "bg-white/10 text-foreground border border-white/20"
                  : "text-muted-foreground/70 hover:text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Notification list */}
        <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center gap-2 p-8 text-muted-foreground justify-center">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground" data-testid="notifications-empty">
              <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No {statusFilter !== "all" ? statusFilter : ""} notifications{typeFilter !== "all" ? ` of type "${typeFilter}"` : ""}</p>
              <p className="text-sm mt-1">You're all caught up.</p>
            </div>
          ) : (
            <ul>
              {filtered.map((n, i) => (
                <li key={n.id} data-testid={`notification-item-${n.id}`}>
                  {i > 0 && <Separator className="opacity-10" />}
                  <div
                    className={`flex items-start gap-4 px-6 py-4 transition-colors hover:bg-white/3 ${!n.read ? "bg-primary/3" : ""}`}
                    onClick={() => { if (!n.read) markRead.mutate(n.id); }}
                    style={{ cursor: n.read ? "default" : "pointer" }}
                  >
                    {/* Icon + unread dot */}
                    <div className="mt-0.5 relative">
                      {typeIcon(n.type)}
                      {!n.read && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-medium ${!n.read ? "text-foreground" : "text-muted-foreground"}`}>
                          {n.title}
                        </p>
                        <Badge variant="secondary" className="text-xs capitalize">{typeLabel(n.type)}</Badge>
                        {!n.read && <Badge className="text-xs bg-primary/20 text-primary border-primary/30">New</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-xs text-muted-foreground/60">
                          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        </span>
                        {(n.link || n.type === "scope_update") && (
                          <Link
                            href={n.type === "scope_update" ? "/scope-requests" : n.link!}
                            className="text-xs text-primary hover:underline"
                            onClick={e => e.stopPropagation()}
                          >
                            {n.type === "scope_update" ? "Review request →" : "View →"}
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <button
                      onClick={e => { e.stopPropagation(); deleteNotif.mutate(n.id); }}
                      className="shrink-0 text-muted-foreground/40 hover:text-red-400 transition-colors mt-0.5"
                      title="Delete notification"
                      data-testid={`btn-delete-notif-${n.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
