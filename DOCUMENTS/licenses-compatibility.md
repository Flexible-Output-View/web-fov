# License Compatibility Report — MIT Project

**Date:** 2026-09-24
**Project license:** MIT License (`LICENSE`, Copyright (c) 2025 Lucas Loustalot)
**Scope:** direct dependencies only (`dependencies` + `devDependencies`), backend + frontend
**Method:** `backend/package.json` + `fov-angular/package.json`, resolved versions from `package-lock.json` and `node_modules/*/package.json` (`license` field), missing installs cross-checked with `npm view <pkg> version license` (npm registry).

## Verdict: ✅ Compatible

All 42 direct dependencies use permissive licenses (`MIT`, `BSD-2-Clause`, `BSD-3-Clause`, `Apache-2.0`, `0BSD`), which are all **compatible with distribution under MIT**. No `GPL / AGPL / LGPL / SSPL / proprietary / CC-BY-NC` found in direct deps.

**Obligations:** preserve copyright + license notices when distributing (including Docker images / `dist/` builds). For `Apache-2.0` packages also preserve NOTICE files if present and document modifications.

## Backend — `backend/` (`fov-backend@0.1.0`)

### Production dependencies (13)

| Package | Resolved version | License (SPDX) | MIT-compatible? | Notes |
|---|---|---|---|---|
| bcryptjs | 3.0.3 | BSD-3-Clause | Yes | Not installed locally / absent from `package-lock.json` at audit time; resolved via npm registry. Permissive, attribution only. |
| cors | 2.8.6 | MIT | Yes | Verified lock + installed agree. |
| dotenv | 16.6.1 | BSD-2-Clause | Yes | Verified lock + installed agree. Keep copyright notice. |
| express | 4.22.1 | MIT | Yes | Verified. |
| jsonwebtoken | 9.0.3 | MIT | Yes | Not installed locally; resolved via registry (`npm view`). |
| morgan | 1.10.1 | MIT | Yes | Verified. |
| node-av | 5.2.3 | MIT | Yes | Verified. |
| node-fetch | 3.3.2 | MIT | Yes | Verified. Native `fetch` exists in Node 18+, but license is fine. |
| node-media-server | 2.2.0 (pinned) | MIT | Yes | Verified. |
| pg | 8.23.0 | MIT | Yes | Not installed locally; resolved via registry. |
| srt | 0.0.3 | MIT | Yes | Legacy `licenses: [{type:"MIT"}]` field, no top-level `license` in installed `package.json` nor lock entry. Treat as MIT; unmaintained tiny parser — consider replacing if issues arise. |
| swagger-ui-express | 5.0.1 | MIT | Yes | Not installed locally; resolved via registry. Serves `swagger-ui` (Apache-2.0) at runtime — still compatible, keep notices. |

### Dev dependencies (6, included per request — not shipped to production)

| Package | Resolved version | License (SPDX) | MIT-compatible? | Notes |
|---|---|---|---|---|
| @types/pg | 8.23.1 | MIT | Yes | DefinitelyTyped; not installed locally; resolved via registry. Types only. |
| eslint | 8.57.1 | MIT | Yes | Verified. Build/lint tool only. |
| jest | 29.7.0 | MIT | Yes | Verified. Test runner only. |
| jest-mock-extended | 3.0.7 | MIT | Yes | Verified. Test-only. |
| nodemon | 3.1.14 | MIT | Yes | Verified. Dev-only. |
| supertest | 6.3.4 | MIT | Yes | Verified. Test-only. |

Backend total: 17× MIT (incl. `srt` legacy), 1× BSD-2-Clause, 1× BSD-3-Clause.

## Frontend — `fov-angular/` (`fov-angular`, `private: true`)

All 23 verified locally — `node_modules` agrees with `package-lock.json`.

### Production dependencies (11)

| Package | Resolved version | License (SPDX) | MIT-compatible? | Notes |
|---|---|---|---|---|
| @angular/common | 20.3.18 | MIT | Yes | — |
| @angular/compiler | 20.3.18 | MIT | Yes | — |
| @angular/core | 20.3.18 | MIT | Yes | — |
| @angular/forms | 20.3.18 | MIT | Yes | — |
| @angular/platform-browser | 20.3.18 | MIT | Yes | — |
| @angular/platform-browser-dynamic | 20.3.18 | MIT | Yes | — |
| @angular/router | 20.3.18 | MIT | Yes | — |
| hls.js | 1.6.15 | Apache-2.0 | Yes | Keep copyright + license notice. |
| rxjs | 7.8.2 | Apache-2.0 | Yes | Keep notices. |
| tslib | 2.8.1 | 0BSD | Yes | Permissive (BSD-zero-clause); ships in build output, no attribution required but keep notice as good practice. |
| zone.js | 0.15.1 | MIT | Yes | — |

