# Ikemen VS

Language support for **Ikemen GO** (and MUGEN) character code in VS Code and VSCodium: syntax highlighting, outline, autocomplete with documentation, a few safe warnings, and a button to test the current character in the engine.

It only handles the **text** files. Sprites and sounds (`.sff`, `.snd`) are not opened or edited.

## Supported files

| Files | Language |
| --- | --- |
| `.cns` `.cmd` `.st` | Ikemen CNS (highlighting, outline, autocomplete, warnings) |
| `.def` `.const` | Ikemen CNS (highlighting and outline) |
| `.air` | Ikemen AIR (highlighting and outline) |
| `.zss` | Ikemen ZSS (highlighting, outline, autocomplete, warnings) |

## Features

- **Highlighting** for all of the above.
- **Outline, breadcrumbs and *Go to Symbol*** (`Ctrl+Shift+O`): Statedefs with the controllers inside them, AIR actions with their frame count, ZSS StateDefs and functions. The title comes from the comment block right above each header.
- **Autocomplete and hover** for state controllers, their parameters and triggers, with the description from the documentation:
  - In CNS, type `type = ` inside a `[State ...]` block. Picking a controller can insert a template (`trigger1` plus the required parameters); the *(all parameters)* entry also adds the optional parameters, commented out.
  - In ZSS, controllers are suggested at the start of a statement and parameters inside `name { ... }`. Conditions get triggers, `call` gets functions from the current character's referenced ZSS files, and `if` / `for` / `let` / `ignoreHitPause` insert their block.
  - Suggestions are only offered inside `[State ...]` blocks (CNS) and ZSS code, never in `.def` files or other sections.
- **Diagnostics** in `.cns`, `.cmd`, `.st` and `.zss` files:
  1. a parameter set twice in the same controller,
  2. an unknown state controller name,
  3. an unknown trigger name in a trigger line or condition,
  4. in ZSS only, a missing `;` between parameters or at the end of a `let`, `call` or assignment,
  5. in ZSS only, unmatched braces, unterminated strings and unclosed section headers,
  6. in ZSS only, `break` / `continue` outside loops and repeated `default` branches in one `switch`,
  7. in ZSS only, duplicate literal StateDef numbers, function definitions or names within a declaration list in the same file.

  The first three checks produce warnings; the ZSS syntax checks produce errors. The last parameter before a controller's `}` does not need a semicolon. Reassigning a local with `let` and repeating the discard name `_` in argument/declaration lists are allowed. StateDef numbers based on constants are not compared, and functions defined in other files are not resolved.

  Parameter names and values are *not* checked, because the documentation does not cover every alias and nightly-only syntax. Nothing is ever reported in `.def`, `.const` or `.air` files.
- **ZSS function completion across files**: `call` suggests functions from the character's ZSS files referenced by its `.def`, including unsaved edits. Functions from other characters are kept separate. If the character cannot be identified unambiguously, only functions in the current file are suggested.
- **Run in Ikemen GO**: the play button in the editor title bar (or the command palette) starts a Quick VS with the character you are editing, and *Stop Ikemen GO* closes it. The engine output shows in the *Ikemen GO* output panel.

## Quick start

1. Install the extension (`.vsix`: *Extensions* view, `...` menu, *Install from VSIX...*).
2. Open a character folder and a `.cns`, `.cmd`, `.zss` or `.air` file.
3. To use the run button, set **`ikemenVS.ikemen.executable`** (for example `D:\Ikemen\Ikemen_GO.exe`). The rest has working defaults.

## Commands

| Command | What it does |
| --- | --- |
| `IkemenVS: Run Current Character in Ikemen GO` | Character being edited as player 1, opponent as player 2 |
| `IkemenVS: Run Current Character as Player 2 in Ikemen GO` | Same, with the sides swapped |
| `IkemenVS: Stop Ikemen GO` | Closes the running engine |

The character is found automatically: the extension looks for the `.def` of the character next to the open file (and up to two folders above, so files in a `states/` folder work too). If the open file is a stage `.def`, the stage is tested instead, with the opponent on both sides. By default, open files with an existing path are saved before running. If saving fails or is cancelled, the extension shows an error and cancels the run. Disable `ikemenVS.ikemen.saveBeforeRun` to run without saving.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `ikemenVS.ikemen.executable` | `""` | Path to the Ikemen GO executable. User settings only. |
| `ikemenVS.ikemen.opponent` | `kfm_zss` | Opponent character: a name or a `.def` path. Also used on both sides when testing a stage. |
| `ikemenVS.ikemen.opponentAI` | `0` | AI level of the opponent (0 = none, 1 to 8). |
| `ikemenVS.ikemen.stage` | `""` | Stage to use, for example `stages/stage0.def`. Empty uses the engine default. |
| `ikemenVS.ikemen.extraArgs` | `[]` | Extra command line options, for example `["-windowed", "-nomusic"]`. |
| `ikemenVS.ikemen.saveBeforeRun` | `true` | Save all open files before running. |
| `ikemenVS.zss.nameStyle` | `camelCase` | `camelCase` inserts `modifyExplod` / `stateNo`; `documentation` inserts `ModifyExplod` / `StateNo`. |
| `ikemenVS.diagnostics.enabled` | `true` | Turn all diagnostics on or off. |
| `ikemenVS.diagnostics.unknownTriggers` | `true` | Report unknown trigger names. |
| `ikemenVS.diagnostics.ignoredNames` | `[]` | Controller or trigger names that must never be reported (useful for names missing from the data). |
| `ikemenVS.diagnostics.missingSemicolons` | `true` | Report missing ZSS statement terminators and separators between controller parameters. |

The command line options come from the *Miscellaneous info* page of the Ikemen GO wiki.

## Documentation data

The descriptions, parameters and trigger lists come from the [Ikemen GO Merged Documentation](https://potsmugen.github.io/ikemen-merged-docs/) and are bundled with the extension: nothing is downloaded while you work. They are refreshed in new releases. Entries that only exist in the Ikemen GO nightly build are labeled "nightly" in the suggestion and hover boxes.

## Credits

- The documentation text bundled with the extension comes from the [Ikemen GO Merged Documentation](https://potsmugen.github.io/ikemen-merged-docs/), which merges the Ikemen GO wiki and the MUGEN 1.1 documentation, and is used under its MIT license.
- Ikemen GO is developed by the [Ikemen GO team](https://github.com/ikemen-engine/Ikemen-GO). MUGEN is by Elecbyte.

## License

[MIT](LICENCE) © Rakíel
