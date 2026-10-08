/**
 * Device-local vault. Secret keys never leave this origin except as a
 * passphrase-wrapped backup file the operator downloads.
 *
 * IndexedDB is preferred. Phones (Safari private / partitioned preview iframe)
 * often refuse IDB — fall back to memory for seat secrets and localStorage
 * only for non-secret trust/meta records, so throwaway key generation still
 * finishes without stringifying private keys into persistent storage.
 */
import type { SanctumPublicJwk, TrustState } from "./protocol.ts";
import type { PgpSecretIdentity } from "./pgp.ts";

const DB = "cree-sanctum-v1";
const VERSION = 1;
const LS_PREFIX = "cree-sanctum-vault:";

export type DeviceRecord = {
  publicJwk: SanctumPublicJwk;
  privateJwk: JsonWebKey;
  createdAt: string;
};

export type SeatVault = {
  seatId: string;
  displayName: string;
  device: DeviceRecord;
  identity: PgpSecretIdentity;
};

export type TrustRecord = {
  peerId: string;
  fingerprint: string;
  bindingPayload: string;
  state: TrustState;
  verifiedAt?: string;
};

type StoreName = "seats" | "trust" | "meta";

const mem: Record<StoreName, Map<string, unknown>> = {
  seats: new Map(),
  trust: new Map(),
  meta: new Map(),
};

let idbDisabled = typeof indexedDB === "undefined";

function lsKey(store: StoreName, key: string): string {
  return `${LS_PREFIX}${store}:${key}`;
}

function diskPut(store: StoreName, key: string, value: unknown): void {
  mem[store].set(key, value);
  if (store === "seats" || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(lsKey(store, key), JSON.stringify(value));
  } catch {
    /* quota / private */
  }
}

function diskGet<T>(store: StoreName, key: string): T | undefined {
  if (mem[store].has(key)) return mem[store].get(key) as T;
  if (store === "seats" || typeof localStorage === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(lsKey(store, key));
    if (!raw) return undefined;
    const v = JSON.parse(raw) as T;
    mem[store].set(key, v);
    return v;
  } catch {
    return undefined;
  }
}

function diskDelete(store: StoreName, key: string): void {
  mem[store].delete(key);
  if (store === "seats" || typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(lsKey(store, key));
  } catch {
    /* */
  }
}

function diskAll<T>(store: StoreName): T[] {
  const found = new Map<string, T>();
  if (store !== "seats" && typeof localStorage !== "undefined") {
    try {
      const prefix = `${LS_PREFIX}${store}:`;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k?.startsWith(prefix)) continue;
        const id = k.slice(prefix.length);
        try {
          found.set(id, JSON.parse(localStorage.getItem(k) || "") as T);
        } catch {
          /* skip */
        }
      }
    } catch {
      /* */
    }
  }
  for (const [id, v] of mem[store]) found.set(id, v as T);
  return [...found.values()];
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (idbDisabled) {
      reject(new Error("idb-off"));
      return;
    }
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("seats")) db.createObjectStore("seats", { keyPath: "seatId" });
      if (!db.objectStoreNames.contains("trust")) db.createObjectStore("trust", { keyPath: "peerId" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      idbDisabled = true;
      reject(req.error);
    };
  });
}

async function withStore<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const st = tx.objectStore(store);
    const req = fn(st);
    tx.oncomplete = () => resolve((req as IDBRequest<T> | undefined)?.result as T);
    tx.onerror = () => reject(tx.error);
    if (req && "onsuccess" in req) {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }
  });
}

export async function saveSeat(seat: SeatVault): Promise<void> {
  try {
    await withStore("seats", "readwrite", (s) => s.put(seat));
  } catch {
    diskPut("seats", seat.seatId, seat);
  }
}

export async function loadSeat(seatId: string): Promise<SeatVault | undefined> {
  try {
    const v = await withStore<SeatVault | undefined>("seats", "readonly", (s) => s.get(seatId));
    if (v) return v;
  } catch {
    /* fall through */
  }
  return diskGet<SeatVault>("seats", seatId);
}

export async function listSeats(): Promise<SeatVault[]> {
  let idb: SeatVault[] = [];
  try {
    idb = (await withStore<SeatVault[]>("seats", "readonly", (s) => s.getAll())) ?? [];
  } catch {
    /* */
  }
  const extra = diskAll<SeatVault>("seats");
  if (!extra.length) return idb;
  const map = new Map<string, SeatVault>();
  for (const s of idb) map.set(s.seatId, s);
  for (const s of extra) map.set(s.seatId, s);
  return [...map.values()];
}

export async function deleteSeat(seatId: string): Promise<void> {
  try {
    await withStore("seats", "readwrite", (s) => s.delete(seatId));
  } catch {
    /* */
  }
  diskDelete("seats", seatId);
}

export async function saveTrust(rec: TrustRecord): Promise<void> {
  try {
    await withStore("trust", "readwrite", (s) => s.put(rec));
  } catch {
    diskPut("trust", rec.peerId, rec);
  }
}

export async function loadTrust(peerId: string): Promise<TrustRecord | undefined> {
  try {
    const v = await withStore<TrustRecord | undefined>("trust", "readonly", (s) => s.get(peerId));
    if (v) return v;
  } catch {
    /* */
  }
  return diskGet<TrustRecord>("trust", peerId);
}

export async function listTrust(): Promise<TrustRecord[]> {
  let idb: TrustRecord[] = [];
  try {
    idb = (await withStore<TrustRecord[]>("trust", "readonly", (s) => s.getAll())) ?? [];
  } catch {
    /* */
  }
  const extra = diskAll<TrustRecord>("trust");
  if (!extra.length) return idb;
  const map = new Map<string, TrustRecord>();
  for (const s of idb) map.set(s.peerId, s);
  for (const s of extra) map.set(s.peerId, s);
  return [...map.values()];
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("meta", "readwrite");
      tx.objectStore("meta").put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    diskPut("meta", key, value);
  }
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  try {
    const db = await openDb();
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction("meta", "readonly");
      const req = tx.objectStore("meta").get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return diskGet<T>("meta", key);
  }
}

export function wrapDeviceBackup(device: DeviceRecord, passphrase: string): string {
  return JSON.stringify({
    format: "sanctum-device-key-v1",
    warning: "This file contains your device private key. Keep the passphrase.",
    passphraseHint: passphrase.length,
    createdAt: device.createdAt,
    publicJwk: device.publicJwk,
    // AES-GCM wrap happens in wrapDeviceBackupAes — callers should use that.
  });
}
