import { CONSERVATIVE_LINK_HOSTS } from "./protocol.ts";

export function extractUrls(text: string): string[] {
  return text.match(/https?:\/\/[^\s]+/g) ?? [];
}

export function validateLink(url: string): { allowed: boolean; reason: string; host: string } {
  try {
    const parsed = new URL(url.trim());
    const host = (parsed.hostname || "").toLowerCase();
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { allowed: false, reason: "invalid_scheme", host };
    }
    if (!host) return { allowed: false, reason: "no_host", host: "" };
    if ((parsed.username || parsed.password) && url.includes("@")) {
      return { allowed: false, reason: "spoofed_userinfo", host };
    }
    if (host.startsWith("xn--") || host.includes(".xn--")) {
      return { allowed: false, reason: "punycode_blocked", host };
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
      return { allowed: false, reason: "raw_ip_blocked", host };
    }
    for (const domain of CONSERVATIVE_LINK_HOSTS) {
      if (host === domain || host.endsWith("." + domain)) {
        return { allowed: true, reason: "whitelisted", host };
      }
    }
    return { allowed: false, reason: "domain_not_whitelisted", host };
  } catch {
    return { allowed: false, reason: "unparseable_url", host: "" };
  }
}
