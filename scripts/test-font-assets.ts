import assert from "node:assert/strict";
import { resolveFontPairingFromIds } from "../lib/lockups/fonts";
import { FONT_ASSETS, getFontFaceCSS, toPublicFontPath } from "../src/design/fonts/font-assets";
import { parseGoogleFontsStylesheet } from "../src/design/fonts/google-fonts-fetch";

function main(): void {
  const sampleAssets = FONT_ASSETS.slice(0, 2);
  const css = getFontFaceCSS(sampleAssets);

  assert(css.includes("@font-face"), "Expected at least one @font-face block.");
  assert(css.includes("font-family:'Playfair Display'"), "Expected Playfair Display family in generated CSS.");
  assert(css.includes(`url('${toPublicFontPath(sampleAssets[0].file)}') format('woff2')`), "Expected public /fonts path in generated CSS.");

  const parsedGoogleCss = parseGoogleFontsStylesheet(`
    /* latin */
    @font-face {
      font-family: 'Inter';
      font-style: normal;
      font-weight: 100 900;
      src: url(https://fonts.gstatic.com/s/inter/v1/inter.woff2) format('woff2');
    }
    @font-face {
      font-family: 'Inter';
      font-style: italic;
      font-weight: 700;
      src: url(\"https://fonts.gstatic.com/s/inter/v1/inter-italic.woff2\") format(\"woff2\");
    }
  `);

  assert.equal(parsedGoogleCss.length, 2, "Expected two parsed Google @font-face blocks.");
  assert.equal(parsedGoogleCss[0]?.style, "normal");
  assert.equal(parsedGoogleCss[0]?.weightMin, 100);
  assert.equal(parsedGoogleCss[0]?.weightMax, 900);
  assert.equal(parsedGoogleCss[1]?.style, "italic");
  assert.equal(parsedGoogleCss[1]?.weightMin, 700);
  assert.equal(parsedGoogleCss[1]?.url, "https://fonts.gstatic.com/s/inter/v1/inter-italic.woff2");

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
