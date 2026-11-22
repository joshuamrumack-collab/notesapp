// Password-locked pages: AES-GCM 256 with a key from PBKDF2-SHA256. Nothing is readable without the password.
export interface LockedFile {
  format: "notesapp-locked";
  v: 1;
  kind: "md" | "canvas";
  salt: string;
  iv: string;
  data: string;
}

const ITERATIONS = 310_000;
const enc = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function keyFor(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function lockText(text: string, password: string, kind: "md" | "canvas"): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(password, salt);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, enc.encode(text)));
  const file: LockedFile = { format: "notesapp-locked", v: 1, kind, salt: b64(salt), iv: b64(iv), data: b64(data) };
  return JSON.stringify(file, null, "\t") + "\n";
}

export function readLockedHeader(src: string): LockedFile {
  const file = JSON.parse(src) as LockedFile;
  if (file.format !== "notesapp-locked") throw new Error("Not a locked page");
  return file;
}

/** Throws "Wrong password" if the password does not open it. */
export async function unlockText(src: string, password: string): Promise<{ text: string; kind: "md" | "canvas" }> {
  const file = readLockedHeader(src);
  const key = await keyFor(password, unb64(file.salt));
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(file.iv) as BufferSource }, key, unb64(file.data) as BufferSource);
    return { text: new TextDecoder().decode(plain), kind: file.kind };
  } catch {
    throw new Error("Wrong password");
  }
}

/** Passwords typed this session, per notebook, so a page is not asked for twice. Cleared by "Lock all". */
export const sessionPasswords = new Map<string, string>();
