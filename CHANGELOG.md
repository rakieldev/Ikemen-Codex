# Changelog

All notable changes to this extension are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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