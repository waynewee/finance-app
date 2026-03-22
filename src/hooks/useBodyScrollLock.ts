import { useEffect } from "react";

let activeLocks = 0;
let lockedScrollY = 0;

function lockBodyScroll() {
  if (typeof window === "undefined") {
    return;
  }

  if (activeLocks === 0) {
    lockedScrollY = window.scrollY;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${lockedScrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
  }

  activeLocks += 1;
}

function unlockBodyScroll() {
  if (typeof window === "undefined" || activeLocks === 0) {
    return;
  }

  activeLocks -= 1;

  if (activeLocks > 0) {
    return;
  }

  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";

  window.scrollTo({ top: lockedScrollY, left: 0, behavior: "auto" });
}

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) {
      return;
    }

    lockBodyScroll();

    return () => {
      unlockBodyScroll();
    };
  }, [locked]);
}
