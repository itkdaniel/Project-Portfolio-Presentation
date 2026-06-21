import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Terminal, Menu, X, Cpu, Calendar, FlaskConical, Settings, FileText, Activity, BookOpen, LogIn, UserPlus, LogOut, ClipboardCheck, Shield } from "lucide-react";
import { NotificationBell } from "./NotificationBell";

interface MeUser { id: string; username: string; email: string; role?: string; fullName?: string; profilePictureUrl?: string; }

function getToken() { return typeof localStorage !== "undefined" ? localStorage.getItem("nexus_token") : null; }

function Avatar({ user }: { user: MeUser }) {
  const initials = (user.fullName || user.username).split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  if (user.profilePictureUrl) {
    return <img src={user.profilePictureUrl} alt={user.fullName || user.username}
      className="w-8 h-8 rounded-full object-cover border border-primary/30" data-testid="nav-avatar-img" />;
  }
  return (
    <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center" data-testid="nav-avatar-initials">
      <span className="text-xs font-semibold text-primary">{initials}</span>
    </div>
  );
}

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [, navigate] = useLocation();
  const [location] = useLocation();
  const token = getToken();

  const { data: me } = useQuery<MeUser>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Not authenticated");
      return res.json();
    },
    enabled: !!token,
    retry: false,
    staleTime: 60_000,
  });

  if (typeof window !== "undefined") {
    window.addEventListener("scroll", () => { setIsScrolled(window.scrollY > 20); });
  }

  function handleLogout() {
    localStorage.removeItem("nexus_token");
    navigate("/");
    window.location.reload();
  }

  const isHome = location === "/";

  return (
    <nav
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        isScrolled ? "bg-background/80 backdrop-blur-md border-b border-white/5 py-3" : "bg-transparent py-5"
      }`}
    >
      <div className="container mx-auto px-4 md:px-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group cursor-pointer">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:border-primary/50 transition-colors">
            <Cpu className="text-primary w-5 h-5" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">Nexus<span className="text-primary">Consult</span></span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-6">
          {isHome ? (
            <>
              <a href="#services" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Architecture</a>
              <a href="#portfolio" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Deployments</a>
            </>
          ) : (
            <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Home</Link>
          )}
          <Link href="/tests" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="nav-tests">
            <FlaskConical className="w-4 h-4" /> Tests
          </Link>
          <Link href="/tax" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="nav-tax">
            <FileText className="w-4 h-4" /> Tax Forms
          </Link>
          <Link href="/status" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="nav-status">
            <Activity className="w-4 h-4" /> Status
          </Link>
          <Link href="/resume" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="nav-resume">
            <BookOpen className="w-4 h-4" /> Resumé
          </Link>
          <Link href="/settings" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="nav-settings">
            <Settings className="w-4 h-4" /> Settings
          </Link>
          {me?.role === "admin" && (
            <>
              <Link href="/admin/approvals" className="flex items-center gap-1.5 text-sm font-medium text-yellow-400/80 hover:text-yellow-400 transition-colors" data-testid="nav-admin-approvals">
                <ClipboardCheck className="w-4 h-4" /> Approvals
              </Link>
              <Link href="/admin/scopes" className="flex items-center gap-1.5 text-sm font-medium text-amber-400/80 hover:text-amber-400 transition-colors" data-testid="nav-admin-scopes">
                <Shield className="w-4 h-4" /> AI Grants
              </Link>
            </>
          )}

          {me ? (
            <div className="flex items-center gap-2">
              <NotificationBell />
              <Link href="/settings" className="flex items-center gap-2 hover:opacity-80 transition-opacity" data-testid="nav-user-profile">
                <Avatar user={me} />
                <span className="text-sm font-medium text-foreground hidden lg:block">{me.fullName || me.username}</span>
              </Link>
              <button onClick={handleLogout} className="text-muted-foreground hover:text-foreground transition-colors" title="Sign out" data-testid="btn-logout">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button size="sm" variant="ghost" className="gap-1.5" data-testid="nav-login">
                  <LogIn className="w-4 h-4" /> Sign In
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm" className="gap-1.5 rounded-full shadow-[0_0_12px_rgba(59,130,246,0.2)]" data-testid="nav-register">
                  <UserPlus className="w-4 h-4" /> Register
                </Button>
              </Link>
            </div>
          )}

          <Link href="/book">
            <Button className="rounded-full px-5 font-medium shadow-[0_0_15px_rgba(59,130,246,0.3)]" data-testid="nav-book">
              <Calendar className="w-4 h-4 mr-2" /> Book
            </Button>
          </Link>
        </div>

        {/* Mobile Toggle */}
        <button className="md:hidden text-foreground" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} data-testid="nav-mobile-toggle">
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-card border-b border-border p-4 flex flex-col gap-3 shadow-xl">
          {isHome ? (
            <>
              <a href="#services" className="p-2 text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>Architecture</a>
              <a href="#portfolio" className="p-2 text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>Deployments</a>
            </>
          ) : (
            <Link href="/" className="p-2 text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>Home</Link>
          )}
          <Link href="/tests" className="p-2 text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
            <FlaskConical className="w-4 h-4" /> Tests
          </Link>
          <Link href="/tax" className="p-2 text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
            <FileText className="w-4 h-4" /> Tax Forms
          </Link>
          <Link href="/status" className="p-2 text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
            <Activity className="w-4 h-4" /> Status
          </Link>
          <Link href="/resume" className="p-2 text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-2" onClick={() => setMobileMenuOpen(false)} data-testid="nav-resume-mobile">
            <BookOpen className="w-4 h-4" /> Resumé
          </Link>
          <Link href="/settings" className="p-2 text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
            <Settings className="w-4 h-4" /> Settings
          </Link>
          {me?.role === "admin" && (
            <>
              <Link href="/admin/approvals" className="p-2 text-sm font-medium text-yellow-400/80 hover:text-yellow-400 flex items-center gap-2" onClick={() => setMobileMenuOpen(false)} data-testid="nav-admin-approvals-mobile">
                <ClipboardCheck className="w-4 h-4" /> Approvals
              </Link>
              <Link href="/admin/scopes" className="p-2 text-sm font-medium text-amber-400/80 hover:text-amber-400 flex items-center gap-2" onClick={() => setMobileMenuOpen(false)} data-testid="nav-admin-scopes-mobile">
                <Shield className="w-4 h-4" /> AI Grants
              </Link>
            </>
          )}
          {me ? (
            <div className="flex items-center justify-between p-2 rounded-lg bg-white/5">
              <div className="flex items-center gap-2">
                <Avatar user={me} />
                <span className="text-sm font-medium">{me.fullName || me.username}</span>
              </div>
              <button onClick={handleLogout} className="text-muted-foreground hover:text-red-400 transition-colors" data-testid="btn-logout-mobile">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2 mt-1">
              <Link href="/login" className="flex-1" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="outline" className="w-full gap-1.5"><LogIn className="w-4 h-4" /> Sign In</Button>
              </Link>
              <Link href="/register" className="flex-1" onClick={() => setMobileMenuOpen(false)}>
                <Button className="w-full gap-1.5"><UserPlus className="w-4 h-4" /> Register</Button>
              </Link>
            </div>
          )}
          <Link href="/book" onClick={() => setMobileMenuOpen(false)}>
            <Button className="w-full mt-1"><Calendar className="w-4 h-4 mr-2" /> Book Session</Button>
          </Link>
        </div>
      )}
    </nav>
  );
}
