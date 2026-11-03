"use client";

import { useEffect } from "react";
import { postToParent } from "./browser";

/** In an embed (<claritia-book>, ?embed=1): tells the page around it the card's height, so the frame fits. */
export function EmbedHeight() {
  useEffect(() => {
    let last = 0;
    const send = () => {
      const h = Math.ceil(document.querySelector(".cb-page")?.getBoundingClientRect().height ?? document.documentElement.scrollHeight);
      if (h !== last) {
        last = h;
        postToParent({ type: "book:height", height: h });
      }
    };
    send();
    const ro = new ResizeObserver(send);
    const el = document.querySelector(".cb-page");
    if (el) ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return null;
}
