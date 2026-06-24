import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
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
const smallIconSizes = new Set([16, 20, 24, 32, 40]);

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
  const svg = smallIconSizes.has(size) ? smallIconSvg(size) : largeIconSvg();
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
    ${svg}
  </body>
</html>`;
}

function smallIconSvg(size) {
  const scale = size / 24;
  const n = (value) => Math.round(value * scale);
  const radius = Math.max(3, n(5));
  const barX = n(5);
  const barY = n(4);
  const barWidth = Math.max(4, n(6));
  const barHeight = size - barY * 2;
  const barRadius = Math.max(1, Math.round(scale * 2));
  const jointX = n(11);
  const upperTipX = size - n(3);
  const upperTopY = n(5);
  const upperMidY = n(10);
  const upperLowY = n(14);
  const lowerTipX = size - n(4);
  const lowerBottomY = size - n(3);
  const lowerMidY = n(14);

  return `<svg viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision">
      <rect width="${size}" height="${size}" rx="${radius}" fill="#F1E8D9" />
      <path d="M${jointX} ${upperMidY}L${upperTipX} ${upperTopY}C${size - n(1)} ${upperTopY} ${size} ${upperTopY + n(2)} ${size} ${upperTopY + n(4)}V${upperMidY}C${size} ${upperMidY + n(1)} ${size - n(1)} ${upperMidY + n(2)} ${size - n(2)} ${upperMidY + n(3)}L${jointX} ${upperLowY}V${upperMidY}Z" fill="#D8C09D" />
      <path d="M${jointX} ${lowerMidY}L${lowerTipX} ${lowerBottomY}C${size - n(3)} ${size - n(1)} ${size - n(4)} ${size} ${size - n(6)} ${size}H${size - n(10)}C${size - n(11)} ${size} ${size - n(12)} ${size - n(1)} ${size - n(13)} ${size - n(2)}L${barX + barWidth - 1} ${size - n(8)}V${size - n(10)}L${jointX} ${lowerMidY}Z" fill="#B84A40" />
      <rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="${barRadius}" fill="#20242A" />
    </svg>`;
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
