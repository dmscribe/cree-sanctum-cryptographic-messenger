import { generateDeviceKey } from "./crypto.ts";
import { createIdentity, signBinding } from "./pgp.ts";
import { loadSeat, saveSeat, type SeatVault } from "./vault.ts";
import { publishKeys } from "@/lib/server/profile";

export async function ensureLocalSeat(
  seatId: string,
  displayName: string,
): Promise<SeatVault> {
  const existing = await loadSeat(seatId);
  if (existing) return existing;
  const device = await generateDeviceKey();
  const identity = createIdentity(displayName);
  const binding = signBinding(identity.secretKeyHex, seatId, device.publicJwk, device.createdAt);
  const seat: SeatVault = { seatId, displayName, device, identity };
  await saveSeat(seat);
  await publishKeys({
    data: {
      seatId: seatId,
      sanctum_public_key: device.publicJwk,
      openpgp_public_key: identity.publicKeyArmored,
      fingerprint: identity.fingerprint,
      device_binding_payload: binding.payload,
      device_binding_signature: binding.signature,
    },
  });
  return seat;
}

export async function republishSeat(seat: SeatVault): Promise<void> {
  const binding = signBinding(
    seat.identity.secretKeyHex,
    seat.seatId,
    seat.device.publicJwk,
    seat.device.createdAt,
  );
  await publishKeys({
    data: {
      seatId: seat.seatId,
      sanctum_public_key: seat.device.publicJwk,
      openpgp_public_key: seat.identity.publicKeyArmored,
      fingerprint: seat.identity.fingerprint,
      device_binding_payload: binding.payload,
      device_binding_signature: binding.signature,
    },
  });
}

export function downloadBlob(filename: string, text: string, type = "application/json"): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1500);
}

/** Phone-safe handoff: share sheet (file, then text), then download. Never throws. */
export async function offerKeyFile(filename: string, text: string): Promise<"shared" | "downloaded"> {
  const blob = new Blob([text], { type: "application/json" });
  const file = new File([blob], filename, { type: "application/json" });
  const nav = typeof navigator !== "undefined" ? navigator : null;
  if (nav && typeof nav.share === "function") {
    try {
      const filesOk = !nav.canShare || nav.canShare({ files: [file] });
      if (filesOk) {
        await nav.share({ files: [file], title: filename, text: "Cree Sanctum throwaway key" });
        return "shared";
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "shared";
    }
    try {
      await nav.share({ title: filename, text });
      return "shared";
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "shared";
    }
  }
  downloadBlob(filename, text);
  return "downloaded";
}
