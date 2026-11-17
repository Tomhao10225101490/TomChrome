# Third-party notices — Tom chrome 1.3.1

Tom chrome is an independent application, not Google Chrome or Tor Browser. No affiliation or endorsement by Google, the Tor Project, Ghostery or EasyList is implied.

## Recolored product-mark geometry

`assets/logo.svg` changes only four fill colors in Chromium's shared Chrome/Chromium product-mark SVG; path geometry, viewBox, clipping and white center ring are unchanged. Reference retrieved from https://raw.githubusercontent.com/chromium/chromium/main/chrome/app/theme/chromium/product_logo.svg . The original and Chromium BSD license are included in `assets/branding/`. Google/Chrome trademarks remain their owners' property; this independent recoloring implies no Google affiliation or endorsement.

## Electron / Chromium

Electron 45.3.2 is MIT licensed; Chromium and its components have additional licenses. Their LICENSE and LICENSES.chromium.html are supplied with the Electron distribution inside the application bundle. The User-Agent uses the **actual Chromium major version** with normal version reduction, and removes only Tomchrome / Electron product tokens. It does not pretend to run Firefox / Tor Browser or a newer engine than is installed.

## Ad blocking

- `@ghostery/adblocker` 2.20.3: MPL-2.0, https://github.com/ghostery/adblocker . The library is used unmodified. Its license is included with its dependency files. No Ghostery telemetry or hosted subscription service is used. Network filter matching and plain CSS cosmetic hiding are used; filter-provided JavaScript/scriptlets and extended selectors are not executed.
- `tldts` 7.5.4: MIT, https://github.com/remusao/tldts . Uses the Public Suffix List to distinguish sites, including private hosting suffixes.
- EasyList and EasyPrivacy: The EasyList authors (https://easylist.to/). Rules are redistributed unmodified under **Creative Commons Attribution-ShareAlike 3.0 Unported**, one of the offered dual licenses. License text: `assets/adblock/LICENSE-CC-BY-SA-3.0.txt`.
- EasyList China: EasyList China authors, https://github.com/easylist/easylistchina/ . Its source header links to the same dual-license conditions; redistributed under CC BY-SA 3.0. All attribution headers retained.

Bundled snapshots downloaded 2026-11-16 over verified HTTPS:

- `assets/adblock/easylist.txt`: https://easylist.to/easylist/easylist.txt ; version 202611160508 ; SHA256 `27340fc2d7c5e135480fd20cf5bf35641c8224b355b95f9f6fff4f88dec56f85`.
- `assets/adblock/easyprivacy.txt`: https://easylist.to/easylist/easyprivacy.txt ; version 202611160508 ; SHA256 `2dab305cd4bfa06a27b8f5633e75625815b99822e58375f58012e7978adf16a3`.
- `assets/adblock/easylistchina.txt`: https://easylist-downloads.adblockplus.org/easylistchina.txt ; version 202611160502 ; SHA256 `e047687ac1b09a26709660023bb065c65d70f8f10934e9b480fc6be720d47e40`.

`assets/adblock/ads.bin` and `tracking.bin` are offline serialized caches of these same attributed rule snapshots, distributed under the same CC BY-SA 3.0 terms for the rule data. Text sources and attribution headers remain included. `cache-manifest.json` records text and binary SHA256 values; `scripts/compile-filters.js` reproduces them using the unmodified filter engine. The browser verifies those values and falls back to parsing the source lists if a cache is missing, changed or incompatible. Caching does not enable rule scripts or extended selectors.

The browser does not silently poll a list service or upload visited URLs. These snapshots are immediately available offline. List updates currently require an application update; no claim of live rule auto-updates is made. CC BY-SA applies to the rule data, not an assertion that unrelated application code is derived from the lists.

## Bundled Tor process (macOS ARM64)

Tor 0.4.9.17, Libevent 2.1.13, libscrypt 1.22 and OpenSSL 4.1.0 are bundled from **SHA256-verified Homebrew arm64_sequoia bottles**, not an unverified installer. Source package URLs and bottle hashes are in `vendor/tor/PROVENANCE.json`, copied into the final app's `Contents/Resources/tor/PROVENANCE.json`. Runtime libraries are relocated with install_name_tool and locally ad-hoc signed; no Homebrew installation or system-library modification is required.

Licenses and source locations:

- Tor: BSD-2-Clause / BSD-3-Clause / MIT / NCSA components; https://www.torproject.org/ ; source https://dist.torproject.org/tor-0.4.9.17.tar.gz ; SHA256 `ff372c41ee7013557fe5b7acd96c909950b27a7959c59fcb87c02591682fabe2`.
- Libevent: BSD-3-Clause, https://libevent.org/ .
- libscrypt: BSD-2-Clause, https://github.com/technion/libscrypt .
- OpenSSL: Apache-2.0, https://openssl-library.org/ .

Upstream license texts are supplied under `vendor/tor/licenses/` and the packaged `Contents/Resources/tor/licenses/`. Homebrew formula source: https://github.com/Homebrew/homebrew-core . Reproduction command on an ARM64 macOS developer machine: `python3 scripts/bundle-tor.py` (bounded HTTPS downloads with pinned checksums, local files only, no root).

Tor connections are opt-in and use a separate process and in-memory Chromium partition per Tor window. The Tor Project exit-check endpoint `https://check.torproject.org/api/ip` is requested **through that window's SOCKS5 proxy** before enabling browsing. Tor is not started for normal windows or regular incognito windows. Chromium is not Tor Browser, lacks its common fingerprint and security-level system, and is not offered as an equivalent anonymity product.
