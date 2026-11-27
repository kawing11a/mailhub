fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new()
                .commands(&["get_server_connection", "connect_to_server"]),
        ),
    )
    .expect("failed to build Tauri application");
}
