import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Cpu, Eye, EyeOff, RefreshCw } from "lucide-react";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.email) errs.email = "Email required";
    if (!form.password) errs.password = "Password required";
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors({ password: data.message ?? "Invalid credentials" });
        return;
      }
      localStorage.setItem("nexus_token", data.token);
      toast({ title: "Signed in!", description: `Welcome back, ${data.user.username}.` });
      navigate("/");
    } catch {
      toast({ title: "Network error", description: "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="flex items-center gap-2 mb-6 group">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:border-primary/50 transition-colors">
              <Cpu className="text-primary w-5 h-5" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight">Nexus<span className="text-primary">Consult</span></span>
          </Link>
          <h1 className="text-2xl font-display font-bold text-center">Sign in</h1>
          <p className="text-muted-foreground text-sm mt-1">
            No account yet? <Link href="/register" className="text-primary hover:underline">Create one</Link>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass-panel rounded-xl border border-white/5 p-6 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="login-email">Email</Label>
            <Input id="login-email" data-testid="input-login-email" type="email" value={form.email}
              onChange={e => { setForm(f => ({ ...f, email: e.target.value })); setErrors({}); }}
              placeholder="you@example.com" className="bg-background/50" aria-invalid={!!errors.email} />
            {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="login-password">Password</Label>
            <div className="relative">
              <Input id="login-password" data-testid="input-login-password"
                type={showPass ? "text" : "password"} value={form.password}
                onChange={e => { setForm(f => ({ ...f, password: e.target.value })); setErrors({}); }}
                placeholder="Your password" className="bg-background/50 pr-10" aria-invalid={!!errors.password} />
              <button type="button" onClick={() => setShowPass(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
          </div>

          <Button type="submit" className="w-full" disabled={loading} data-testid="btn-login">
            {loading ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Signing in…</> : "Sign In"}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <p className="text-xs text-muted-foreground">
            Demo: <code className="text-primary">admin@nexusconsult.dev</code> / <code className="text-primary">Admin@Nexus2024!</code>
          </p>
        </div>
      </div>
    </div>
  );
}
