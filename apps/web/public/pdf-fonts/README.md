# PDF editor fonts

Static TrueType files for the free PDF editor (`/free-tools/pdf-editor`), loaded only when a font is chosen or used, and embedded in saved files as subsets.
All are under the SIL Open Font License 1.1 (the license text of each is `LICENSE-<name>.txt` here). They were made from the variable fonts of the
Google Fonts repository (github.com/google/fonts, `ofl/`) with fontTools: one static instance per style (wght 400 / 700, upright / italic; Inter opsz 14, wdth 100
for Roboto and Open Sans), cut to Latin + Latin Extended (U+0020-024F, U+02B0-02FF, U+1E00-1EFF, general punctuation, currency, a few symbols), hinting and layout
features removed (so the width the screen measures is the advance the PDF writes). Name tables (copyright, license) are kept as in the originals.

| Files | Family | Source |
|---|---|---|
| `inter-*.ttf` | Inter | rsms/inter, `ofl/inter` |
| `jakarta-*.ttf` | Plus Jakarta Sans | tokotype/PlusJakartaSans, `ofl/plusjakartasans` |
| `roboto-*.ttf` | Roboto | `ofl/roboto` |
| `opensans-*.ttf` | Open Sans | `ofl/opensans` |
| `lora-*.ttf` | Lora | `ofl/lora` (Reserved Font Name "Lora") |
| `jbmono-*.ttf` | JetBrains Mono | JetBrains/JetBrainsMono, `ofl/jetbrainsmono` |
| `notoarabic-regular.ttf`, `notodeva-regular.ttf` | Noto Sans Arabic, Noto Sans Devanagari | `ofl/notosansarabic`, `ofl/notosansdevanagari`; used ONLY for the invisible text layer behind Arabic / Hindi pictures (shaping features kept in the file, switched off when embedding), never shown |

Dependency: `@pdf-lib/fontkit` 1.1.1 (MIT) embeds them (pdf-lib has no font parser of its own).
