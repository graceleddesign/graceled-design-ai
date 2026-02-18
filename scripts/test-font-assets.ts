import assert from "node:assert/strict";
import { resolveFontPairingFromIds } from "../lib/lockups/fonts";
import { FONT_ASSETS, getFontFaceCSS } from "../src/design/fonts/font-assets";

function main(): void {
  const sampleAssets = FONT_ASSETS.slice(0, 2);
  const css = getFontFaceCSS(sampleAssets);

  assert(css.includes("@font-face"), "Expected at least one @font-face block.");
  assert(css.includes("font-family:'Playfair Display'"), "Expected Playfair Display family in generated CSS.");
  assert(
    css.includes("url('/fonts/PlayfairDisplay-Regular.woff2') format('woff2')"),
    "Expected public /fonts path in generated CSS."
  );

  const fallback = resolveFontPairingFromIds({
    titleFontId: "Missing-Title-Font",
    subtitleFontId: "Missing-Subtitle-Font",
    accentFontId: "Missing-Accent-Font"
  });

  assert(fallback.titleFont.includes("Fraunces"), "Missing title font id should fall back to embedded Fraunces.");
  assert(fallback.subtitleFont.includes("Inter"), "Missing subtitle font id should fall back to embedded Inter.");
  assert(fallback.accentFont?.includes("DM Serif Display"), "Missing accent font id should fall back to embedded DM Serif Display.");
  console.log("font-asset-tests: ok");
}

main();
