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
- Find usages

## Planned features

- Hover support for showing docs, both for built-in and user functions
- Auto-completion
- `#include` files
- Signature help
- Code formatter
- Diagnostics such as usage of undefined variables/functions, redefining a
  local, etc.

# Changelog

## 0.0.2 (future)

- Go to definition
- Find usages

## 0.0.1 (1/23/2022)

First release, very basic feature set:
- Syntax highlighting
- Syntax errors
- Go to symbol