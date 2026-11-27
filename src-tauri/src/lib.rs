mod connection;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    webview::WebviewWindowBuilder,
    AppHandle, Manager, WebviewUrl, WindowEvent,
};
use tauri_plugin_opener::OpenerExt;

const SETTINGS_WINDOW: &str = "settings";
const MAIL_WINDOW: &str = "mail";

#[tauri::command]
fn get_server_connection(window: tauri::WebviewWindow) -> Result<Option<String>, String> {
    require_settings_window(&window)?;
    connection::load(&window.app_handle())
        .map(|connection| connection.map(|value| value.url().as_str().to_string()))
}

#[tauri::command]
fn connect_to_server(
    app: AppHandle,
    window: tauri::WebviewWindow,
    server_url: String,
) -> Result<(), String> {
    require_settings_window(&window)?;
    let connection = connection::ServerConnection::parse(&server_url)?;
    connection::save(&app, &connection)?;
    open_mail_window(&app, &connection).map_err(|error| error.to_string())?;
    Ok(())
}

fn require_settings_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == SETTINGS_WINDOW {
        Ok(())
    } else {
        Err("This native action is available only from server settings.".into())
    }
}

fn open_mail_window(app: &AppHandle, connection: &connection::ServerConnection) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(MAIL_WINDOW) {
        window.navigate(connection.url().clone())?;
        window.show()?;
        window.set_focus()?;
        return Ok(());
    }

    let app_handle = app.clone();
    let trusted_origin = connection.url().origin();
    WebviewWindowBuilder::new(
        app,
        MAIL_WINDOW,
        WebviewUrl::External(connection.url().clone()),
    )
    .title("MailHub")
    .inner_size(1380.0, 900.0)
    .min_inner_size(820.0, 600.0)
    .resizable(true)
    .disable_drag_drop_handler()
    .on_navigation(move |url| {
        if url.origin() == trusted_origin {
            return true;
        }

        if url.scheme() == "https" || url.scheme() == "http" {
            if let Err(error) = app_handle
                .opener()
                .open_url(url.as_str(), None::<&str>)
            {
                eprintln!("Could not open external link: {error}");
            }
        }
        false
    })
    .build()?;
    Ok(())
}

fn open_server_in_browser(app: &AppHandle) {
    let Ok(Some(connection)) = connection::load(app) else {
        return;
    };
    let _ = app
        .opener()
        .open_url(connection.url().as_str(), None::<&str>);
}

fn show_settings(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn app_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let settings = MenuItem::with_id(app, "server-settings", "Server settings", true, None::<&str>)?;
    let browser = MenuItem::with_id(
        app,
        "open-in-browser",
        "Sign in or manage accounts in browser",
        true,
        None::<&str>,
    )?;
    let reload = MenuItem::with_id(app, "reload-mailhub", "Reload MailHub", true, None::<&str>)?;
    let quit = PredefinedMenuItem::quit(app, Some("Quit MailHub"))?;
    let submenu = Submenu::with_items(app, "MailHub", true, &[&settings, &browser, &reload, &quit])?;
    Menu::with_items(app, &[&submenu])
}

fn handle_menu_event(app: &AppHandle, id: &str) {
    match id {
        "server-settings" => show_settings(app),
        "open-in-browser" => open_server_in_browser(app),
        "reload-mailhub" => {
            if let Some(window) = app.get_webview_window(MAIL_WINDOW) {
                let _ = window.reload();
            }
        }
        _ => {}
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .menu(app_menu)
        .on_menu_event(|app, event| handle_menu_event(app, event.id().as_ref()))
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                match window.label() {
                    SETTINGS_WINDOW if window.app_handle().get_webview_window(MAIL_WINDOW).is_some() => {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                    MAIL_WINDOW => show_settings(&window.app_handle()),
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_server_connection,
            connect_to_server
        ])
        .setup(|app| {
            if let Some(settings) = app.get_webview_window(SETTINGS_WINDOW) {
                match connection::load(app.handle()) {
                    Ok(Some(connection)) => {
                        if let Err(error) = open_mail_window(app.handle(), &connection) {
                            eprintln!("Could not open the saved MailHub server: {error}");
                            settings.show()?;
                        } else {
                            settings.hide()?;
                        }
                    }
                    Ok(None) => settings.show()?,
                    Err(error) => {
                        eprintln!("Could not load the saved MailHub server: {error}");
                        settings.show()?;
                    }
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running MailHub Desktop");
}
