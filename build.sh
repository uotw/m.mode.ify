sudo rm -rf mmodeify-darwin-x64/
electron-packager . "M.mode.ify" --platform=darwin --arch=x64 --icon="/Users/ben/Documents/98765432_Janus_20140127_124547/mmodeify/icon.icns" --overwrite
#cp icon.icns SonoClipShare\ Uploader-darwin-x64/SonoClipShare\ Uploader.app/Contents/Resources/electron.icns
open M.mode.ify-darwin-x64