### Dev dependencies (12, included per request)

| Package | Resolved version | License (SPDX) | MIT-compatible? | Notes |
|---|---|---|---|---|
| @angular/build | 20.3.21 | MIT | Yes | Build-only. |
| @angular/cli | 20.3.24 | MIT | Yes | Build-only. |
| @angular/compiler-cli | 20.3.18 | MIT | Yes | Build-only. |
| @types/jasmine | 5.1.15 | MIT | Yes | Types only. |
| baseline-browser-mapping | 2.10.10 | Apache-2.0 | Yes | Build-only data table. |
| jasmine-core | 5.6.0 | MIT | Yes | Test-only. |
| karma | 6.4.4 | MIT | Yes | Test-only. |
| karma-chrome-launcher | 3.2.0 | MIT | Yes | Test-only. |
| karma-coverage | 2.2.1 | MIT | Yes | Test-only. |
| karma-jasmine | 5.1.0 | MIT | Yes | Test-only. |
| karma-jasmine-html-reporter | 2.1.0 | MIT | Yes | Test-only. |
| typescript | 5.9.3 | Apache-2.0 | Yes | Compiler only; output is not infected. |

Frontend total: 18× MIT, 4× Apache-2.0, 1× 0BSD.

## Why these are MIT-compatible

* **MIT / BSD-2-Clause / BSD-3-Clause / 0BSD:** permissive, attribution-only (0BSD even waives attribution). Can be included, modified, sublicensed under MIT provided copyright notices are preserved (where required).
* **Apache-2.0:** permissive with patent grant. Compatible with MIT for inclusion/distribution. Requirements: preserve copyright, license text, NOTICE (if any); state significant changes. No copyleft effect on your own code.
* **No strong copyleft** (`GPL/AGPL`) in direct deps, so no obligation to relicense this project.

## Actions / recommendations

1. **Nothing blocking.** You may distribute backend (incl. Docker) and frontend `dist/` under MIT.
2. **Keep notices:** ensure Docker images and release bundles retain third-party copyright/license texts (e.g., generate with `npx license-checker --json` at release time).
3. **Backend lockfile drift:** `bcryptjs, jsonwebtoken, pg, swagger-ui-express, @types/pg` are declared in `backend/package.json` but were missing from `package-lock.json` and `node_modules/` at audit time. Run `npm install` in `backend/` and commit the updated lockfile to freeze audited versions.
4. **`srt@0.0.3`:** works license-wise but uses deprecated `licenses` array and is unmaintained. Consider `srt-parser-2` (MIT) or vendoring if you need SRT robustness.
5. **Transitive deps not audited** (per scope). For a release-grade SBOM, run `npx license-checker --summary` in both `backend/` and `fov-angular/` after `npm install`.

## Reproduce

```bash
# backend
cd backend
node -e "for (const p of ['bcryptjs','cors','dotenv','express','jsonwebtoken','morgan','node-av','node-fetch','node-media-server','pg','srt','swagger-ui-express','@types/pg','eslint','jest','jest-mock-extended','nodemon','supertest']) { try { const j=require('./node_modules/'+p+'/package.json'); console.log(p+'|'+j.version+'|'+(j.license||JSON.stringify(j.licenses))) } catch(e){ console.log(p+'|NOT INSTALLED') } }"
npm view bcryptjs version license
npm view jsonwebtoken version license
npm view pg version license
npm view swagger-ui-express version license
npm view @types/pg version license

# frontend
cd ../fov-angular
node -e "for (const p of ['@angular/common','@angular/compiler','@angular/core','@angular/forms','@angular/platform-browser','@angular/platform-browser-dynamic','@angular/router','hls.js','rxjs','tslib','zone.js','@angular/build','@angular/cli','@angular/compiler-cli','@types/jasmine','baseline-browser-mapping','jasmine-core','karma','karma-chrome-launcher','karma-coverage','karma-jasmine','karma-jasmine-html-reporter','typescript']) { const j=require('./node_modules/'+p+'/package.json'); console.log(p+'|'+j.version+'|'+j.license) }"
```
