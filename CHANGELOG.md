# Changelog

All notable changes to this extension are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.0] - 2026-10-26

### Added
- Automatic documentation updates on activation and every 24 hours, with validated offline storage, live autocomplete/hover/diagnostic refresh and a notification after successful updates. Disable `ikemenCodex.documentation.autoUpdate` to use the bundled data after reloading.

### Changed
- Refresh the bundled documentation for offline use, including nightly map indexes.

### Fixed
- Read optional parameters whose nightly tag follows the closing Markdown emphasis, including `index` in MapSet and MapAdd. Older documentation caches are rebuilt with the corrected parser.
- Recognize the idle move type `I` in MoveType, P2MoveType and PrevMoveType comparisons in CNS and ZSS.

## [0.2.1] - 2026-10-24

### Fixed
- Valid numeric ranges with mixed delimiters, such as `[3050, 3100)`, no longer participate in conventional bracket matching in CNS and ZSS. Symmetric ranges (`[a, b]` and `(a, b)`), grouping and function parentheses retain native bracket coloring. Mixed range delimiters use operator highlighting instead.
- Recognize the aggregate hit attributes `AA`, `AT` and `AP`, avoiding false unknown-trigger warnings for valid expressions such as `HitDefAttr = SC, AT`.

## [0.2.0] - 2026-10-23

### Added
- Context-aware Quick VS button: *Run Current Stage in Ikemen GO* for stage definitions, while retaining the character command for character files.
- A visible, disabled Quick VS button for system and lifebar definitions, with a guard against running them through commands.

### Changed
- Renamed the extension from Ikemen VS to **Ikemen Codex**, with package name `ikemen-codex` and repository links pointing to `rakieldev/Ikemen-Codex`.
- Renamed command IDs and settings from `ikemenVS.*` to `ikemenCodex.*`. Existing settings must be configured again under the new prefix. Uninstall the old extension before installing this package to avoid duplicate providers and commands.
- Quick VS button state updates when switching editors or editing a DEF file, including unsaved changes.

### Fixed
- Character detection now checks character file keys only inside `[Files]`, avoiding confusion with animation entries in system definitions.

## [0.1.0] - 2026-10-18

Initial release.

### Added
- Syntax highlighting for CNS, CMD, ST, CONST and DEF (`.cns`, `.cmd`, `.st`, `.const`, `.def`), AIR (`.air`) and ZSS (`.zss`).
- Outline, breadcrumbs and *Go to Symbol* for Statedefs and controllers (CNS), actions with frame counts (AIR) and StateDefs and functions (ZSS), including headers that span several lines.
- Autocomplete and hover documentation for state controllers, parameters and triggers, generated from the Ikemen GO Merged Documentation. Choosing a controller can insert a ready-to-fill template, or a full one with the optional parameters commented out.
- ZSS autocomplete for `if`, `for`, `let`, `ignoreHitPause` and `call` (functions declared in the file), with a setting for `camelCase` or documentation-style names.
- Warnings for duplicated parameters, unknown state controllers and unknown trigger names in `.cns`, `.cmd`, `.st` and `.zss` files.
- Warnings for missing ; between parameters or at the end of a let, call or assignment.
- *Run Current Character in Ikemen GO* command (Quick VS), with an editor button, plus *Stop Ikemen GO*.