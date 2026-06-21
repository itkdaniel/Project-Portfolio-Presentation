import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  User, Bell, Palette, Shield, Mail, Plug,
  Github, Linkedin, Globe, Save, RefreshCw,
  CheckCircle, AlertCircle, Eye, EyeOff,
  ChevronRight, Settings as SettingsIcon, X, Upload, Trash2
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserSettingsData {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
  timezone: string;
  language: string;
  theme: string;
  compactMode: boolean;
  sidebarCollapsed: boolean;
  emailNotifications: boolean;
  notifyBookingConfirm: boolean;
  notifyNewBooking: boolean;
  notifyNewInquiry: boolean;
  notifyProjectUpdates: boolean;
  notifyWeeklyDigest: boolean;
  notifySecurityAlerts: boolean;
}

interface EmailConfigData {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  fromName: string;
  fromEmail: string;
  adminEmail: string;
  replyTo?: string;
  enabled: boolean;
  sendUserConfirmation: boolean;
  sendAdminNotification: boolean;
  githubUrl: string;
  linkedinUrl: string;
  websiteUrl: string;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiGet(url: string) {
  const token = localStorage.getItem("nexus_token");
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPatch(url: string, body: object) {
  const token = localStorage.getItem("nexus_token");
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPost(url: string, body: object) {
  const token = localStorage.getItem("nexus_token");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Section types ─────────────────────────────────────────────────────────────

type SectionId = "profile" | "notifications" | "appearance" | "security" | "email" | "integrations";

const SECTIONS: { id: SectionId; label: string; icon: React.ReactNode; description: string }[] = [
  { id: "profile",       label: "Profile",            icon: <User className="w-4 h-4" />,    description: "Your public profile information" },
  { id: "notifications", label: "Notifications",      icon: <Bell className="w-4 h-4" />,    description: "Email and alert preferences" },
  { id: "appearance",    label: "Appearance",          icon: <Palette className="w-4 h-4" />, description: "Theme and display options" },
  { id: "security",      label: "Security",            icon: <Shield className="w-4 h-4" />,  description: "Password and account security" },
  { id: "email",         label: "Email Config",        icon: <Mail className="w-4 h-4" />,    description: "SMTP and notification routing" },
  { id: "integrations",  label: "Integrations",        icon: <Plug className="w-4 h-4" />,    description: "Social and external links" },
];

// ── Main Settings page ────────────────────────────────────────────────────────

// Sections visible to guests (read-only profile only)
const GUEST_SECTIONS: SectionId[] = ["profile"];
// Sections that require auth to render
const AUTH_REQUIRED_SECTIONS: SectionId[] = ["notifications", "appearance", "security", "email", "integrations"];

export default function Settings() {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("nexus_token") : null;
  const isAuthenticated = !!token;
  const [activeSection, setActiveSection] = useState<SectionId>("profile");
  const { toast } = useToast();
  const qc = useQueryClient();

  // Only fetch settings when authenticated
  const { data: settings, isLoading: settingsLoading } = useQuery<UserSettingsData>({
    queryKey: ["/api/settings"],
    queryFn:  () => apiGet("/api/settings"),
    enabled:  isAuthenticated,
    retry: false,
  });

  const { data: emailCfg, isLoading: emailLoading } = useQuery<EmailConfigData>({
    queryKey: ["/api/settings/email-config"],
    queryFn:  () => apiGet("/api/settings/email-config"),
    enabled:  isAuthenticated,
    retry: false,
  });

  const patchSettings = useMutation({
    mutationFn: (data: Partial<UserSettingsData>) => apiPatch("/api/settings", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings saved", description: "Your preferences have been updated." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const patchEmailCfg = useMutation({
    mutationFn: (data: Partial<EmailConfigData>) => apiPatch("/api/settings/email-config", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/settings/email-config"] });
      toast({ title: "Email config saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Visible sections: guests only see Profile
  const visibleSections = isAuthenticated ? SECTIONS : SECTIONS.filter(s => GUEST_SECTIONS.includes(s.id));
  const currentSection = (visibleSections.find(s => s.id === activeSection) ?? visibleSections[0])!;

  // If current active section is no longer visible (e.g., user just logged out), reset to profile
  if (!visibleSections.find(s => s.id === activeSection)) {
    setActiveSection("profile");
  }

  const isLoadingSection = settingsLoading && AUTH_REQUIRED_SECTIONS.includes(activeSection);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 md:px-6 py-24">

        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <SettingsIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold" data-testid="settings-title">Settings</h1>
              <p className="text-muted-foreground text-sm">Manage your account, preferences, and integrations</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-6">

          {/* Sidebar */}
          <aside className="w-full md:w-64 shrink-0">
            <nav className="glass-panel rounded-xl border border-white/5 p-2 space-y-1" data-testid="settings-sidebar">
              {visibleSections.map(section => (
                <button
                  key={section.id}
                  data-testid={`settings-nav-${section.id}`}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                    activeSection === section.id
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  {section.icon}
                  <span className="text-sm font-medium">{section.label}</span>
                  {activeSection === section.id && <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
                </button>
              ))}
            </nav>
          </aside>

          {/* Content panel */}
          <div className="flex-1 min-w-0">
            <div className="glass-panel rounded-xl border border-white/5 p-6">
              <div className="mb-6">
                <h2 className="text-lg font-display font-semibold" data-testid="settings-section-title">{currentSection.label}</h2>
                <p className="text-sm text-muted-foreground">{currentSection.description}</p>
              </div>
              <Separator className="mb-6 opacity-20" />

              {isLoadingSection ? (
                <div className="flex items-center gap-2 text-muted-foreground"><RefreshCw className="w-4 h-4 animate-spin" /> Loading…</div>
              ) : (
                <>
                  {/* Profile: always rendered, guest-aware internally */}
                  {activeSection === "profile" && (
                    <ProfileSection
                      settings={settings ?? null}
                      onSave={data => patchSettings.mutate(data)}
                      saving={patchSettings.isPending}
                      isAuthenticated={isAuthenticated}
                    />
                  )}
                  {activeSection === "notifications" && settings && (
                    <NotificationsSection settings={settings} onSave={data => patchSettings.mutate(data)} saving={patchSettings.isPending} />
                  )}
                  {activeSection === "appearance" && settings && (
                    <AppearanceSection settings={settings} onSave={data => patchSettings.mutate(data)} saving={patchSettings.isPending} />
                  )}
                  {/* Security: hidden for guests entirely */}
                  {activeSection === "security" && isAuthenticated && (
                    <SecuritySection />
                  )}
                  {activeSection === "email" && isAuthenticated && (
                    emailLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground"><RefreshCw className="w-4 h-4 animate-spin" /> Loading…</div>
                    ) : (
                      <EmailConfigSection cfg={emailCfg} onSave={data => patchEmailCfg.mutate(data)} saving={patchEmailCfg.isPending} />
                    )
                  )}
                  {activeSection === "integrations" && settings && (
                    <IntegrationsSection settings={settings} onSave={data => patchSettings.mutate(data)} saving={patchSettings.isPending} />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

// ── Profile Section ───────────────────────────────────────────────────────────

interface ExtendedProfile {
  fullName?: string;
  position?: string;
  mobile?: string;
  location?: string;
  bio?: string;
  profilePictureUrl?: string;
}

type MeData = ExtendedProfile & { username: string; email: string };

function useExtendedProfile(token: string | null) {
  const qc = useQueryClient();
  const { data: me, isLoading } = useQuery<MeData>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("Not authenticated");
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const save = useMutation({
    mutationFn: async (data: ExtendedProfile) => {
      const res = await fetch("/api/users/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/auth/me"] }),
  });

  return { me, isLoading, save };
}

function validateProfileForm(form: ExtendedProfile): Record<string, string> {
  const errs: Record<string, string> = {};
  if (form.fullName !== undefined && form.fullName !== "") {
    const trimmed = form.fullName.trim();
    if (trimmed.length < 2) errs.fullName = "Full name must be at least 2 characters";
    else if (!trimmed) errs.fullName = "Full name cannot be blank";
  }
  if (form.mobile !== undefined && form.mobile !== "") {
    if (!/^[+\d\s\-().]{7,20}$/.test(form.mobile)) {
      errs.mobile = "Invalid phone number (7–20 chars, digits/spaces/+/-/().)";
    }
  }
  return errs;
}

function ProfileSection({ settings, onSave, saving, isAuthenticated }: {
  settings: UserSettingsData | null;
  onSave: (d: any) => void;
  saving: boolean;
  isAuthenticated: boolean;
}) {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("nexus_token") : null;
  const { toast } = useToast();
  const { me, save } = useExtendedProfile(token);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const defaultSettings: UserSettingsData = {
    displayName: "", bio: "", avatarUrl: "", githubUrl: "", linkedinUrl: "", websiteUrl: "",
    timezone: "UTC", language: "en", theme: "dark", compactMode: false, sidebarCollapsed: false,
    emailNotifications: true, notifyBookingConfirm: true, notifyNewBooking: false,
    notifyNewInquiry: false, notifyProjectUpdates: false, notifyWeeklyDigest: false, notifySecurityAlerts: true,
  };
  const effectiveSettings = settings ?? defaultSettings;

  const [settingsForm, setSettingsForm] = useState({
    displayName: effectiveSettings.displayName ?? "",
    bio:         effectiveSettings.bio ?? "",
    avatarUrl:   effectiveSettings.avatarUrl ?? "",
    timezone:    effectiveSettings.timezone,
    language:    effectiveSettings.language,
  });

  const [profileForm, setProfileForm] = useState<ExtendedProfile>({
    fullName: "", position: "", mobile: "", location: "", bio: "", profilePictureUrl: "",
  });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [profileDirty, setProfileDirty] = useState(false);
  const [profileInitialized, setProfileInitialized] = useState(false);

  if (me && !profileInitialized) {
    setProfileForm({
      fullName:          me.fullName ?? "",
      position:          me.position ?? "",
      mobile:            me.mobile ?? "",
      location:          me.location ?? "",
      bio:               me.bio ?? "",
      profilePictureUrl: me.profilePictureUrl ?? "",
    });
    setProfileInitialized(true);
  }

  const pf = (k: keyof ExtendedProfile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setProfileForm(f => ({ ...f, [k]: e.target.value }));
    setProfileDirty(true);
    if (profileErrors[k]) setProfileErrors(prev => { const n = { ...prev }; delete n[k]; return n; });
  };

  function handleProfileCancel() {
    if (me) {
      setProfileForm({
        fullName: me.fullName ?? "", position: me.position ?? "",
        mobile: me.mobile ?? "", location: me.location ?? "",
        bio: me.bio ?? "", profilePictureUrl: me.profilePictureUrl ?? "",
      });
    }
    setProfileDirty(false);
    setProfileErrors({});
  }

  async function handleProfileSave() {
    const errs = validateProfileForm(profileForm);
    if (Object.keys(errs).length) { setProfileErrors(errs); return; }
    try {
      await save.mutateAsync(profileForm);
      setProfileDirty(false);
      toast({ title: "Profile updated" });
    } catch (e: any) {
      toast({ title: "Error saving profile", description: e.message, variant: "destructive" });
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await fetch("/api/users/avatar", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const { avatarUrl } = await res.json();
      setProfileForm(f => ({ ...f, profilePictureUrl: avatarUrl }));
      setProfileDirty(true);
      toast({ title: "Avatar uploaded", description: "Your profile picture has been updated." });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  function handleAvatarRemove() {
    setProfileForm(f => ({ ...f, profilePictureUrl: "" }));
    setProfileDirty(true);
  }

  const displayName = profileForm.fullName || me?.username || "You";
  const initials = displayName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="space-y-8">
      {/* Guest read-only banner */}
      {!isAuthenticated && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground" data-testid="profile-guest-notice">
          <span className="font-medium text-foreground">Read-only mode.</span>{" "}
          <a href="/login" className="text-primary hover:underline">Sign in</a> or{" "}
          <a href="/register" className="text-primary hover:underline">create an account</a> to edit your profile.
        </div>
      )}

      {/* Extended profile — backed by /api/users/profile */}
      <fieldset disabled={!isAuthenticated} className="space-y-5 disabled:opacity-60 disabled:pointer-events-none">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Professional Info</h3>

        {/* Avatar + email row */}
        <div className="flex items-start gap-4">
          {/* Avatar preview */}
          <div className="shrink-0 relative group">
            {profileForm.profilePictureUrl ? (
              <img src={profileForm.profilePictureUrl} alt="Avatar"
                className="w-20 h-20 rounded-full object-cover border-2 border-primary/20"
                onError={e => (e.currentTarget.style.display = "none")} />
            ) : (
              <div className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                <span className="text-2xl font-bold text-primary">{initials}</span>
              </div>
            )}
          </div>

          <div className="flex-1 space-y-3">
            {/* Email — read-only display */}
            {me?.email && (
              <div className="space-y-0.5">
                <Label className="text-xs text-muted-foreground">Email (account)</Label>
                <p className="text-sm font-medium text-foreground" data-testid="display-email">{me.email}</p>
              </div>
            )}

            {/* Avatar upload / URL */}
            <div className="space-y-2">
              <Label>Profile Picture</Label>
              <div className="flex flex-wrap gap-2">
                {/* Hidden file input */}
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  data-testid="input-avatar-file"
                  onChange={handleAvatarUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading || !isAuthenticated}
                  data-testid="btn-upload-avatar"
                  className="gap-2"
                >
                  {avatarUploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {avatarUploading ? "Uploading…" : "Upload Image"}
                </Button>
                {profileForm.profilePictureUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAvatarRemove}
                    disabled={!isAuthenticated}
                    data-testid="btn-remove-avatar"
                    className="gap-2 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Or enter a URL directly:</p>
              <Input id="profilePictureUrl" data-testid="input-profilePictureUrl" value={profileForm.profilePictureUrl ?? ""}
                onChange={pf("profilePictureUrl")} placeholder="https://example.com/photo.jpg" className="bg-background/50" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Full Name</Label>
            <Input id="fullName" data-testid="input-fullName" value={profileForm.fullName ?? ""}
              onChange={pf("fullName")} placeholder="Jane Smith" className="bg-background/50"
              aria-invalid={!!profileErrors.fullName} />
            {profileErrors.fullName && <p className="text-xs text-red-400">{profileErrors.fullName}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="position">Job Title / Position</Label>
            <Input id="position" data-testid="input-position" value={profileForm.position ?? ""}
              onChange={pf("position")} placeholder="Senior Engineer" className="bg-background/50" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="mobile">Mobile</Label>
            <Input id="mobile" data-testid="input-mobile" value={profileForm.mobile ?? ""}
              onChange={pf("mobile")} placeholder="+1 555 000 0000" className="bg-background/50"
              aria-invalid={!!profileErrors.mobile} />
            {profileErrors.mobile
              ? <p className="text-xs text-red-400">{profileErrors.mobile}</p>
              : <p className="text-xs text-muted-foreground">Stored encrypted at rest.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="location">Location</Label>
            <Input id="location" data-testid="input-location" value={profileForm.location ?? ""}
              onChange={pf("location")} placeholder="San Francisco, CA" className="bg-background/50" />
            <p className="text-xs text-muted-foreground">Stored encrypted at rest.</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="profile-bio">Bio</Label>
          <Textarea id="profile-bio" data-testid="input-profile-bio" value={profileForm.bio ?? ""}
            onChange={pf("bio")} placeholder="A short bio shown on your resumé…"
            rows={3} className="bg-background/50 resize-none" />
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleProfileSave} disabled={save.isPending || !isAuthenticated} data-testid="btn-save-profile" className="gap-2">
            {save.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Profile
          </Button>
          {profileDirty && (
            <Button variant="outline" onClick={handleProfileCancel} disabled={save.isPending} data-testid="btn-cancel-profile" className="gap-2">
              <X className="w-4 h-4" /> Cancel
            </Button>
          )}
        </div>
      </fieldset>

      {isAuthenticated && <Separator />}

      {/* Display settings — backed by /api/settings — only shown when authenticated */}
      {isAuthenticated && (
      <div className="space-y-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Display &amp; Preferences</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Display Name</Label>
            <Input id="displayName" data-testid="input-displayName" value={settingsForm.displayName}
              onChange={e => setSettingsForm(f => ({ ...f, displayName: e.target.value }))}
              placeholder="Your name" className="bg-background/50" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="avatarUrl">Avatar URL</Label>
            <Input id="avatarUrl" data-testid="input-avatarUrl" value={settingsForm.avatarUrl}
              onChange={e => setSettingsForm(f => ({ ...f, avatarUrl: e.target.value }))}
              placeholder="https://…" className="bg-background/50" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="settings-bio">Bio</Label>
          <Textarea id="settings-bio" data-testid="input-bio" value={settingsForm.bio}
            onChange={e => setSettingsForm(f => ({ ...f, bio: e.target.value }))}
            placeholder="Short bio…" rows={2} className="bg-background/50 resize-none" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Select value={settingsForm.timezone} onValueChange={v => setSettingsForm(f => ({ ...f, timezone: v }))}>
              <SelectTrigger data-testid="select-timezone" className="bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["UTC","America/New_York","America/Chicago","America/Denver","America/Los_Angeles","Europe/London","Europe/Berlin","Asia/Tokyo","Asia/Shanghai","Australia/Sydney"].map(tz => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Language</Label>
            <Select value={settingsForm.language} onValueChange={v => setSettingsForm(f => ({ ...f, language: v }))}>
              <SelectTrigger data-testid="select-language" className="bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="de">Deutsch</SelectItem>
                <SelectItem value="zh">中文</SelectItem>
                <SelectItem value="ja">日本語</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <SaveButton onClick={() => onSave(settingsForm)} saving={saving} />
      </div>
      )}
    </div>
  );
}

// ── Notifications Section ─────────────────────────────────────────────────────

interface ChannelPrefs {
  inApp: boolean;
  email: boolean;
  sms: boolean;
  smsPhone: string;
}

function NotificationsSection({ settings, onSave, saving }: { settings: UserSettingsData; onSave: (d: any) => void; saving: boolean }) {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("nexus_token") : null;
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    emailNotifications:   settings.emailNotifications,
    notifyBookingConfirm: settings.notifyBookingConfirm,
    notifyNewBooking:     settings.notifyNewBooking,
    notifyNewInquiry:     settings.notifyNewInquiry,
    notifyProjectUpdates: settings.notifyProjectUpdates,
    notifyWeeklyDigest:   settings.notifyWeeklyDigest,
    notifySecurityAlerts: settings.notifySecurityAlerts,
  });

  // Channel prefs (separate API)
  const { data: channelPrefs } = useQuery<ChannelPrefs>({
    queryKey: ["/api/notification-prefs"],
    queryFn:  () => apiGet("/api/notification-prefs"),
    enabled:  !!token,
  });

  const [channelForm, setChannelForm] = useState<ChannelPrefs>({
    inApp: true, email: true, sms: false, smsPhone: "",
  });

  // Sync from server once loaded
  const [channelInit, setChannelInit] = useState(false);
  if (channelPrefs && !channelInit) {
    setChannelForm({
      inApp:    channelPrefs.inApp,
      email:    channelPrefs.email,
      sms:      channelPrefs.sms,
      smsPhone: channelPrefs.smsPhone ?? "",
    });
    setChannelInit(true);
  }

  const patchChannelPrefs = useMutation({
    mutationFn: (data: Partial<ChannelPrefs>) => apiPatch("/api/notification-prefs", data),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ["/api/notification-prefs"] });
      toast({ title: "Channel preferences saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const [testSending, setTestSending] = useState(false);
  async function handleTestSend() {
    setTestSending(true);
    try {
      const res = await apiPost("/api/notification-prefs/test", {});
      const channels: string[] = (res as any).channels ?? [];
      toast({
        title: "Test sent",
        description: channels.length
          ? `Fired on: ${channels.join(", ")}`
          : "No channels enabled.",
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setTestSending(false);
    }
  }

  const toggle = (key: keyof typeof form) => setForm(f => ({ ...f, [key]: !f[key] }));

  return (
    <div className="space-y-8">

      {/* ── Delivery channels ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Delivery Channels</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Choose how you receive notifications</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestSend}
            disabled={testSending}
            className="gap-2 text-xs"
            data-testid="btn-test-notifications"
          >
            {testSending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Bell className="w-3 h-3" />}
            Test Send
          </Button>
        </div>

        <div className="rounded-lg border border-white/8 bg-white/2 divide-y divide-white/5">
          {/* In-App */}
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium">In-App</p>
              <p className="text-xs text-muted-foreground">Bell icon + /notifications page</p>
            </div>
            <Switch
              checked={channelForm.inApp}
              onCheckedChange={v => setChannelForm(f => ({ ...f, inApp: v }))}
              data-testid="switch-channel-inApp"
            />
          </div>

          {/* Email */}
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium">Email</p>
              <p className="text-xs text-muted-foreground">Sent to your account email address</p>
            </div>
            <Switch
              checked={channelForm.email}
              onCheckedChange={v => setChannelForm(f => ({ ...f, email: v }))}
              data-testid="switch-channel-email"
            />
          </div>

          {/* SMS */}
          <div className="px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium flex items-center gap-2">
                  SMS
                  <Badge variant="secondary" className="text-xs">Twilio</Badge>
                </p>
                <p className="text-xs text-muted-foreground">Requires Twilio env vars + phone number</p>
              </div>
              <Switch
                checked={channelForm.sms}
                onCheckedChange={v => setChannelForm(f => ({ ...f, sms: v }))}
                data-testid="switch-channel-sms"
              />
            </div>
            {channelForm.sms && (
              <Input
                value={channelForm.smsPhone}
                onChange={e => setChannelForm(f => ({ ...f, smsPhone: e.target.value }))}
                placeholder="+15550001234 (E.164 format)"
                className="bg-background/50 text-sm"
                data-testid="input-sms-phone"
              />
            )}
          </div>
        </div>

        <Button
          size="sm"
          onClick={() => patchChannelPrefs.mutate(channelForm)}
          disabled={patchChannelPrefs.isPending}
          className="gap-2"
          data-testid="btn-save-channel-prefs"
        >
          {patchChannelPrefs.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Channels
        </Button>
      </div>

      <Separator className="opacity-10" />

      {/* ── Email alert types (existing) ── */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Email Alert Types</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Fine-tune which events trigger email notifications</p>
        </div>
        <NotifRow
          id="emailNotifications"
          label="Email Notifications"
          description="Master toggle — enables all email notifications"
          checked={form.emailNotifications}
          onChange={() => toggle("emailNotifications")}
          badge="Master"
        />
        <Separator className="opacity-10" />
        <div className="space-y-4 pl-1">
          {[
            { key: "notifyBookingConfirm" as const,  label: "Booking Confirmation",  desc: "Receive confirmation when you book a session" },
            { key: "notifyNewBooking" as const,       label: "New Booking Alert",     desc: "Notify admin when a new booking is submitted" },
            { key: "notifyNewInquiry" as const,       label: "New Inquiry Alert",     desc: "Notify when a contact inquiry is received" },
            { key: "notifyProjectUpdates" as const,   label: "Project Updates",       desc: "Get notified about portfolio project changes" },
            { key: "notifyWeeklyDigest" as const,     label: "Weekly Digest",         desc: "Weekly summary of activity and analytics" },
            { key: "notifySecurityAlerts" as const,   label: "Security Alerts",       desc: "Important alerts about account activity" },
          ].map(item => (
            <NotifRow key={item.key} id={item.key} label={item.label} description={item.desc}
              checked={form[item.key]} onChange={() => toggle(item.key)}
              disabled={!form.emailNotifications && (item.key as string) !== "emailNotifications"} />
          ))}
        </div>
        <SaveButton onClick={() => onSave(form)} saving={saving} />
      </div>
    </div>
  );
}

function NotifRow({ id, label, description, checked, onChange, badge, disabled }: {
  id: string; label: string; description: string; checked: boolean;
  onChange: () => void; badge?: string; disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 ${disabled ? "opacity-40" : ""}`}>
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <Label htmlFor={`notif-${id}`} className="font-medium cursor-pointer">{label}</Label>
          {badge && <Badge variant="secondary" className="text-xs px-1.5 py-0">{badge}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={`notif-${id}`} data-testid={`switch-${id}`} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

// ── Appearance Section ────────────────────────────────────────────────────────

function AppearanceSection({ settings, onSave, saving }: { settings: UserSettingsData; onSave: (d: any) => void; saving: boolean }) {
  const [form, setForm] = useState({
    theme:            settings.theme,
    compactMode:      settings.compactMode,
    sidebarCollapsed: settings.sidebarCollapsed,
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Theme</Label>
        <div className="grid grid-cols-3 gap-3">
          {(["dark", "light", "system"] as const).map(t => (
            <button key={t} data-testid={`theme-${t}`}
              onClick={() => setForm(f => ({ ...f, theme: t }))}
              className={`p-3 rounded-lg border text-sm font-medium capitalize transition-all ${
                form.theme === t
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-white/10 text-muted-foreground hover:border-white/20"
              }`}
            >
              {t === "dark" ? "🌙" : t === "light" ? "☀️" : "💻"} {t}
            </button>
          ))}
        </div>
      </div>

      <Separator className="opacity-10" />

      <div className="space-y-4">
        <NotifRow id="compactMode" label="Compact Mode" description="Reduce padding and spacing throughout the UI"
          checked={form.compactMode} onChange={() => setForm(f => ({ ...f, compactMode: !f.compactMode }))} />
        <NotifRow id="sidebarCollapsed" label="Collapse Sidebar by Default" description="Start with the navigation sidebar collapsed"
          checked={form.sidebarCollapsed} onChange={() => setForm(f => ({ ...f, sidebarCollapsed: !f.sidebarCollapsed }))} />
      </div>

      <SaveButton onClick={() => onSave(form)} saving={saving} />
    </div>
  );
}

// ── Security Section ──────────────────────────────────────────────────────────

function SecuritySection() {
  const { toast } = useToast();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (form.newPassword !== form.confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" }); return;
    }
    if (form.newPassword.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      await apiPost("/api/settings/change-password", {
        currentPassword: form.currentPassword,
        newPassword:     form.newPassword,
      });
      toast({ title: "Password updated successfully" });
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const inputType = showPasswords ? "text" : "password";

  return (
    <div className="space-y-5">
      <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
        <p className="text-xs text-amber-400/80">
          Choose a strong password with at least 8 characters, including uppercase, lowercase, and numbers.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="currentPassword">Current Password</Label>
        <Input id="currentPassword" data-testid="input-currentPassword" type={inputType}
          value={form.currentPassword} onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))}
          className="bg-background/50" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="newPassword">New Password</Label>
        <div className="relative">
          <Input id="newPassword" data-testid="input-newPassword" type={inputType}
            value={form.newPassword} onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))}
            className="bg-background/50 pr-10" />
          <button type="button" onClick={() => setShowPasswords(!showPasswords)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Confirm New Password</Label>
        <Input id="confirmPassword" data-testid="input-confirmPassword" type={inputType}
          value={form.confirmPassword} onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
          className="bg-background/50" />
      </div>

      <SaveButton label="Update Password" onClick={handleSubmit} saving={saving} />
    </div>
  );
}

// ── Email Config Section ───────────────────────────────────────────────────────

function EmailConfigSection({ cfg, onSave, saving }: { cfg?: EmailConfigData; onSave: (d: any) => void; saving: boolean }) {
  const { toast } = useToast();
  const [form, setForm] = useState<EmailConfigData>({
    smtpHost: cfg?.smtpHost ?? "",
    smtpPort: cfg?.smtpPort ?? 587,
    smtpSecure: cfg?.smtpSecure ?? false,
    smtpUser: cfg?.smtpUser ?? "",
    smtpPassword: cfg?.smtpPassword ?? "",
    fromName: cfg?.fromName ?? "NexusConsult",
    fromEmail: cfg?.fromEmail ?? "noreply@nexusconsult.dev",
    adminEmail: cfg?.adminEmail ?? "admin@nexusconsult.dev",
    replyTo: cfg?.replyTo ?? "",
    enabled: cfg?.enabled ?? false,
    sendUserConfirmation: cfg?.sendUserConfirmation ?? true,
    sendAdminNotification: cfg?.sendAdminNotification ?? true,
    githubUrl: cfg?.githubUrl ?? "https://github.com/itkdaniel",
    linkedinUrl: cfg?.linkedinUrl ?? "https://linkedin.com/in/itkdaniel",
    websiteUrl: cfg?.websiteUrl ?? "https://nexusconsult.dev",
  });
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleTestEmail = async () => {
    if (!testEmail) { toast({ title: "Enter an email address to test", variant: "destructive" }); return; }
    setTestSending(true);
    try {
      await apiPost("/api/settings/test-email", { to: testEmail });
      toast({ title: "Test email sent!", description: `Check ${testEmail} for the test message.` });
    } catch (e: any) {
      toast({ title: "Failed to send test email", description: e.message, variant: "destructive" });
    } finally {
      setTestSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Enable toggle */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-background/50 border border-white/5">
        <div>
          <p className="font-medium text-sm">Enable Email Notifications</p>
          <p className="text-xs text-muted-foreground">Send confirmation and alert emails via SMTP</p>
        </div>
        <Switch data-testid="switch-emailEnabled" checked={form.enabled}
          onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} />
      </div>

      {/* SMTP */}
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-foreground">SMTP Server</h3>
        <p className="text-xs text-muted-foreground mb-3">Configure your outbound email server</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor="smtpHost">SMTP Host</Label>
          <Input id="smtpHost" data-testid="input-smtpHost" value={form.smtpHost}
            onChange={e => setForm(f => ({ ...f, smtpHost: e.target.value }))}
            placeholder="smtp.gmail.com" className="bg-background/50" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="smtpPort">Port</Label>
          <Input id="smtpPort" data-testid="input-smtpPort" type="number" value={form.smtpPort}
            onChange={e => setForm(f => ({ ...f, smtpPort: parseInt(e.target.value) || 587 }))}
            className="bg-background/50" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="smtpUser">SMTP Username</Label>
          <Input id="smtpUser" data-testid="input-smtpUser" value={form.smtpUser}
            onChange={e => setForm(f => ({ ...f, smtpUser: e.target.value }))}
            placeholder="you@gmail.com" className="bg-background/50" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="smtpPassword">SMTP Password</Label>
          <div className="relative">
            <Input id="smtpPassword" data-testid="input-smtpPassword"
              type={showPassword ? "text" : "password"} value={form.smtpPassword}
              onChange={e => setForm(f => ({ ...f, smtpPassword: e.target.value }))}
              placeholder="App password or SMTP secret" className="bg-background/50 pr-10" />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      <NotifRow id="smtpSecure" label="TLS/SSL (port 465)" description="Enable for secure SMTP connections on port 465"
        checked={form.smtpSecure} onChange={() => setForm(f => ({ ...f, smtpSecure: !f.smtpSecure }))} />

      <Separator className="opacity-10" />

      {/* Sender identity */}
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-foreground">Sender Identity</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="fromName">From Name</Label>
          <Input id="fromName" data-testid="input-fromName" value={form.fromName}
            onChange={e => setForm(f => ({ ...f, fromName: e.target.value }))}
            className="bg-background/50" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fromEmail">From Email</Label>
          <Input id="fromEmail" data-testid="input-fromEmail" type="email" value={form.fromEmail}
            onChange={e => setForm(f => ({ ...f, fromEmail: e.target.value }))}
            className="bg-background/50" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="adminEmail">Admin Notification Email</Label>
          <Input id="adminEmail" data-testid="input-adminEmail" type="email" value={form.adminEmail}
            onChange={e => setForm(f => ({ ...f, adminEmail: e.target.value }))}
            placeholder="admin@yourcompany.com" className="bg-background/50" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="replyTo">Reply-To</Label>
          <Input id="replyTo" data-testid="input-replyTo" type="email" value={form.replyTo ?? ""}
            onChange={e => setForm(f => ({ ...f, replyTo: e.target.value }))}
            placeholder="Same as From Email" className="bg-background/50" />
        </div>
      </div>

      <Separator className="opacity-10" />

      {/* Toggles */}
      <div className="space-y-4">
        <NotifRow id="sendUserConfirmation" label="Send User Confirmations"
          description="Email the person who submitted a booking" checked={form.sendUserConfirmation}
          onChange={() => setForm(f => ({ ...f, sendUserConfirmation: !f.sendUserConfirmation }))} />
        <NotifRow id="sendAdminNotification" label="Send Admin Notifications"
          description="Alert the admin email when a new booking arrives" checked={form.sendAdminNotification}
          onChange={() => setForm(f => ({ ...f, sendAdminNotification: !f.sendAdminNotification }))} />
      </div>

      <Separator className="opacity-10" />

      {/* Test email */}
      <div>
        <h3 className="text-sm font-medium mb-3">Send Test Email</h3>
        <div className="flex gap-2">
          <Input data-testid="input-testEmail" value={testEmail} onChange={e => setTestEmail(e.target.value)}
            placeholder="test@example.com" type="email" className="bg-background/50" />
          <Button data-testid="button-sendTestEmail" onClick={handleTestEmail} disabled={testSending} variant="outline">
            {testSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            <span className="ml-2">Send Test</span>
          </Button>
        </div>
      </div>

      <SaveButton onClick={() => onSave(form)} saving={saving} />
    </div>
  );
}

// ── Integrations Section ──────────────────────────────────────────────────────

function IntegrationsSection({ settings, onSave, saving }: { settings: UserSettingsData; onSave: (d: any) => void; saving: boolean }) {
  const [form, setForm] = useState({
    githubUrl:   settings.githubUrl   ?? "https://github.com/itkdaniel",
    linkedinUrl: settings.linkedinUrl ?? "https://linkedin.com/in/itkdaniel",
    websiteUrl:  settings.websiteUrl  ?? "",
  });

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Configure your social and external profile links. These appear in the footer, email signatures, and your public profile.
      </p>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="githubUrl" className="flex items-center gap-2">
            <Github className="w-4 h-4" /> GitHub Profile
          </Label>
          <Input id="githubUrl" data-testid="input-githubUrl" value={form.githubUrl}
            onChange={e => setForm(f => ({ ...f, githubUrl: e.target.value }))}
            placeholder="https://github.com/username" className="bg-background/50" />
          {form.githubUrl && (
            <a href={form.githubUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1">
              Open profile <ChevronRight className="w-3 h-3" />
            </a>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="linkedinUrl" className="flex items-center gap-2">
            <Linkedin className="w-4 h-4" /> LinkedIn Profile
          </Label>
          <Input id="linkedinUrl" data-testid="input-linkedinUrl" value={form.linkedinUrl}
            onChange={e => setForm(f => ({ ...f, linkedinUrl: e.target.value }))}
            placeholder="https://linkedin.com/in/username" className="bg-background/50" />
          {form.linkedinUrl && (
            <a href={form.linkedinUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1">
              Open profile <ChevronRight className="w-3 h-3" />
            </a>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="websiteUrl" className="flex items-center gap-2">
            <Globe className="w-4 h-4" /> Website
          </Label>
          <Input id="websiteUrl" data-testid="input-websiteUrl" value={form.websiteUrl}
            onChange={e => setForm(f => ({ ...f, websiteUrl: e.target.value }))}
            placeholder="https://yourwebsite.com" className="bg-background/50" />
        </div>
      </div>

      <SaveButton onClick={() => onSave(form)} saving={saving} />
    </div>
  );
}

// ── Shared Save Button ────────────────────────────────────────────────────────

function SaveButton({ onClick, saving, label = "Save Changes" }: { onClick: () => void; saving: boolean; label?: string }) {
  return (
    <div className="pt-2">
      <Button data-testid="button-saveSettings" onClick={onClick} disabled={saving}
        className="shadow-[0_0_15px_rgba(59,130,246,0.2)]">
        {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        {saving ? "Saving…" : label}
      </Button>
    </div>
  );
}
