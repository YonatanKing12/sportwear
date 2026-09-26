#!/usr/bin/env bash
# Uploads theme files to Shopify staged-upload URLs.
# Input: a text file with one "<theme file path> <signed PUT url>" pair per line, where each URL comes
# from stagedUploadsCreate (resource FILE, httpMethod PUT). Prints the HTTP status per file.
# Then call themeFilesUpsert with body { type: URL, value: <the URL without its query string> }.
set -euo pipefail
targets="${1:?usage: scripts/theme/put-staged.sh <targets.txt>}"
while read -r file url; do
  [ -z "${file:-}" ] && continue
  case "$file" in
    *.json) type=application/json ;;
    *.css) type=text/css ;;
    *.js) type=text/javascript ;;
    *.woff2) type=font/woff2 ;;
    *) type=text/plain ;;
  esac
  status=$(curl -sS -o /dev/null -w "%{http_code}" -X PUT -H "Content-Type: $type" --upload-file "$file" "$url")
  echo "$status $file"
done < "$targets"
