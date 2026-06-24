import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tauriIconPath = resolve(root, "src-tauri/icons/icon.ico");
const sourceIconPath = resolve(root, "src-tauri/icons/keydex-icon-source.png");
const faviconIcoPath = resolve(root, "public/favicon.ico");
const favicon32Path = resolve(root, "public/favicon-32.png");
const appleTouchPath = resolve(root, "public/apple-touch-icon.png");

const icoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const faviconSizes = [16, 32, 48, 64];
const forceGeneratedIcons = process.argv.includes("--force");

if (existsSync(tauriIconPath) && !forceGeneratedIcons) {
  await mkdir(dirname(faviconIcoPath), { recursive: true });
  const manualIcon = await readFile(tauriIconPath);
  const normalizedIcon = ensureIcoFirstLayer(manualIcon, 32);
  if (normalizedIcon !== manualIcon) {
    await writeFile(tauriIconPath, normalizedIcon);
    console.log("Normalized manual Windows icon: moved the 32px layer to the first ICO entry.");
  }
  await writeFile(faviconIcoPath, normalizedIcon);
  console.log(`Kept manual Windows icon: ${tauriIconPath}`);
  console.log(`Synced web favicon: ${faviconIcoPath}`);
  console.log("Pass --force to regenerate all icon assets from the built-in SVG.");
  process.exit(0);
}

const pngBySize = new Map();

const browser = await launchBrowser();
try {
  for (const size of new Set([...icoSizes, 180, 1024])) {
    pngBySize.set(size, await renderIconPng(browser, size));
  }
} finally {
  await browser.close();
}

await mkdir(dirname(tauriIconPath), { recursive: true });
await mkdir(dirname(faviconIcoPath), { recursive: true });
await writeFile(tauriIconPath, buildIco(icoSizes.map((size) => ({ size, png: pngBySize.get(size) }))));
await writeFile(sourceIconPath, pngBySize.get(1024));
await writeFile(faviconIcoPath, buildIco(faviconSizes.map((size) => ({ size, png: pngBySize.get(size) }))));
await writeFile(favicon32Path, pngBySize.get(32));
await writeFile(appleTouchPath, pngBySize.get(180));

async function renderIconPng(browser, size) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  await page.setContent(iconMarkup(size), { waitUntil: "load" });
  const png = await page.locator("svg").screenshot({ omitBackground: true });
  await page.close();
  return png;
}

function iconMarkup(size) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: transparent;
      }

      svg {
        display: block;
        width: 100vw;
        height: 100vh;
        shape-rendering: geometricPrecision;
      }
    </style>
  </head>
  <body>
    ${largeIconSvg()}
  </body>
