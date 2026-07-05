import fs from "fs";
import path from "path";

const CACHE_DIR = path.join(process.cwd(), "data", "cache");

function ensureDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function keyToFile(key: string): string {
  const safe = key.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  return path.join(CACHE_DIR, `${safe}.json`);
}

const TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

export function getCached<T>(key: string): T | null {
  try {
    ensureDir();
    const file = keyToFile(key);
    if (!fs.existsSync(file)) return null;
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs > TTL_MS) return null;
    const raw = fs.readFileSync(file, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setCached<T>(key: string, value: T): void {
  try {
    ensureDir();
    const file = keyToFile(key);
    fs.writeFileSync(file, JSON.stringify(value), "utf-8");
  } catch (err) {
    console.error("cache write failed", err);
  }
}
