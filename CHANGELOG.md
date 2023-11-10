# Changelog

## 0.5.3 (11/10/2023)

- Add support for code folding using `#region` comments ([#49](https://github.com/japhib/pico8-ls/pull/49)) - thanks [@TheCyberRonin](https://github.com/TheCyberRonin)!

## 0.5.2 (9/26/2023)

- Fix for auto-complete duplicating table name & access operator ([#40](https://github.com/japhib/pico8-ls/issues/40))
- Fix for auto-complete after table name showing _all_ auto-completions rather than just the ones for that table ([#25](https://github.com/japhib/pico8-ls/issues/25))
- Fix for snippets not working in `.lua` files ([#46](https://github.com/japhib/pico8-ls/pull/46) - thanks [@davidreif](https://github.com/davidreif)!)

## 0.5.1 (9/15/2023)

- Fixes formatting of single-line if statements with an `else` block
- Fixes formatting of `repeat ... until` loops ([#43](https://github.com/japhib/pico8-ls/issues/43))

## 0.5.0 (5/18/2023)

- Formatter has been released! Thanks to [@beetrootpaul](https://github.com/beetrootpaul) for major contributions in this feature.
- Closes [#26](https://github.com/japhib/pico8-ls/issues/26)
- Formatter is accessible through regular "Format Document" feature (Alt + Shift + F by default)
- Also accessible through Command Palette, with `PICO-8 LS: Format File - Each Statement on Separate Line` command. This version of the formatter will ensure that each statement is on a separate line, as opposed to the normal one which will keep statements on the same line.
- Works on both `.lua` and `.p8` files!

## 0.4.10 (12/22/2022)

- Add snippets for pico-8 glyphs ([#30](https://github.com/japhib/pico8-ls/issues/30)) - thanks to [@mika76](https://github.com/mika76) for the contribution!
- Fix for labels being marked undefined unless defined before goto ([#32](https://github.com/japhib/pico8-ls/issues/32))

## 0.4.9 (12/17/2022)

- Add `reset` and `info` built-in function calls ([#36](https://github.com/japhib/pico8-ls/pull/36)) - thanks to [@miguno](https://github.com/miguno) for the contribution!

## 0.4.8 (9/23/2022)

- Fixed snippets
- Added working indentation rules based on the other [pico8vscodeeditor](https://github.com/grumpydev/pico8vscodeeditor) extension

## 0.4.6 (7/27/2022)

- Fix file URI resolution for Windows (fixes go-to-definition and find-references) ([#20](https://github.com/japhib/pico8-ls/issues/20))
	- (0.4.7) Apply same fix in places that were missed before ([#22](https://github.com/japhib/pico8-ls/issues/22))

## 0.4.4 (6/15/2022)

- Support for binary literals like `0b0101101001011010.1` ([#10](https://github.com/japhib/pico8-ls/issues/10))
- (0.4.5) Added auto-complete demo in readme

## 0.4.3 (6/9/2022)

- Fix shorthand ? print function messing up document outline ([#17](https://github.com/japhib/pico8-ls/issues/17))

## 0.4.2 (6/6/2022)

- Fix warning on shorthand ? print function
- Fix warning on labels and gotos ([#16](https://github.com/japhib/pico8-ls/issues/16))
- Add support for `extcmd`, `yield`, and a few other missing built-in functions ([14](https://github.com/japhib/pico8-ls/issues/14))

## 0.4.1 (6/2/2022)

- Better support for `#include`ing files -- files included by other files now have the same global scope. Go to definition and find usages works both from the including file, and from the included file. (Previously only worked from the including file.) ([#3](https://github.com/japhib/pico8-ls/issues/3))
- Fix code folding ([#15](https://github.com/japhib/pico8-ls/issues/15))

## 0.4.0 (5/26/2022)

- Add support for `#include`ing files ([#3](https://github.com/japhib/pico8-ls/issues/3), [#8](https://github.com/japhib/pico8-ls/issues/8))
- Add support for built-in global symbols like ❎, 🅾️, and ░ ([#9](https://github.com/japhib/pico8-ls/issues/9))

## 0.3.3 (4/6/2022)

- Add support for [P8SCII](https://pico-8.fandom.com/wiki/P8SCII) control codes in string literals ([#7](https://github.com/japhib/pico8-ls/issues/7))
- Added built-in t() and time() functions ([#2](https://github.com/japhib/pico8-ls/issues/2))

## 0.3.2 (4/1/2022)

- Fixed plugin not working on Windows because of problem parsing CRLF line endings ([#5](https://github.com/japhib/pico8-ls/issues/5))

## 0.3.1 (2/22/2022)

- Removed one of the leading 0's from the versioning scheme
- Added `stat` with docs to the builtins ([#1](https://github.com/japhib/pico8-ls/issues/1))

## 0.0.3 (2/7/2022)

- Hover support for built-in functions
- Auto-completion
- Signature help
- Disabling warnings for unused locals until bugs are fixed
- Remove some warnings about Unicode characters left over from luaparse library

## 0.0.2 (1/31/2022)

- Started using esbuild for bundling extension (should improve install/load performance)
- Go to definition
- Find references
- Warnings for undefined globals, unused locals
- Snippets for commonly typed patterns (if, then, function)

## 0.0.1 (1/23/2022)

First release, very basic feature set:
- Syntax highlighting
- Syntax errors
- Go to symbol
