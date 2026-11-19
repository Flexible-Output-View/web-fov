# Dependency tracking (OWASP Dependency-Track)

`web-fov` publishes CycloneDX SBOMs to a self-hosted
[OWASP Dependency-Track](https://dependencytrack.org) server after every
dependency change. The backend and the Angular frontend are tracked as **two
separate projects**, so each portfolio only shows its own dependencies and
vulnerabilities.

The shared server and its bootstrap tooling live in
`/Users/raphael/Code/DependencyTrack` (see its `README.md`).

## Projects

| Dependency-Track project | Workspace | BOM |
| ------------------------ | --------- | --- |
| `web-fov-backend` | `backend/` | `sbom/web-fov-backend.cdx.json` |
| `web-fov-frontend` | `fov-angular/` | `sbom/web-fov-frontend.cdx.json` |

Both use the version `dev` (matching the default branch). Separating the
projects avoids mixing server-side and browser-side components, which have
different risk profiles and release cadences.

## Local usage

```bash
# 1. Generate one SBOM per workspace into ./sbom
./scripts/generate-sbom.sh

# 2. Upload each one to its project
#    (server must be running, see /Users/raphael/Code/DependencyTrack)
export DEPENDENCY_TRACK_URL=http://localhost:8081
export DEPENDENCY_TRACK_API_KEY=...   # from DependencyTrack/integration.env

./scripts/upload-sbom.sh --project web-fov-backend  --version dev sbom/web-fov-backend.cdx.json
./scripts/upload-sbom.sh --project web-fov-frontend --version dev sbom/web-fov-frontend.cdx.json
```

`generate-sbom.sh` uses `@cyclonedx/cyclonedx-npm` with
`--package-lock-only`, so it reads `backend/package-lock.json` and
`fov-angular/package-lock.json` and does not depend on `node_modules`.

`sbom/` is git-ignored: SBOMs are build outputs, not sources.

## CI

`.github/workflows/dependency-track.yml` runs on:

* pushes to `main`/`dev` that touch a `package.json`/`package-lock.json`,
* pull requests targeting `main`/`dev` that touch dependency files,
* a weekly schedule and manual dispatch.

It generates both SBOMs, archives them as the `sbom-cyclonedx` artifact, and
uploads each one to its project when these repository secrets exist:

| Secret | Description |
| ------ | ----------- |
| `DEPENDENCY_TRACK_URL` | API base URL reachable from GitHub runners |
| `DEPENDENCY_TRACK_API_KEY` | API key of the `ci` team (`BOM_UPLOAD`) |

Missing secrets are not an error: the workflow still produces the artifacts
and logs that the upload was skipped.

## Limits / next steps

* The inventory is source-level (npm lockfiles). OS packages in the
  `backend`/`frontend` Docker images are not covered yet; container-image SBOMs
  (`syft` on the built images) could be uploaded to the same projects.
* `demo-publisher` has no package manager and is currently out of scope.
* Vulnerability matching for npm comes from the NVD feeds plus the OSV npm
  mirror, which `DependencyTrack/scripts/bootstrap.sh` enables
  (`google.osv.enabled=npm`).
