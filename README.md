# Tauri + Vanilla TS

This template should help get you started developing with Tauri in vanilla HTML, CSS and Typescript.

## SurrealDB Connection

The app defaults to the verified connection profile: `http://192.168.0.102:8000`, namespace `kasirpro-ns`, database `kasirpro_db`, user `root`, and password from the existing Docker datastore (`namikaze`). Override the password through `KASIRPRO_DB_PASSWORD` if it changes.

Override connection values in the environment before launching the app:

- `KASIRPRO_DB_URL`
- `KASIRPRO_DB_USERNAME`
- `KASIRPRO_DB_PASSWORD`
- `KASIRPRO_DB_NAMESPACE`
- `KASIRPRO_DB_NAME`

Keep the password out of source control and shell history. The app checks `/sql` using the namespace and database headers, and the header status shows the current connection result. An HTTP `401` with `The password did not verify` means the Docker credential does not match; use the actual container password or configure a new matching one in Docker.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
