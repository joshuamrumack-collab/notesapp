// Images dropped or pasted into a page: files from Explorer, and images dragged from a web browser
// (which usually arrive as a web address, not as a file).
import { type Store, freeName, isTauri, join } from "./storage";

export const ATTACHMENTS = "_attachments";
const MAX_BYTES = 30 * 1024 * 1024;

/** What could be read from the drop. Must be collected during the event: the browser empties it afterwards. */
export interface ImageSource {
  files: File[];
  urls: string[];
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)(?:[?#]|$)/i;

/** Image addresses in dropped HTML, e.g. <img src="..."> from a web page. */
export function imageUrlsFromHtml(html: string): string[] {
  const out: string[] = [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const img of Array.from(doc.querySelectorAll("img"))) {
    // srcset often has a sharper version than src.
    const set = img.getAttribute("srcset");
    const best = set
      ?.split(",")
      .map((s) => s.trim().split(/\s+/))
      .filter((p) => p[0])
      .sort((a, b) => parseFloat(b[1] ?? "1") - parseFloat(a[1] ?? "1"))[0]?.[0];
    const src = img.getAttribute("src");
    for (const u of [src, best]) if (u && !out.includes(u)) out.push(u);
  }
  return out;
}

export function collectImages(dt: DataTransfer | null): ImageSource {
  if (!dt) return { files: [], urls: [] };
  const files = Array.from(dt.files ?? []).filter((f) => f.type.startsWith("image/") || IMAGE_EXT.test(f.name));
  const urls: string[] = [];
  const html = dt.getData("text/html");
  if (html) urls.push(...imageUrlsFromHtml(html));
  for (const line of (dt.getData("text/uri-list") || "").split(/\r?\n/)) {
    const u = line.trim();
    if (u && !u.startsWith("#") && (IMAGE_EXT.test(u) || u.startsWith("data:image/")) && !urls.includes(u)) urls.push(u);
  }
  const text = dt.getData("text/plain").trim();
  if (/^(https?:\/\/\S+|data:image\/\S+)$/.test(text) && (IMAGE_EXT.test(text) || text.startsWith("data:image/")) && !urls.includes(text)) urls.push(text);
  return { files, urls };
}

/** True while dragging, before the drop: lets the page show it will accept the drop. */
export function mightHaveImages(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  return Array.from(dt.types).some((t) => t === "Files" || t === "text/uri-list" || t === "text/html");
}

/** Work out the image type from the first bytes, so a file without a proper name still gets one. */
export function sniffExt(b: Uint8Array): string | null {
  const s = (i: number, ...v: number[]) => v.every((x, j) => b[i + j] === x);
  if (s(0, 0x89, 0x50, 0x4e, 0x47)) return "png";
  if (s(0, 0xff, 0xd8, 0xff)) return "jpg";
  if (s(0, 0x47, 0x49, 0x46, 0x38)) return "gif";
  if (s(0, 0x52, 0x49, 0x46, 0x46) && s(8, 0x57, 0x45, 0x42, 0x50)) return "webp";
  if (s(0, 0x42, 0x4d)) return "bmp";
  if (s(4, 0x66, 0x74, 0x79, 0x70) && (s(8, 0x61, 0x76, 0x69, 0x66) || s(8, 0x61, 0x76, 0x69, 0x73))) return "avif";
  if (s(0, 0, 0, 1, 0)) return "ico";
  const head = new TextDecoder().decode(b.slice(0, 512)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "svg";
  return null;
}

function decodeDataUrl(url: string): Uint8Array {
  const comma = url.indexOf(",");
  const meta = url.slice(5, comma);
  const payload = url.slice(comma + 1);
  if (meta.endsWith(";base64")) return Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
  return new TextEncoder().encode(decodeURIComponent(payload));
}

function nameFromUrl(url: string): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    return last.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|#^[\]]/g, " ").trim().slice(0, 60);
  } catch {
    return "";
  }
}

async function download(url: string): Promise<Uint8Array> {
  if (url.startsWith("data:")) return decodeDataUrl(url);
  // The desktop app downloads outside the page, so other sites' download rules (CORS) do not block it.
  const doFetch = isTauri ? (await import("@tauri-apps/plugin-http")).fetch : fetch;
  const res = await doFetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`the site answered ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error("the image is larger than 30 MB");
  return bytes;
}

export interface SavedImage {
  path: string; // _attachments/name.png
  name: string;
}

/** Save every image from a drop or paste into the notebook's attachments folder. */
export async function saveImages(store: Store, src: ImageSource): Promise<{ saved: SavedImage[]; failed: string[] }> {
  const saved: SavedImage[] = [];
  const failed: string[] = [];
  const put = async (base: string, bytes: Uint8Array, fallbackExt: string) => {
    const ext = sniffExt(bytes) ?? fallbackExt;
    if (!ext) throw new Error("it is not an image");
    const name = await freeName(store, ATTACHMENTS, base || "image", ext);
    const path = join(ATTACHMENTS, name);
    await store.writeBytes(path, bytes);
    saved.push({ path, name });
  };
  for (const f of src.files) {
    const dot = f.name.lastIndexOf(".");
    try {
      await put(dot > 0 ? f.name.slice(0, dot) : f.name, new Uint8Array(await f.arrayBuffer()), dot > 0 ? f.name.slice(dot + 1).toLowerCase() : f.type.split("/")[1] ?? "");
    } catch (e) {
      failed.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // Files win: a browser that also gave us the file needs no download.
  if (!saved.length) {
    for (const url of src.urls) {
      try {
        await put(url.startsWith("data:") ? "image" : nameFromUrl(url), await download(url), "");
        break; // one drop is one image; the other addresses were the same picture
      } catch (e) {
        failed.push(`${url.startsWith("data:") ? "image" : url}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return { saved, failed: saved.length ? [] : failed };
}
