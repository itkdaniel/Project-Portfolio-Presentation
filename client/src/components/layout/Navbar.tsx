import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Terminal, Menu, X, Cpu, Calendar } from "lucide-react";

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location] = useLocation();

  // Add scroll listener in a real app, mock it here for simplicity
  if (typeof window !== "undefined") {
    window.addEventListener("scroll", () => {
      setIsScrolled(window.scrollY > 20);
    });
  }

  const isHome = location === "/";

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
          {isHome ? (
            <>
              <a href="#services" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Architecture</a>
              <a href="#portfolio" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Deployments</a>
            </>
          ) : (
            <>
              <Link href="/"><a className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Home</a></Link>
            </>
          )}
          <a href="#" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">API Docs</a>
          <Button className="rounded-full px-6 font-medium bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20" variant="outline">
            Client Portal
          </Button>
          <Link href="/book">
            <Button className="rounded-full px-6 font-medium shadow-[0_0_15px_rgba(59,130,246,0.3)]">
              <Calendar className="w-4 h-4 mr-2" />
              Book Session
            </Button>
          </Link>
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
          {isHome ? (
            <>
              <a href="#services" className="p-2 text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>Architecture</a>
              <a href="#portfolio" className="p-2 text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>Deployments</a>
            </>
          ) : (
             <Link href="/"><a className="p-2 text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>Home</a></Link>
          )}
          <a href="#" className="p-2 text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>API Docs</a>
          <Button className="w-full justify-start mt-2" variant="outline">Client Portal</Button>
          <Link href="/book" onClick={() => setMobileMenuOpen(false)}>
            <Button className="w-full justify-start mt-2">
              <Calendar className="w-4 h-4 mr-2" />
              Book Session
            </Button>
          </Link>
        </div>
      )}
    </nav>
  );
}