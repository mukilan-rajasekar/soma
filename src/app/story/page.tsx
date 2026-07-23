import type { Metadata } from "next";

// Orphaned standalone route — like /demo, this segment renders its own full-viewport
// experience and is NOT wired into the site nav. The animated result walkthrough is a
// self-contained page served from /public (its own rAF loop + IntersectionObserver run
// in an isolated document, so it can't collide with the app's global overflow:hidden or
// design tokens). We embed it full-screen; a direct link reaches it.
export const metadata: Metadata = {
  title: "soma — live result walkthrough",
  description:
    "An animated walkthrough of a real Compare-Your-Cuts run: the attention arc draws itself, the weak spot flares, five cuts race into a ranking, and the cortical profile lights up — attention and language strong, the emotion cortex dark.",
};

export default function StoryPage() {
  return (
    <iframe
      src="/story.html"
      title="Soma — live result walkthrough"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: 0 }}
    />
  );
}
