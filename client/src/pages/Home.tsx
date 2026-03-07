import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/sections/Hero";
import { ProjectShowcase } from "@/components/sections/ProjectShowcase";
import { Services } from "@/components/sections/Services";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <Services />
        <ProjectShowcase />
      </main>
      <Footer />
    </div>
  );
}