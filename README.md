# PICO-8 Language Server

Full language support for the [PICO-8](https://www.lexaloffle.com/pico-8.php)
dialect of Lua. 

The goal is to have all the features you'd expect in a full-fledged language
server, such as [the one for Lua](https://marketplace.visualstudio.com/items?itemName=sumneko.lua),
but specifically tailored for a frictionless PICO-8 experience.

# Feature highlights

Full support for `#include` statements:

![include gif](https://github.com/japhib/pico8-ls/blob/master/img/includes.gif?raw=true)

### Technical Note

This extension uses the [Language Server Protocol](https://microsoft.github.io/language-server-protocol/),
so while it's mainly made for VSCode, it could also be used for other editors
such as NeoVim, Atom, etc.

## Implemented Features

- Syntax highlighting
- Syntax errors
- Warnings on undefined variable usage
- Find symbol in document
- Go to definition
- Find references
- Hover support for built-in functions
- Auto-completion
- Signature help
- support for `#include`ing other files

## Planned features

- Snippets for common idioms (functions, loops, #include, etc.)
- Hover support/signature help for user-defined functions/variables

# Changelog

## 0.4.4 (6/15/2022)

- Support for binary literals like `0b0101101001011010.1` ([#10](https://github.com/japhib/pico8-ls/issues/10))

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

# Credits

PICO-8 Lua parser based on https://github.com/fstirlitz/luaparse

[PICO-8](https://www.lexaloffle.com/pico-8.php) by Lexaloffle Games
