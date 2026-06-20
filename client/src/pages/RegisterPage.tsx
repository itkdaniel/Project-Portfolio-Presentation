import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Cpu, Eye, EyeOff, RefreshCw, CheckCircle } from "lucide-react";

function validate(form: { username: string; email: string; fullName: string; password: string; confirm: string }) {
  const errs: Record<string, string> = {};
  if (!form.fullName.trim() || form.fullName.trim().length < 2) errs.fullName = "Full name must be at least 2 characters";
  if (!form.username.trim() || form.username.length < 2) errs.username = "Username must be at least 2 characters";
  if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Valid email required";
  if (!form.password || form.password.length < 8) errs.password = "Password must be at least 8 characters";
  if (form.password !== form.confirm) errs.confirm = "Passwords do not match";
  return errs;
}

export default function RegisterPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState({ username: "", email: "", fullName: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const field = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors(prev => { const n = { ...prev }; delete n[k]; return n; });
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.username, email: form.email, password: form.password, fullName: form.fullName }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) setErrors({ email: "Email already registered" });
        else toast({ title: "Registration failed", description: data.message, variant: "destructive" });
        return;
      }
      localStorage.setItem("nexus_token", data.token);
      setSuccess(true);
      toast({ title: "Account created!", description: "A confirmation email has been sent. Redirecting…" });
      setTimeout(() => navigate("/settings"), 2000);
    } catch {
      toast({ title: "Network error", description: "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="flex items-center gap-2 mb-6 group">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:border-primary/50 transition-colors">
              <Cpu className="text-primary w-5 h-5" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight">Nexus<span className="text-primary">Consult</span></span>
          </Link>
          <h1 className="text-2xl font-display font-bold text-center">Create your account</h1>
          <p className="text-muted-foreground text-sm mt-1">Already have an account? <Link href="/login" className="text-primary hover:underline">Sign in</Link></p>
        </div>

        {success ? (
          <div className="glass-panel rounded-xl border border-white/5 p-8 text-center">
            <div className="w-16 h-16 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Account created!</h2>
            <p className="text-muted-foreground text-sm">A confirmation email has been sent to <strong>{form.email}</strong>. Redirecting you now…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="glass-panel rounded-xl border border-white/5 p-6 space-y-5">
            {/* Full name */}
            <div className="space-y-1.5">
              <Label htmlFor="reg-fullName">Full Name <span className="text-red-400">*</span></Label>
              <Input id="reg-fullName" data-testid="input-reg-fullName" value={form.fullName}
                onChange={field("fullName")} placeholder="Jane Smith" className="bg-background/50"
                aria-invalid={!!errors.fullName} />
              {errors.fullName && <p className="text-xs text-red-400">{errors.fullName}</p>}
            </div>

            {/* Username */}
            <div className="space-y-1.5">
              <Label htmlFor="reg-username">Username <span className="text-red-400">*</span></Label>
              <Input id="reg-username" data-testid="input-reg-username" value={form.username}
                onChange={field("username")} placeholder="janesmith" className="bg-background/50"
                aria-invalid={!!errors.username} />
              {errors.username && <p className="text-xs text-red-400">{errors.username}</p>}
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="reg-email">Email <span className="text-red-400">*</span></Label>
              <Input id="reg-email" data-testid="input-reg-email" type="email" value={form.email}
                onChange={field("email")} placeholder="jane@example.com" className="bg-background/50"
                aria-invalid={!!errors.email} />
              {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label htmlFor="reg-password">Password <span className="text-red-400">*</span></Label>
              <div className="relative">
                <Input id="reg-password" data-testid="input-reg-password"
                  type={showPass ? "text" : "password"} value={form.password}
                  onChange={field("password")} placeholder="Min. 8 characters" className="bg-background/50 pr-10"
                  aria-invalid={!!errors.password} />
                <button type="button" onClick={() => setShowPass(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <Label htmlFor="reg-confirm">Confirm Password <span className="text-red-400">*</span></Label>
              <Input id="reg-confirm" data-testid="input-reg-confirm"
                type={showPass ? "text" : "password"} value={form.confirm}
                onChange={field("confirm")} placeholder="Repeat password" className="bg-background/50"
                aria-invalid={!!errors.confirm} />
              {errors.confirm && <p className="text-xs text-red-400">{errors.confirm}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={loading} data-testid="btn-register">
              {loading ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Creating account…</> : "Create Account"}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              By registering you agree to our terms. A confirmation email will be sent upon signup.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
