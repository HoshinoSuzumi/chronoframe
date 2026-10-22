# Licensing

## Default license

Copyright (c) 2026 ChronoFrame and contributors.

Unless a file or package carries a separate license notice, the original code
in this repository is licensed under the GNU Affero General Public License,
version 3 only (SPDX-License-Identifier: **AGPL-3.0-only**). See [LICENSE](LICENSE)
for the complete license text. No option to use a later AGPL version is granted.

This default covers the Self-hosted application, shared console and gallery
layers, business and infrastructure packages, tests, and build and deployment
scripts. Future SaaS applications and packages in this repository use the same
default unless explicitly licensed otherwise. Repository-maintained documentation
also uses this default unless separately identified; user-uploaded photos and
other user content are not licensed by this document.

## Package exceptions

| Path                    | License                                               |
| ----------------------- | ----------------------------------------------------- |
| `packages/contracts/`   | MIT; see its [LICENSE](packages/contracts/LICENSE).   |
| `packages/webgl-image/` | MIT; see its [LICENSE](packages/webgl-image/LICENSE). |

All other current workspace packages use AGPL-3.0-only for this version.
An MIT exception applies to that package's own material; it does not change the license of AGPL-covered code used with it.
These are licenses for different parts, not a choice between MIT and AGPL for
the same new code. Preserve file-level and third-party notices where applicable.

## Previously released MIT code

The parent of the license-transition commit is
[`79db805f524d793a08acf6ca5ca2a675ca4da00b`](https://github.com/HoshinoSuzumi/chronoframe/commit/79db805f524d793a08acf6ca5ca2a675ca4da00b).
That commit and earlier versions distributed under MIT remain available under
their original MIT terms. This change does not revoke permissions already granted,
including rights to use, modify, redistribute, sublicense, or commercially host
those MIT versions.

The original MIT notice is reproduced below. Preserve it when redistributing
covered historical material. This transition does not grant MIT rights to
subsequent AGPL-only additions or changes, or relicense third-party material
contrary to its existing terms.

```text
MIT License

Copyright (c) 2025 Timothy Yin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Network use and commercial licensing

Commercial use, including paid hosting, is permitted under the AGPL subject to
its applicable requirements. In particular, section 13 addresses offering the
Corresponding Source of a modified version to users interacting with it remotely
over a network. Provide the source corresponding to the version you operate
when required, rather than only linking to an unrelated upstream version.
The AGPL does not require disclosure of user photos, credentials, or unrelated
independent software merely because they are used on the same infrastructure.

Separate commercial licenses may be available from **ChronoFrame** for rights
ChronoFrame owns or is authorized to license. Contact
[contact@chronoframe.art](mailto:contact@chronoframe.art). A commercial license
requires a separate agreement; this repository does not itself grant one.
Commercial use alone does not require purchasing a commercial license.

Official SaaS applications are not automatically exempt from obligations attached
to third-party or contributed code. Any alternative licensing depends on the
actual rights obtained from the relevant rights holders. Merely moving code into
a separate package or process does not determine its license obligations.

## Contributions and third-party material

Contributions are proposed under the license applicable to the files or packages
being changed. This does not by itself grant additional proprietary relicensing
rights. Any separate contributor agreement must be presented and accepted through
the project's designated process; it must not be inferred from a pull request
alone. See [CONTRIBUTING.md](CONTRIBUTING.md).

Third-party dependencies, copied material, fonts, icons, and other assets retain
their respective licenses and notices. This file is not a complete dependency
license inventory. Preserve required third-party notices and include the notices
for the actual dependencies shipped in a distribution.

No trademark rights or permission to imply official endorsement by ChronoFrame
are granted by this document.

## Distributions

Workspace packages carry their own LICENSE, including historical MIT notices
where applicable. Keep these files in published archives. The Self-hosted image
includes LICENSE and LICENSING.md under `/app`; these files do not replace any
duty to provide Corresponding Source.
