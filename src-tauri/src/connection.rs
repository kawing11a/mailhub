use std::{fs, io::ErrorKind, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use url::{Host, Url};

const CONFIG_FILE: &str = "server-connection.json";

#[derive(Clone, Debug)]
pub struct ServerConnection {
    origin: Url,
}

impl ServerConnection {
    pub fn parse(input: &str) -> Result<Self, String> {
        let mut origin = Url::parse(input.trim())
            .map_err(|_| "Enter a valid server URL, such as https://mail.example.com".to_string())?;

        if !origin.username().is_empty()
            || origin.password().is_some()
            || origin.query().is_some()
            || origin.fragment().is_some()
            || origin.path() != "/"
        {
            return Err("Enter the server origin only, without a path, credentials, or query.".into());
        }

        let is_https = origin.scheme() == "https";
        let is_local_http = origin.scheme() == "http"
            && match origin.host() {
                Some(Host::Ipv4(address)) => address.is_loopback(),
                Some(Host::Ipv6(address)) => address.is_loopback(),
                Some(Host::Domain(host)) => host == "localhost" || host.ends_with(".localhost"),
                None => false,
            };

        if !is_https && !is_local_http {
            return Err("Use HTTPS for server connections. HTTP is allowed only for localhost.".into());
        }

        origin.set_path("/");
        Ok(Self { origin })
    }

    pub fn url(&self) -> &Url {
        &self.origin
    }
}

#[derive(Serialize, Deserialize)]
struct StoredConnection {
    server_url: String,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(CONFIG_FILE))
        .map_err(|error| format!("Could not locate the desktop settings folder: {error}"))
}

pub fn load(app: &AppHandle) -> Result<Option<ServerConnection>, String> {
    let path = config_path(app)?;
    let contents = match fs::read(&path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Could not read server settings: {error}")),
    };

    let stored: StoredConnection = serde_json::from_slice(&contents)
        .map_err(|error| format!("Could not read server settings: {error}"))?;
    ServerConnection::parse(&stored.server_url).map(Some)
}

pub fn save(app: &AppHandle, connection: &ServerConnection) -> Result<(), String> {
    let path = config_path(app)?;
    let directory = path
        .parent()
        .ok_or_else(|| "Could not locate the desktop settings folder.".to_string())?;
    fs::create_dir_all(directory)
        .map_err(|error| format!("Could not create the desktop settings folder: {error}"))?;

    let contents = serde_json::to_vec(&StoredConnection {
        server_url: connection.origin.as_str().to_string(),
    })
    .map_err(|error| format!("Could not save server settings: {error}"))?;
    fs::write(path, contents).map_err(|error| format!("Could not save server settings: {error}"))
}
