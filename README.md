# PICO-8 Language Server

A language server implementation for PICO-8. Includes a VSCode client extension
that automatically sets up and runs the language server. Since it's a language
server, it could also be easily set up for use in other editors like Vim, Atom,
etc.

The goal is to have all the features you'd expect in a full-fledged language
server, such as [the one for Lua](https://marketplace.visualstudio.com/items?itemName=sumneko.lua),
but specifically tailored for a frictionless PICO-8 experience.

This includes working with other people's cartridges that may or may not be
using the same coding environment. For instance, it will include a formatter
so that code written in a very tight style inside the PICO-8 code editor can
be easily changed to normal wide-whitspace-style.

## Implemented Features

- Syntax highlighting
- Syntax errors
- Find symbol in document
- Go to definition
- Find references

## Planned features

- Hover support for showing docs, both for built-in and user functions
- Auto-completion
- `#include` files
- Signature help
- Code formatter
- Diagnostics such as usage of undefined variables/functions, redefining a
  local, etc.

## Ideas for other features (may or may not get implemented)

- Code action to transform something like this:
```lua
a,b,c = 1,2,3
```
into this:
```lua
a = 1
b = 2
c = 3
```
- Intellisense telling you stats of the current file (tokens, characters)
- Minify the current file
- Outline based on function names and/or the `-->8` PICO-8 tab indicator
- Code action to launch PICO-8 on the currently edited cart - and capture `printh` output to debug console

Other helpful snippets for frequently looked-up stuff:
- List out all numbers for input buttons and colors
- Memory locations
- Basic empty cartridge file template

# Changelog

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
