# Portfolio verification

Verified on September 24, 2026, against this repository copy.

| Check | Result |
| --- | --- |
| Existing JavaScript calculation and workflow tests | 15 passed, 0 failed |
| Native Swift launcher compilation | Passed on Apple Silicon, Swift 6.3.3, with Swift 5 language mode |
| Installer shell syntax | Passed |
| Browser visual review | Not performed; the environment blocked local preview access |
| Native app launch, file dialogs, and actual backup persistence | Not exercised in this review |
| GitHub-hosted CI | Configuration prepared; not yet run on GitHub |

JavaScript tests used Node.js 24.19.0. The CI configuration requests Node.js 24; that specific runner environment has not yet executed the suite.

The native check compiled the launcher into a temporary build folder. It did not install the app, run the installer, open an existing workspace, or modify user data. Compilation is not a claim of complete macOS runtime validation.

The original application implementation and its 15 tests were retained. Portfolio preparation added documentation, ignore rules, and CI configuration. No personal workspace or backup is included.
