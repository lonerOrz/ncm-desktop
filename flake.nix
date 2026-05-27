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
              pkgs.copyDesktopItems
              pkgs.pkgs.imagemagick
            ];

            desktopItems = [
              (pkgs.makeDesktopItem {
                name = "ncm-desktop";
                desktopName = "NetEase Cloud Music";
                exec = "ncm %U";
                icon = "ncm-desktop";
                categories = [
                  "AudioVideo"
                  "Music"
                ];
                terminal = false;
                startupWMClass = "NetEase Cloud Music";
              })
            ];

            installPhase = ''
              runHook preInstall

              mkdir -p $out/lib/${packageJSON.name}
              cp -r ${./src}/* $out/lib/${packageJSON.name}/
              cp ${./icon.png} $out/lib/${packageJSON.name}/icon.png

              for size in 16 24 32 48 64 128 256 512; do
                mkdir -p $out/share/icons/hicolor/"$size"x"$size"/apps
                magick convert -background none -resize "$size"x"$size" ${./icon.png} \
                  $out/share/icons/hicolor/"$size"x"$size"/apps/ncm-desktop.png
              done

              runHook postInstall
            '';

            postFixup = ''
              makeWrapper ${pkgs.electron}/bin/electron $out/bin/ncm \
                --add-flags "$out/lib/${packageJSON.name}/main.js" \
                --add-flags "${url}" \
                --set GTK_IM_MODULE "fcitx" \
                --set QT_IM_MODULE "fcitx" \
                --set XMODIFIERS "@im=fcitx" \
                --set ELECTRON_OZONE_PLATFORM_HINT "auto" \
                --add-flags "--enable-features=UseOzonePlatform,WaylandWindowDecorations" \
                --add-flags "--ozone-platform-hint=auto" \
                --add-flags "--enable-wayland-ime" \
                --add-flags "--gtk-version=3"
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