</html>`;
}

function largeIconSvg() {
  return `<svg viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="256" height="256" rx="56" fill="#F0E9DE" />
      <path d="M60 58C60 48.0589 68.0589 40 78 40H101C110.941 40 119 48.0589 119 58V198C119 207.941 110.941 216 101 216H78C68.0589 216 60 207.941 60 198V58Z" fill="#24272C" />
      <path d="M124 103.5L190 67C203.333 59.6262 216 69.266 216 84.5V116.5C216 123.432 212.351 129.852 206.398 133.401L124 182.5V103.5Z" fill="#E1D2BC" />
      <path d="M124 144L196.271 199.578C207.789 208.436 201.524 226.854 187 226.854H151.309C145.503 226.854 139.894 224.76 135.508 220.956L103 192.761V162.5L124 144Z" fill="#B94A3F" />
      <path d="M60 58C60 48.0589 68.0589 40 78 40H101C110.941 40 119 48.0589 119 58V198C119 207.941 110.941 216 101 216H78C68.0589 216 60 207.941 60 198V58Z" fill="url(#left-sheen)" opacity="0.34" />
      <defs>
        <linearGradient id="left-sheen" x1="60" y1="40" x2="119" y2="216" gradientUnits="userSpaceOnUse">
          <stop stop-color="#FFFFFF" stop-opacity="0.08" />
          <stop offset="1" stop-color="#000000" stop-opacity="0.18" />
        </linearGradient>
      </defs>
    </svg>`;
}

async function launchBrowser() {
  const executablePath = [
    process.env.ProgramFiles && resolve(process.env.ProgramFiles, "Google/Chrome/Application/chrome.exe"),
    process.env["ProgramFiles(x86)"] && resolve(process.env["ProgramFiles(x86)"], "Google/Chrome/Application/chrome.exe"),
    process.env.ProgramFiles && resolve(process.env.ProgramFiles, "Microsoft/Edge/Application/msedge.exe"),
    process.env["ProgramFiles(x86)"] && resolve(process.env["ProgramFiles(x86)"], "Microsoft/Edge/Application/msedge.exe"),
  ].find((candidate) => candidate && existsSync(candidate));

  return chromium.launch(executablePath ? { executablePath } : undefined);
}

function buildIco(entries) {
  const headerSize = 6;
  const entrySize = 16;
  const directorySize = headerSize + entries.length * entrySize;
  const totalSize = directorySize + entries.reduce((sum, entry) => sum + entry.png.length, 0);
  const ico = Buffer.alloc(totalSize);

  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(entries.length, 4);

  let imageOffset = directorySize;
  entries.forEach((entry, index) => {
    const directoryOffset = headerSize + index * entrySize;
    ico[directoryOffset] = entry.size >= 256 ? 0 : entry.size;
    ico[directoryOffset + 1] = entry.size >= 256 ? 0 : entry.size;
    ico[directoryOffset + 2] = 0;
    ico[directoryOffset + 3] = 0;
    ico.writeUInt16LE(1, directoryOffset + 4);
    ico.writeUInt16LE(32, directoryOffset + 6);
    ico.writeUInt32LE(entry.png.length, directoryOffset + 8);
    ico.writeUInt32LE(imageOffset, directoryOffset + 12);
    entry.png.copy(ico, imageOffset);
    imageOffset += entry.png.length;
  });

  return ico;
}

function ensureIcoFirstLayer(ico, preferredSize) {
  if (ico.length < 6 || ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1) {
    return ico;
  }

  const count = ico.readUInt16LE(4);
  const directorySize = 6 + count * 16;
  if (count < 2 || ico.length < directorySize) {
    return ico;
  }

  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const directoryOffset = 6 + index * 16;
    const width = ico[directoryOffset] === 0 ? 256 : ico[directoryOffset];
    const height = ico[directoryOffset + 1] === 0 ? 256 : ico[directoryOffset + 1];
    const size = ico.readUInt32LE(directoryOffset + 8);
    const imageOffset = ico.readUInt32LE(directoryOffset + 12);
    if (imageOffset + size > ico.length) {
      return ico;
    }
    entries.push({ directoryOffset, width, height, size, imageOffset });
  }

  const preferredIndex = entries.findIndex((entry) => entry.width === preferredSize && entry.height === preferredSize);
  if (preferredIndex <= 0) {
    return ico;
  }

  const orderedEntries = [entries[preferredIndex], ...entries.filter((_, index) => index !== preferredIndex)];
  const totalSize = directorySize + orderedEntries.reduce((sum, entry) => sum + entry.size, 0);
  const normalized = Buffer.alloc(totalSize);
  ico.copy(normalized, 0, 0, 6);

  let imageOffset = directorySize;
  orderedEntries.forEach((entry, index) => {
    const directoryEntry = Buffer.from(ico.subarray(entry.directoryOffset, entry.directoryOffset + 16));
    directoryEntry.writeUInt32LE(imageOffset, 12);
    directoryEntry.copy(normalized, 6 + index * 16);
    ico.copy(normalized, imageOffset, entry.imageOffset, entry.imageOffset + entry.size);
    imageOffset += entry.size;
  });

  return normalized;
}
