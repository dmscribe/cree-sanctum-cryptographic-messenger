import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Portraits only accept in-app image data URLs or same-origin paths. */
export function safePhotoSrc(src?: string | null): string | null {
  if (!src) return null;
  if (/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(src)) return src;
  if (src.startsWith("/") && !src.startsWith("//") && !src.includes("\\")) return src;
  return null;
}
