#!/bin/sh
# Update the PDF.js generic build files

repo='https://github.com/mozilla/pdf.js'
schema_path='/extensions/chromium/preferences_schema.json'

release=$(curl -sLI "$repo/releases/latest" -w '%{url_effective}' -o /dev/null)
version=$(basename "$release")
current=$(awk -F= '/version/ {print $2}' VERSION)
[ "${version#v}" = "$current" ] && exit

echo "Updating to $version..."
git checkout -q stable
zip_file="pdfjs-${version#v}-legacy-dist.zip"
curl -fLO "$repo/releases/download/$version/$zip_file"
echo 'Extracting files...'
unzip -qo "$zip_file" || exit
curl -fLO "$repo/raw/refs/tags/$version/$schema_path"

build=$(awk -F= '/pdfjsBuild/ {print $2}' build/pdf.mjs | tr -d ' ";')
sed -i '' -e "s/$current/${version#v}/; s/\(build=\).*/\1$build/" VERSION

echo "Committing to repo..."
git add .
git commit -m "Update PDF.js to legacy $version"
git checkout main
git merge stable -m "Merge branch 'stable': update PDF.js to $version"
