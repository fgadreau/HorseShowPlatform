import { useEffect, type RefObject } from "react";

/** Keep fixed overlays inside the visible area during pinch zoom and keyboard use. */
export function useVisualViewportBounds(ref: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    const viewport = window.visualViewport;
    const element = ref.current;
    if (!active || !viewport || !element) return;
    const previous = element.getAttribute("style");
    const update = () => Object.assign(element.style, {
      inset: "auto", left: `${viewport.offsetLeft}px`, top: `${viewport.offsetTop}px`,
      width: `${viewport.width}px`, height: `${viewport.height}px`,
    });
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      if (previous === null) element.removeAttribute("style");
      else element.setAttribute("style", previous);
    };
  }, [ref, active]);
}
