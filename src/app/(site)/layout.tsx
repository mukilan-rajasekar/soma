import SiteHeader from "@/components/site/SiteHeader";
import SiteFooter from "@/components/site/SiteFooter";

// Route-group scroll wrapper. globals.css forces `overflow: hidden` on html/body for the
// fixed hero, so every content route gets its own scroll container: a `fixed inset-0
// overflow-y-auto` main. The (site) group does not change the URL — /science, /compare,
// /faq, /pitch all live directly at the root. Shared header + footer wrap every page.
export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="fixed inset-0 overflow-y-auto bg-paper text-ink">
      <SiteHeader />
      {children}
      <SiteFooter />
    </main>
  );
}
