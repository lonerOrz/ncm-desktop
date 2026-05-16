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

      packageJSON = builtins.fromJSON (builtins.readFile ./package.json);

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
            pname = packageJSON.name;
            version = packageJSON.version;

            src = ./.;

            nativeBuildInputs = [
              pkgs.makeWrapper
              pkgs.electron
            ];

            installPhase = ''
              runHook preInstall

              # application code
              mkdir -p $out/lib/${packageJSON.name}
              cp -r ${./src}/* $out/lib/${packageJSON.name}/
              cp ${./icon.png} $out/lib/${packageJSON.name}/icon.png

              # xdg desktop entry
              install -Dm644 ${./com.netease.cloud-music.desktop} \
                $out/share/applications/com.netease.cloud-music.desktop

              # icon (xdg-compliant path)
              install -Dm644 ${./icon.png} \
                $out/share/icons/hicolor/512x512/apps/com.netease.cloud-music.png

              runHook postInstall
            '';

            postFixup = ''
              makeWrapper ${pkgs.electron}/bin/electron $out/bin/ncm \
                --add-flags "$out/lib/${packageJSON.name}/main.js" \
                --add-flags "${url}" \
                --set NIXOS_OZONE_WL 1 \
                --set ELECTRON_DISABLE_GPU 1 \
                --set LIBGL_ALWAYS_SOFTWARE 1 \
                --set MESA_LOADER_DRIVER_OVERRIDE llvmpipe \
                --set ELECTRON_NO_SANDBOX 1 \
                --set ELECTRON_DISABLE_SANDBOX 1
            '';

            meta = {
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
