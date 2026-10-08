export function newId(): string {
  return crypto.randomUUID();
}

export function slugUsername(name: string, id: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 18);
  return `${base || "seat"}-${id.slice(0, 6)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
