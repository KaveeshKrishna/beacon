# Third-Party Notices

Beacon is licensed under **AGPL-3.0-or-later** (see [LICENSE](LICENSE)). Third-party components remain under their own licenses. This file lists direct dependencies and the licenses that apply to them. It is a notice, not a replacement for the complete license texts shipped with each package.

Transitive dependencies are not enumerated here; their licenses are available in `node_modules`, in the Gradle dependency cache, and in the published artifacts. If you redistribute a built APK or a container image, include the license files from the resolved dependency set.

---

## Web runtime dependencies

| Package | Version | License |
| --- | --- | --- |
| `next` | 15.5.28 | MIT |
| `react`, `react-dom` | 19.1.1 | MIT |
| `@neondatabase/serverless` | 1.2.0 | MIT |
| `drizzle-orm` | 0.45.4 | Apache-2.0 |
| `hash-wasm` | 4.12.0 | MIT |
| `zod` | 3.25.76 | MIT |
| `qrcode` | 1.5.4 | MIT |
| `maplibre-gl` | 6.15.0 | BSD-3-Clause |
| `lucide-react` | 1.61.0 | ISC |
| `clsx` | 2.1.1 | MIT |
| `tailwind-merge` | 3.7.0 | MIT |
| `server-only` | 0.0.1 | MIT |
| `@radix-ui/react-dialog` | 1.3.1 | MIT |
| `@radix-ui/react-dropdown-menu` | 2.2.1 | MIT |
| `@radix-ui/react-switch` | 1.4.1 | MIT |
| `@radix-ui/react-tabs` | 1.2.1 | MIT |
| `@fontsource-variable/instrument-sans` | 5.3.0 | SIL OFL-1.1 |
| `@fontsource-variable/jetbrains-mono` | 5.3.0 | SIL OFL-1.1 |

## Web development and build dependencies

| Package | Version | License |
| --- | --- | --- |
| `typescript` | 5.9.3 | Apache-2.0 |
| `drizzle-kit` | 0.31.11 | MIT |
| `tailwindcss`, `@tailwindcss/postcss` | 4.3.3 | MIT |
| `eslint`, `eslint-config-next` | 9.39.2 / 15.5.28 | MIT |
| `vitest` | 3.2.4 | MIT |
| `tsx` | 4.23.15 | MIT |
| `sharp` | 0.35.5 | Apache-2.0 |
| `dotenv` | 18.0.9 | BSD-2-Clause |
| `@types/*` | as pinned | MIT |

`sharp` uses prebuilt libvips binaries, which are distributed under **LGPL-3.0-or-later**. The binaries are dynamically linked and unmodified; the source and build instructions are available from the sharp and libvips projects.

## Android dependencies

| Component | License |
| --- | --- |
| Kotlin standard library and runtime | Apache-2.0 |
| AndroidX Core, Activity, Lifecycle, WorkManager | Apache-2.0 |
| Jetpack Compose UI, Material 3, Material Icons | Apache-2.0 |
| Kotlinx Coroutines | Apache-2.0 |
| Android Gradle Plugin | Apache-2.0 |
| Gradle wrapper and Gradle distribution | Apache-2.0 |
| JUnit 4 (test only) | EPL-1.0 |
| AndroidX Test, Espresso, Compose UI Test (test only) | Apache-2.0 |
| Android SDK platform and build tools | Apache-2.0, subject to Google's SDK terms |

Beacon does not bundle Firebase, Play Services, analytics, advertising, crash reporting, or a WebView.

## Fonts

**Instrument Sans** and **JetBrains Mono** are distributed under the **SIL Open Font License 1.1**. The fonts are bundled as web assets through Fontsource. The OFL permits embedding and redistribution; modified versions must not use the reserved font names. Full texts are in the respective Fontsource packages.

## Map data and styles

- **MapLibre GL JS** is licensed under the **BSD 3-Clause License**. It includes work derived from Mapbox GL JS, also under BSD-3-Clause.
- **OpenFreeMap** provides free vector tile styles (`positron` and `dark`) and tiles. It is a service, not a bundled dependency. Review its fair-use expectations before high-volume use.
- Map data is © **OpenStreetMap contributors**, available under the **Open Database License (ODbL) 1.0**. Attribution is rendered in the map and must remain visible.
- Google Maps links are plain hyperlinks. No Google Maps SDK, API key, or proprietary map data is bundled.

## Documentation and community text

- **Contributor Covenant 2.1** is used and adapted in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) under **CC BY 4.0**.
- **Keep a Changelog** is referenced for format only; no text is bundled.
- The Beacon name, logo, and brand assets are original to this project and are not third-party marks.

## Trademarks

Android, Google, Google Maps, Firebase, and related marks are trademarks of Google LLC. Vercel, Neon, Resend, MapLibre, OpenFreeMap, Relay, and other product names are trademarks of their respective owners. They are used only to describe interoperability or deployment. Beacon is not affiliated with or endorsed by any of them.

## Reporting a licensing issue

If you believe a component is missing attribution or is included under an incompatible license, open a non-security issue with the package name, version, and the license you believe applies. Security reports follow [SECURITY.md](SECURITY.md).
