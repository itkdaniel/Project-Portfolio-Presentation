import { Link } from "wouter";
import { Cpu, Github, Linkedin } from "lucide-react";

const GITHUB_URL   = "https://github.com/itkdaniel";
const LINKEDIN_URL = "https://linkedin.com/in/itkdaniel";

export function Footer() {
  return (
    <footer className="bg-card/30 border-t border-white/5 pt-16 pb-8">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                <Cpu className="text-primary w-4 h-4" />
              </div>
              <span className="font-display font-bold text-lg tracking-tight">Nexus<span className="text-primary">Consult</span></span>
            </div>
            <p className="text-muted-foreground mb-6 max-w-sm">
              Designing scalable microservice architectures, robust CRUD APIs, and end-to-end automation solutions for forward-thinking enterprises.
            </p>
            <div className="flex items-center gap-4">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                data-testid="footer-github"
                className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors border border-white/5"
              >
                <Github className="w-4 h-4" />
              </a>
              <a
                href={LINKEDIN_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                data-testid="footer-linkedin"
                className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors border border-white/5"
              >
                <Linkedin className="w-4 h-4" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-4 text-foreground">Infrastructure</h4>
            <ul className="space-y-3">
              <li><Link href="/status" className="text-sm text-muted-foreground hover:text-primary transition-colors">Microservices</Link></li>
              <li><Link href="/architecture" className="text-sm text-muted-foreground hover:text-primary transition-colors">Database Design</Link></li>
              <li><Link href="/architecture#infrastructure" className="text-sm text-muted-foreground hover:text-primary transition-colors">Docker Containers</Link></li>
              <li><Link href="/architecture#infrastructure" className="text-sm text-muted-foreground hover:text-primary transition-colors">CI/CD Pipelines</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-4 text-foreground">Client Portal</h4>
            <ul className="space-y-3">
              <li><Link href="/status" className="text-sm text-muted-foreground hover:text-primary transition-colors">Project Dashboard</Link></li>
              <li><Link href="/settings" className="text-sm text-muted-foreground hover:text-primary transition-colors">API Keys</Link></li>
              <li><Link href="/status" className="text-sm text-muted-foreground hover:text-primary transition-colors">Usage Analytics</Link></li>
              <li><Link href="/settings" className="text-sm text-muted-foreground hover:text-primary transition-colors">Settings</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Nexus Consulting. All rights reserved.
          </p>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]"></span>
            <span className="text-xs font-mono text-muted-foreground">System Status: All services operational</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
