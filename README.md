# ncm-desktop

> **Disclaimer**: This is an **unofficial** third-party desktop client. Not affiliated with NetEase, Inc. If you are a NetEase representative and find this project objectionable, please open an issue and it will be removed promptly.

An **unofficial** Linux desktop client for [NetEase Cloud Music](https://music.163.com), which works as a wrapper around the official web player.

## Installation

### NixOS / Nix

Run directly:

```bash
nix run github:lonerOrz/ncm-desktop
```

Or add as a flake input:

```nix
{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    ncm-desktop.url = "github:lonerOrz/ncm-desktop";
  };

  outputs =
    inputs@{
      self,
      flake-utils,
      nixpkgs,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [ inputs.ncm-desktop.packages.${system}.default ];
        };
      }
    );
}
```

Build locally:

```bash
nix build
# Binary at ./result/bin/ncm
```

### npm / electron-builder

Requirements: [Node.js](https://nodejs.org/).

```bash
npm install
npm run build      # Build package → dist/
npm start          # Or run directly without building
```
