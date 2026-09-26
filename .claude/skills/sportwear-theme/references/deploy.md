# Deploying the theme to the store (without the GitHub integration)

The Shopify MCP connector can write theme files only to **unpublished** themes. It blocks theme
publishing, theme deletion and `themeFilesDelete`, so never create throwaway files in a theme: they
can't be removed from here. The dev theme is recorded in `catalog/store-setup.json`.

Always run the gates first (`npm run theme:validate`, `npm run theme:check`, `npm run i18n:check`,
`npm run format:check`). `theme:check` includes Shopify's upload-time schema rules
(`scripts/schema-rules.mjs`); a file that breaks one is dropped silently on upload.

## A new theme from the whole repo

1. `npm run theme:pack` writes `qa-output/theme.zip` (theme folders only).
2. `stagedUploadsCreate` with `{ resource: FILE, filename: "sportwear-theme.zip", mimeType:
   "application/zip", httpMethod: PUT }`.
3. `curl -X PUT -H "Content-Type: application/zip" --upload-file qa-output/theme.zip "<url>"`.
4. `themeCreate(source: "<resourceUrl>", name: "…", role: UNPUBLISHED)`, then poll
   `theme(id) { processing processingFailed files(first: 250) { nodes { filename } } }` and compare
   the file list with the zip. Files Shopify rejected are simply missing.

## Updating files in the dev theme

1. `stagedUploadsCreate` with one `{ resource: FILE, filename, mimeType, httpMethod: PUT }` per file.
2. Put `<theme path> <signed url>` lines in a text file and run `scripts/theme/put-staged.sh <file>`.
3. `themeFilesUpsert(themeId, files: [{ filename, body: { type: URL, value: "<resourceUrl>" } }])`.
   It returns a job; the upload happens in the background.
4. Check `theme(id) { files(filenames: [...]) { nodes { filename size updatedAt } } }`. A file whose
   `updatedAt` did not change was rejected. To see why, upsert it once with `body: { type: TEXT }`:
   text upserts are validated synchronously and return the error message.

Upload sections and snippets before the templates and locale files that reference them, and schema
locale files before sections that use new `t:` keys.

## When the owner publishes the dev theme

The connector blocks writes to the live theme, and our rule forbids them anyway. Once the owner
publishes the dev theme, make a new one before the next deploy:

1. Compare a few live checksums (`templates/index.json`, the section groups, the locale files) with
   the repo at `deployed_commit`, so you know whether the owner changed anything in the editor.
2. `themeDuplicate(id: <live theme>, name: "SportWear (next)")` copies the live theme with every
   editor change in it. Poll `theme(id) { processing processingFailed }` until it is ready.
3. Record the new ID in `catalog/store-setup.json` and `CLAUDE.md` (`SW_PREVIEW_THEME_ID`), then
   deploy the files changed since the live commit.
4. Tell the owner that editor changes made in the live theme from now on are not in the copy:
   edit the copy instead, or ask for a sync before publishing it.
