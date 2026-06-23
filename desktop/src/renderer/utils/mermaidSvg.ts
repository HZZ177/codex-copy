export interface SvgDimensions {
  width: number;
  height: number;
}

export function normalizeMermaidSvgDimensions(svg: string): { svg: string; dimensions: SvgDimensions | null } {
  const rawDimensions = extractSvgDimensions(svg);
  if (!svg.trim() || typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    return { svg, dimensions: rawDimensions };
  }

  try {
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");
    if (document.querySelector("parsererror")) {
      return { svg, dimensions: rawDimensions };
    }

    const svgElement = document.querySelector("svg");
    const dimensions = parseSvgViewBox(svgElement?.getAttribute("viewBox")) ?? rawDimensions;
    if (!svgElement || !dimensions) {
      return { svg, dimensions: rawDimensions };
    }

    svgElement.setAttribute("width", formatSvgDimension(dimensions.width));
    svgElement.setAttribute("height", formatSvgDimension(dimensions.height));

    const style = svgElement.getAttribute("style");
    if (style) {
      const normalizedStyle = removeInlineMaxWidth(style);
      if (normalizedStyle) {
        svgElement.setAttribute("style", normalizedStyle);
      } else {
        svgElement.removeAttribute("style");
      }
    }

    return { svg: new XMLSerializer().serializeToString(svgElement), dimensions };
  } catch {
    return { svg, dimensions: rawDimensions };
  }
}

export function formatMermaidCssPixels(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, "")}px`;
}

function extractSvgDimensions(svg: string): SvgDimensions | null {
  const svgTag = /<svg\b[\s\S]*?>/i.exec(svg)?.[0];
  if (!svgTag) {
    return null;
  }

  const viewBoxDimensions = parseSvgViewBox(readSvgAttribute(svgTag, "viewBox"));
  if (viewBoxDimensions) {
    return viewBoxDimensions;
  }

  const width = parseSvgLength(readSvgAttribute(svgTag, "width"));
  const height = parseSvgLength(readSvgAttribute(svgTag, "height"));
  return width && height ? { width, height } : null;
}

function readSvgAttribute(svgTag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(svgTag);
  return match?.[2] ?? match?.[3] ?? match?.[4] ?? null;
}

function parseSvgViewBox(viewBox?: string | null): SvgDimensions | null {
  const values = viewBox
    ?.trim()
    .split(/[\s,]+/)
    .map((value) => Number(value));
  if (!values || values.length !== 4) {
    return null;
  }

  const [, , width, height] = values;
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : null;
}

function parseSvgLength(value?: string | null): number | null {
  if (!value || value.trim().endsWith("%")) {
    return null;
  }

  const match = /^([+-]?\d*\.?\d+)(px)?$/i.exec(value.trim());
  if (!match) {
    return null;
  }

  const numeric = Number(match[1]);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function formatSvgDimension(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function removeInlineMaxWidth(style: string): string {
  return style
    .split(";")
    .map((rule) => rule.trim())
    .filter((rule) => rule && !/^max-width\s*:/i.test(rule))
    .join("; ");
}
