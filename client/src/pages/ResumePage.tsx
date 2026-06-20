import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Download, Printer, Edit3, Save, X, Upload,
  Monitor, File, RefreshCw, ArrowLeft, Plus, Trash2,
  Mail, Phone, MapPin, Briefcase
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ResumeSection { title: string; content: string; }
interface ResumeData {
  id: number;
  userId: string;
  sections: ResumeSection[];
  fileUrl?: string;
  fileName?: string;
  fileContentType?: string;
  activeView: "digital" | "file";
  updatedAt: string;
}
interface UserProfile {
  id: string;
  username: string;
  email: string;
  fullName?: string;
  position?: string;
  mobile?: string;
  location?: string;
  bio?: string;
  profilePictureUrl?: string;
}

// ── API helpers ───────────────────────────────────────────────────────────────

function getToken() { return localStorage.getItem("nexus_token"); }

async function apiGet(url: string) {
  const res = await fetch(url, { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function apiPatch(url: string, body: object) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ResumePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editSections, setEditSections] = useState<ResumeSection[]>([]);
  const [uploading, setUploading] = useState(false);

  const isAuthenticated = !!getToken();

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/auth/me"],
    queryFn: () => apiGet("/api/auth/me"),
    enabled: isAuthenticated,
    retry: false,
  });

  const { data: resume, isLoading } = useQuery<ResumeData>({
    queryKey: ["/api/resume"],
    queryFn: () => apiGet("/api/resume"),
    enabled: isAuthenticated,
    retry: false,
  });

  const patchResume = useMutation({
    mutationFn: (data: Partial<ResumeData>) => apiPatch("/api/resume", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/resume"] });
      setIsEditing(false);
      toast({ title: "Resumé saved" });
    },
    onError: (e: Error) => toast({ title: "Error saving", description: e.message, variant: "destructive" }),
  });

  const switchView = useMutation({
    mutationFn: (view: "digital" | "file") => apiPatch("/api/resume", { activeView: view }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/resume"] }),
  });

  function startEdit() {
    setEditSections(resume?.sections ? [...resume.sections.map(s => ({ ...s }))] : []);
    setIsEditing(true);
  }

  function saveEdit() {
    patchResume.mutate({ sections: editSections });
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditSections([]);
  }

  function addSection() {
    setEditSections(s => [...s, { title: "New Section", content: "" }]);
  }

  function removeSection(i: number) {
    setEditSections(s => s.filter((_, idx) => idx !== i));
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/resume/upload", {
        method: "POST",
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      qc.invalidateQueries({ queryKey: ["/api/resume"] });
      toast({ title: "File uploaded", description: file.name });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handlePrint() { window.print(); }

  function handleDownload() {
    if (resume?.fileUrl) {
      const a = document.createElement("a");
      a.href = resume.fileUrl;
      a.download = resume.fileName ?? "resume";
      a.click();
    } else {
      window.print();
    }
  }

  const displayName = profile?.fullName || profile?.username || "Your Name";
  const initials = displayName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      {/* Print styles — hide everything except resume content when printing */}
      <style>{`
        @media print {
          nav, footer, .no-print { display: none !important; }
          .print-area { box-shadow: none !important; border: none !important; }
          body { background: white !important; color: black !important; }
        }
      `}</style>

      <main className="flex-1 container mx-auto px-4 md:px-6 py-24">
        {/* Back link */}
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 no-print">
          <ArrowLeft className="w-4 h-4" /> Back to home
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 no-print">
          <div>
            <h1 className="text-3xl font-display font-bold" data-testid="resume-title">Resumé</h1>
            <p className="text-muted-foreground text-sm mt-1">Your professional profile and work history</p>
          </div>

          {isAuthenticated && (
            <div className="flex items-center gap-2 flex-wrap">
              {/* View toggle */}
              {resume?.fileUrl && (
                <div className="flex rounded-lg overflow-hidden border border-white/10">
                  <button
                    data-testid="btn-view-digital"
                    onClick={() => switchView.mutate("digital")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${resume.activeView === "digital" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}>
                    <Monitor className="w-3.5 h-3.5" /> Digital
                  </button>
                  <button
                    data-testid="btn-view-file"
                    onClick={() => switchView.mutate("file")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${resume.activeView === "file" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}>
                    <File className="w-3.5 h-3.5" /> File
                  </button>
                </div>
              )}

              {/* Upload */}
              <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" onChange={handleFileUpload} className="hidden" data-testid="input-resume-file" />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="no-print" data-testid="btn-upload-resume">
                {uploading ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
                {resume?.fileName ? "Replace file" : "Upload file"}
              </Button>

              {/* Edit (digital view only) */}
              {(!resume?.fileUrl || resume.activeView === "digital") && !isEditing && (
                <Button variant="outline" size="sm" onClick={startEdit} className="no-print" data-testid="btn-edit-resume">
                  <Edit3 className="w-4 h-4 mr-1.5" /> Edit
                </Button>
              )}

              <Button variant="outline" size="sm" onClick={handlePrint} className="no-print" data-testid="btn-print-resume">
                <Printer className="w-4 h-4 mr-1.5" /> Print
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload} className="no-print" data-testid="btn-download-resume">
                <Download className="w-4 h-4 mr-1.5" /> Download
              </Button>
            </div>
          )}
        </div>

        {/* Guest prompt */}
        {!isAuthenticated && (
          <div className="glass-panel rounded-xl border border-white/5 p-6 mb-6 text-center no-print">
            <p className="text-muted-foreground text-sm">
              <Link href="/login" className="text-primary hover:underline">Sign in</Link> or{" "}
              <Link href="/register" className="text-primary hover:underline">create an account</Link> to edit your resumé and upload files.
            </p>
          </div>
        )}

        {isLoading && isAuthenticated ? (
          <div className="flex items-center gap-2 text-muted-foreground"><RefreshCw className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : (
          <>
            {/* Edit mode toolbar */}
            {isEditing && (
              <div className="flex items-center gap-2 mb-4 no-print">
                <Button size="sm" onClick={saveEdit} disabled={patchResume.isPending} data-testid="btn-save-resume">
                  {patchResume.isPending ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={cancelEdit} data-testid="btn-cancel-edit">
                  <X className="w-4 h-4 mr-1.5" /> Cancel
                </Button>
                <Button size="sm" variant="ghost" onClick={addSection} data-testid="btn-add-section">
                  <Plus className="w-4 h-4 mr-1.5" /> Add section
                </Button>
              </div>
            )}

            {/* FILE VIEW */}
            {resume?.activeView === "file" && resume.fileUrl ? (
              <div className="glass-panel rounded-xl border border-white/5 overflow-hidden print-area" style={{ minHeight: 600 }}>
                {resume.fileContentType === "application/pdf" ? (
                  <iframe
                    src={resume.fileUrl}
                    title={resume.fileName}
                    className="w-full"
                    style={{ height: "80vh", border: "none" }}
                    data-testid="resume-file-iframe"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 gap-4">
                    <FileText className="w-12 h-12 text-muted-foreground" />
                    <p className="text-muted-foreground">{resume.fileName}</p>
                    <Button onClick={handleDownload} data-testid="btn-download-file">
                      <Download className="w-4 h-4 mr-2" /> Download to view
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              /* DIGITAL VIEW */
              <div className="glass-panel rounded-xl border border-white/5 p-8 md:p-12 print-area">
                {/* Profile header */}
                <div className="flex items-start gap-6 mb-8 pb-8 border-b border-white/10">
                  {profile?.profilePictureUrl ? (
                    <img src={profile.profilePictureUrl} alt={displayName}
                      className="w-20 h-20 rounded-full object-cover border-2 border-primary/20 shrink-0" />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center shrink-0">
                      <span className="text-2xl font-bold text-primary">{initials}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-3xl font-display font-bold" data-testid="resume-name">{displayName}</h2>
                    {profile?.position && (
                      <p className="text-primary text-lg font-medium mt-1" data-testid="resume-position">
                        <Briefcase className="w-4 h-4 inline mr-1.5" />{profile.position}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm text-muted-foreground">
                      {profile?.email && (
                        <span data-testid="resume-email"><Mail className="w-3.5 h-3.5 inline mr-1" />{profile.email}</span>
                      )}
                      {profile?.mobile && (
                        <span data-testid="resume-mobile"><Phone className="w-3.5 h-3.5 inline mr-1" />{profile.mobile}</span>
                      )}
                      {profile?.location && (
                        <span data-testid="resume-location"><MapPin className="w-3.5 h-3.5 inline mr-1" />{profile.location}</span>
                      )}
                    </div>
                    {profile?.bio && (
                      <p className="mt-3 text-sm text-muted-foreground leading-relaxed" data-testid="resume-bio">{profile.bio}</p>
                    )}
                  </div>
                </div>

                {/* Sections */}
                {isEditing ? (
                  <div className="space-y-6">
                    {editSections.map((section, i) => (
                      <div key={i} className="space-y-2" data-testid={`edit-section-${i}`}>
                        <div className="flex items-center gap-2">
                          <input
                            className="flex-1 bg-background/50 border border-white/10 rounded-md px-3 py-1.5 text-sm font-semibold focus:outline-none focus:border-primary/50"
                            value={section.title}
                            onChange={e => setEditSections(s => s.map((sec, idx) => idx === i ? { ...sec, title: e.target.value } : sec))}
                            data-testid={`input-section-title-${i}`}
                          />
                          <button onClick={() => removeSection(i)} className="text-muted-foreground hover:text-red-400 transition-colors" data-testid={`btn-remove-section-${i}`}>
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <Textarea
                          value={section.content}
                          onChange={e => setEditSections(s => s.map((sec, idx) => idx === i ? { ...sec, content: e.target.value } : sec))}
                          placeholder={`${section.title} details…`}
                          rows={4}
                          className="bg-background/50 resize-none"
                          data-testid={`input-section-content-${i}`}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-8">
                    {(resume?.sections as ResumeSection[] ?? []).map((section, i) => (
                      section.content ? (
                        <div key={i} data-testid={`resume-section-${i}`}>
                          <h3 className="text-lg font-display font-semibold mb-3 pb-1 border-b border-white/10">{section.title}</h3>
                          <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{section.content}</p>
                        </div>
                      ) : (
                        <div key={i} data-testid={`resume-section-empty-${i}`} className="no-print">
                          <h3 className="text-lg font-display font-semibold mb-2 pb-1 border-b border-white/10 text-muted-foreground/60">{section.title}</h3>
                          <p className="text-sm text-muted-foreground/40 italic">No content yet — click Edit to add.</p>
                        </div>
                      )
                    ))}
                    {(!resume?.sections || (resume.sections as ResumeSection[]).length === 0) && (
                      <p className="text-muted-foreground text-center py-8">
                        {isAuthenticated ? "No sections yet. Click Edit to get started." : "Sign in to view and edit your resumé."}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
