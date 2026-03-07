import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Terminal, Menu, X, Cpu } from "lucide-react";

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Add scroll listener in a real app, mock it here for simplicity
  if (typeof window !== "undefined") {
    window.addEventListener("scroll", () => {
      setIsScrolled(window.scrollY > 20);
    });
  }

  return (
    <nav 
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        isScrolled ? "bg-background/80 backdrop-blur-md border-b border-white/5 py-3" : "bg-transparent py-5"
      }`}
    >
      <div className="container mx-auto px-4 md:px-6 flex items-center justify-between">
        <Link href="/">
          <a className="flex items-center gap-2 group cursor-pointer">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:border-primary/50 transition-colors">
              <Cpu className="text-primary w-5 h-5" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight">Nexus<span className="text-primary">Consult</span></span>
          </a>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          <Link href="#services"><a className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Architecture</a></Link>
          <Link href="#portfolio"><a className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Deployments</a></Link>
          <Link href="#docs"><a className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">API Docs</a></Link>
          <Button className="rounded-full px-6 font-medium bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20" variant="outline">
            Client Portal
          </Button>
          <Button className="rounded-full px-6 font-medium shadow-[0_0_15px_rgba(59,130,246,0.3)]">
            <Terminal className="w-4 h-4 mr-2" />
            Initialize Project
          </Button>
        </div>

        {/* Mobile Toggle */}
        <button 
          className="md:hidden text-foreground"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-card border-b border-border p-4 flex flex-col gap-4 shadow-xl">
          <Link href="#services"><a className="p-2 text-sm font-medium text-muted-foreground hover:text-foreground">Architecture</a></Link>
          <Link href="#portfolio"><a className="p-2 text-sm font-medium text-muted-foreground hover:text-foreground">Deployments</a></Link>
          <Link href="#docs"><a className="p-2 text-sm font-medium text-muted-foreground hover:text-foreground">API Docs</a></Link>
          <Button className="w-full justify-start mt-2" variant="outline">Client Portal</Button>
          <Button className="w-full justify-start">Initialize Project</Button>
        </div>
      )}
    </nav>
  );
}