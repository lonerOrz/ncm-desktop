{
  description = "NetEase Cloud Music Desktop - Electron wrapper";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];

      forAllSystems = nixpkgs.lib.genAttrs systems;

      url = "https://music.163.com/st/webplayer";

    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          lib = pkgs.lib;

        in
        {
          default = self.packages.${system}.ncm-desktop;

          ncm-desktop = pkgs.stdenv.mkDerivation {
            pname = "ncm-desktop";
            version = "1.0.0";

            src = ./.;

            nativeBuildInputs = [
              pkgs.makeWrapper
            ];

            installPhase = ''
              mkdir -p $out/bin $out/lib/ncm-desktop

              cp ${./src/main.js}    $out/lib/ncm-desktop/main.js
              cp ${./src/preload.js} $out/lib/ncm-desktop/preload.js
              cp ${./icon.png}       $out/lib/ncm-desktop/icon.png

              makeWrapper ${pkgs.electron}/bin/electron $out/bin/ncm \
                --add-flags "$out/lib/ncm-desktop/main.js" \
                --add-flags "${url}" \
                --set NIXOS_OZONE_WL 1 \
                --set ELECTRON_DISABLE_GPU 1 \
                --set LIBGL_ALWAYS_SOFTWARE 1 \
                --set MESA_LOADER_DRIVER_OVERRIDE llvmpipe \
                --set ELECTRON_NO_SANDBOX 1 \
                --set ELECTRON_DISABLE_SANDBOX 1
            '';

            meta = with lib; {
              description = "NetEase Cloud Music desktop client (Electron wrapper)";
              homepage = "https://music.163.com";
              license = lib.licenses.gpl3Plus;
              platforms = lib.platforms.linux;
              maintainers = with lib.maintainers; [ lonerOrz ];
              mainProgram = "ncm";
            };
          };
        }
      );
    };
}
