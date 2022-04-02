# PICO-8 Language Server

Full language support for the [PICO-8](https://www.lexaloffle.com/pico-8.php)
dialect of Lua. 

The goal is to have all the features you'd expect in a full-fledged language
server, such as [the one for Lua](https://marketplace.visualstudio.com/items?itemName=sumneko.lua),
but specifically tailored for a frictionless PICO-8 experience.

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

## Planned features

- Hover support/signature help for user-defined functions/variables
- support for `#include`ing other files

# Changelog

## 0.3.2 (4/1/2022)

- Fixed plugin not working on Windows because of problem parsing CRLF line endings

## 0.3.1 (2/22/2022)

- Removed one of the leading 0's from the versioning scheme
- Added `stat` with docs to the builtins

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
