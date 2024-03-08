# PICO-8 Language Server

Full language support for the [PICO-8](https://www.lexaloffle.com/pico-8.php)
dialect of Lua. 

The goal is to have all the features you'd expect in a full-fledged language
server, such as [the one for Lua](https://marketplace.visualstudio.com/items?itemName=sumneko.lua),
but specifically tailored for a frictionless PICO-8 experience.

## Feature highlights

View docs on hover, then auto-complete and signature help:

![docs gif](https://github.com/japhib/pico8-ls/blob/master/img/docs.gif?raw=true)

Full support for `#include` statements:

![include gif](https://github.com/japhib/pico8-ls/blob/master/img/includes.gif?raw=true)

## Features

- Syntax highlighting
- Syntax errors
- Warnings on undefined variable usage
- Find symbol in document
- Go to definition
- Find references
- Hover support & signature help for built-in functions
- Auto-completion
- Support for `#include`ing other files
- Snippets for common idioms (functions, loops, etc) as well as pico-8 symbols (`p8-jelpi` -> 🐱, `p8-x-key` -> ❎, etc)
- Code formatting

## Support for other platforms

This extension uses the [Language Server Protocol](https://microsoft.github.io/language-server-protocol/),
so while it's mainly made for VSCode, it could also be used for other editors
such as NeoVim, Atom, etc.

I don't have any experience setting up language extensions for platforms other than VSCode, so currently
looking for help with that. See tips and support thread on the issue for various editors:
- [Neovim](https://github.com/japhib/pico8-ls/issues/34)

### Sublime Text

Instructions for running pico8-ls with Sublime Text. **Warning:** these instructions are valid only if you use ```.lua ``` files for your code. If you want to edit directly a ```.p8``` file the following instructions will not work, and it is better to look for an alternative such as the package [https://github.com/wh0am1-dev/sublime-PICO-8](https://github.com/wh0am1-dev/sublime-PICO-8).

1. Clone the repo

```
git clone https://github.com/japhib/pico8-ls
```

2. Go to ```pico8-ls/server``` folder and install the ```npm``` dependencies.

```
cd pico8-ls
cd server
npm install
```

3. Compile the app to a binary:

```
npm run compile
```

4. Make a script to launch the server, and put it on somewhere in your *$PATH*:

```
echo -e '#!/usr/bin/env bash\n'"node $PWD/out/server.js" '"$@"' > ~/.local/bin/pico8-ls
chmod +x ~/.local/bin/pico8-ls
```

Now, in Sublime text, make sure you have the package [https://github.com/sublimelsp/LSP/](https://github.com/sublimelsp/LSP/) installed.

In ST go to *Preferences-> Package Settings-> LSP-> Settings*, and add this code to your settings:

```json
	"clients":
    {
        "pico8-lua": {
            "enabled": true,
            "command": ["pico8-ls","--stdio"],
            "selector": "source.lua",
        },
    }
```


Some of this information is taken from this thread: [https://github.com/japhib/pico8-ls/issues/44](https://github.com/japhib/pico8-ls/issues/44)

## Changelog

[Changelog has been moved to a separate file.](https://github.com/japhib/pico8-ls/blob/master/CHANGELOG.md)

## Development

Please follow the official [Language Server Extension Guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)
to understand how to develop VS Code language server extension.

## Credits

PICO-8 Lua parser based on https://github.com/fstirlitz/luaparse (heavily updated & ported to Typescript by @japhib)

[PICO-8](https://www.lexaloffle.com/pico-8.php) by Lexaloffle Games
