# Third-party notices

Breathlines application code is MIT licensed. This does **not** relicense its dependencies.

The Electron architecture is adapted from the documented wiring in Presage's
[`electron-quickstart`](https://github.com/Presage-Security/SmartSpectra/tree/main/nodejs/samples/electron-quickstart):
`bindSmartSpectraIpc`, the official preload bridge, renderer SDK, `streamAvailable`,
and an esbuild browser bundle. Application source was written independently;
the sample is not represented as MIT-licensed code.

The checked Presage sample source headers state:
`Copyright (C) 2026 Presage Technologies, Inc. SPDX-License-Identifier: LicenseRef-Proprietary`.
The Node SDK's LICENSE states Copyright © 2026 Presage Security, Inc. d/b/a
Presage Technologies, all rights reserved, under [Presage's Terms of Service](https://physiology.presagetech.com/tos).
The SDK is proprietary and requires a Presage account/key. Review its installed
LICENSE, NOTICE and THIRD_PARTY_NOTICES.txt before redistribution.

Electron is MIT licensed and includes Chromium and other separately licensed
components; see `node_modules/electron/dist/LICENSES.chromium.html`.
esbuild is MIT licensed. SDK transitive dependencies retain their own licenses.

No fonts, photos, or video assets are bundled with Breathlines. System Georgia,
Arial, and Courier New fall back to the platform's installed serif, sans-serif,
and monospace fonts. The decorative breath curve is original SVG.
