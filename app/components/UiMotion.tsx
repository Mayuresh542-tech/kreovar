"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
const AppMotionConfig=dynamic(()=>import("./AppMotionConfig"));
const lightweightPages=new Set(["/","/faq","/ai-video-editor","/ai-voiceover","/caption-generator","/terms","/privacy","/refund"]);

// Enhance existing elements without adding layout wrappers or changing their styles.
const targets = [
  "[data-vx-motion]",
  "main h1", "main h2", "main section", "main article", "main form", "main details",
  'main [role="tabpanel"]',
  'main .grid > :is(div,a,button,article)[class*="rounded"]',
  'main [class*="space-y-"] > [class*="rounded"][class*="border"]',
  'dialog[open]', '[role="dialog"]',
  '[class~="fixed"][class~="inset-0"] > [class*="rounded"]',
].join(",");
const ease = "cubic-bezier(0.16, 1, 0.3, 1)";

export default function UiMotion({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    // Timeline updates own their motion; avoid observing the editor DOM.
    if (pathname.startsWith("/editor")) return;
    if (!window.IntersectionObserver || !window.MutationObserver || !Element.prototype.animate) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let seen = new WeakSet<HTMLElement>();
    let registered = new WeakSet<HTMLElement>();
    const animations = new Map<HTMLElement, Animation>();
    const pending = new Set<HTMLElement>();
    let frame = 0;

    function reveal(element: HTMLElement) {
      if (preference.matches || !element.isConnected) return;
      // Framer Motion and editor gestures retain ownership of their transforms.
      if (element.style.transform || element.style.opacity || element.getAnimations().length) return;
      const direction = element.dataset.vxMotion || "up";
      const offset = direction === "left" ? "-20px 0" : direction === "right" ? "20px 0" : direction === "down" ? "0 -14px" : "0 18px";
      const opacity = getComputedStyle(element).opacity;
      const siblings=element.parentElement?Array.from(element.parentElement.children):[];
      const delay=Math.min(4,Math.max(0,siblings.indexOf(element)))*35;
      const heading=element.tagName==="H1"||element.tagName==="H2"||!!element.querySelector("h1");
      const animation = element.animate(
        [{ opacity: heading?opacity:0, translate: offset }, { opacity, translate: "0 0" }],
        { duration: 420, delay, easing: ease, fill: "backwards" },
      );
      animations.set(element, animation);
      const release = () => { if (animations.get(element) === animation) animations.delete(element); };
      animation.onfinish = release;
      animation.oncancel = release;
    }

    const viewport = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const element = entry.target as HTMLElement;
        viewport.unobserve(element);
        reveal(element);
      }
    }, { threshold: 0.06 });

    function register(element: HTMLElement) {
      if (seen.has(element)) return;
      seen.add(element);
      // One entrance per container; nested headings and cards stay immediately visible.
      if (!element.dataset.vxMotion) {
        for (let parent=element.parentElement;parent;parent=parent.parentElement) {
          if (registered.has(parent) && !element.matches('.grid > [class*="rounded"]')) return;
        }
      }
      if (preference.matches || element.dataset.vxMotion === "off") return;
      if (element.closest('[data-vx-motion="off"], [aria-hidden="true"]')) return;
      if (!element.dataset.vxMotion && element.closest(".vx-editor, .vx-stage, .vx-timeline, .vx-preview, .vx-inspector, .vx-library")) return;
      if (element.style.transform || element.style.opacity) return;
      if (element.parentElement?.closest('[style*="transform"], [style*="opacity"]')) return;
      // Moving a container with fixed/sticky descendants changes their containing block.
      // Also avoid applying a second entry effect around existing Framer animations.
      if (element.querySelector('.fixed, .sticky, dialog, [role="dialog"], [style*="transform"], [style*="opacity"]')) return;
      registered.add(element);
      if (element.matches('dialog[open], [role="dialog"]')) reveal(element);
      else viewport.observe(element);
    }

    function scan(root: HTMLElement) {
      if (root.matches(targets)) register(root);
      root.querySelectorAll<HTMLElement>(targets).forEach(register);
    }

    const updates = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === "attributes") pending.add(record.target as HTMLElement);
        for (const node of record.addedNodes) if (node instanceof HTMLElement) pending.add(node);
        for (const node of record.removedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          viewport.unobserve(node);
          node.querySelectorAll<HTMLElement>(targets).forEach(element => viewport.unobserve(element));
          for (const [element, animation] of animations) {
            if (node === element || node.contains(element)) animation.cancel();
          }
        }
      }
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        for (const root of pending) {
          if (!root.isConnected) continue;
          let redundant=false;
          for(let parent=root.parentElement;parent;parent=parent.parentElement)if(pending.has(parent)){redundant=true;break;}
          if(!redundant) scan(root);
        }
        pending.clear();
      });
    });

    const respectPreference = () => {
      if (preference.matches) {
        viewport.disconnect();
        for (const animation of animations.values()) animation.cancel();
        animations.clear();
      } else {
        seen=new WeakSet<HTMLElement>();registered=new WeakSet<HTMLElement>();scan(document.body);
      }
    };
    scan(document.body);
    updates.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
    preference.addEventListener("change", respectPreference);
    return () => {
      viewport.disconnect(); updates.disconnect(); cancelAnimationFrame(frame);
      preference.removeEventListener("change", respectPreference);
      for (const animation of animations.values()) animation.cancel();
      animations.clear(); pending.clear();
    };
  }, [pathname]);

  return lightweightPages.has(pathname)?children:<AppMotionConfig>{children}</AppMotionConfig>;
}
