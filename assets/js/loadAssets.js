/* Local assets only. Colors are sampled from the image that owns the surface. */
function extractImageColor(image) {
  if (!image || !image.complete || window.location.protocol === "file:") return null;
  // Browsers give file:// pages an opaque origin, so canvas sampling is
  // forbidden even when both files are in the same folder.
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 100;
    canvas.getContext("2d").drawImage(image, 0, 0, 100, 100);
    const [r, g, b] = typeof ColorThief !== "undefined"
      ? new ColorThief().getColor(canvas)
      : averageCanvasColor(canvas);
    return `rgb(${r}, ${g}, ${b})`;
  } catch (error) {
    if (error.name !== "SecurityError") {
      console.warn("Unable to sample a local image.", error);
    }
    return null;
  }
}

function averageCanvasColor(canvas) {
  const pixels = canvas.getContext("2d").getImageData(0, 0, 100, 100).data;
  let red = 0; let green = 0; let blue = 0; let count = 0;
  for (let index = 0; index < pixels.length; index += 16) {
    red += pixels[index]; green += pixels[index + 1]; blue += pixels[index + 2]; count += 1;
  }
  return [Math.round(red / count), Math.round(green / count), Math.round(blue / count)];
}

function applyColorsFromImage(image) {
  const accent = extractImageColor(image);
  if (!accent) return;
  try {
    const [r, g, b] = accent.match(/\d+/g).map(Number);
    const brighter = `rgb(${Math.min(255, r + 80)}, ${Math.min(255, g + 80)}, ${Math.min(255, b + 80)})`;
    document.documentElement.style.setProperty("--accent-color", accent);
    document.documentElement.style.setProperty("--icon-color", accent);
    document.documentElement.style.setProperty("--text-color", brighter);
    document.documentElement.style.setProperty("--text-color-light", "#fff");
    document.documentElement.style.setProperty("--scroll-bar", accent);
    document.documentElement.style.setProperty("--bg-color", `rgb(${Math.floor(r * .12)}, ${Math.floor(g * .12)}, ${Math.floor(b * .12)})`);
    document.dispatchEvent(new CustomEvent("colorsApplied", { detail: { accentColor: accent } }));
  } catch (error) {
    console.warn("Unable to apply profile image colors.", error);
  }
}

window.extractImageColor = extractImageColor;

document.addEventListener("DOMContentLoaded", () => {
  const image = document.getElementById("dc-pfp");
  if (image) {
    image.addEventListener("load", () => applyColorsFromImage(image), { once: true });
    if (image.complete) applyColorsFromImage(image);
  }
});
