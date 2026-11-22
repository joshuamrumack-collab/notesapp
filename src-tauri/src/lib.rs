use std::{fs, path::Path};

#[derive(serde::Serialize)]
struct Entry {
    name: String,
    is_dir: bool,
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn ensure_parent(path: &str) -> Result<(), String> {
    if let Some(parent) = Path::new(path).parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    Ok(())
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<Entry>, String> {
    let mut out = Vec::new();
    for item in fs::read_dir(&path).map_err(err)? {
        let item = item.map_err(err)?;
        let is_dir = item.file_type().map(|t| t.is_dir()).unwrap_or(false);
        out.push(Entry {
            name: item.file_name().to_string_lossy().into_owned(),
            is_dir,
        });
    }
    Ok(out)
}

#[tauri::command]
fn read_text(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(err)
}

#[tauri::command]
fn write_text(path: String, text: String) -> Result<(), String> {
    ensure_parent(&path)?;
    fs::write(&path, text).map_err(err)
}

/// Raw bytes, sent to the page as an ArrayBuffer (much faster than a JSON number array for images).
#[tauri::command]
fn read_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    fs::read(&path).map(tauri::ipc::Response::new).map_err(err)
}

#[tauri::command]
fn remove_file(path: String) -> Result<(), String> {
    if Path::new(&path).is_dir() {
        return Err("Refusing to delete a folder".into());
    }
    fs::remove_file(&path).map_err(err)
}

// ---------- OneNote import (Windows, OneNote desktop app) ----------
// PowerShell talks to OneNote through its COM interface. Nothing is changed in OneNote.

const PS_PRELUDE: &str = "$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $on = New-Object -ComObject OneNote.Application; $xml = '';";

#[cfg(windows)]
fn run_powershell(script: &str, page_id: Option<&str>) -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW);
    if let Some(id) = page_id {
        cmd.env("NOTESAPP_PAGE_ID", id);
    }
    let out = cmd.output().map_err(|e| format!("Could not start PowerShell: {e}"))?;
    if !out.status.success() {
        let msg = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if msg.contains("80040154") || msg.contains("Class not registered") {
            "The OneNote desktop app was not found. Install OneNote (Microsoft Office) and open it once.".into()
        } else if msg.is_empty() {
            "OneNote did not answer.".into()
        } else {
            msg
        });
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim_start_matches('\u{feff}').to_string())
}

#[cfg(not(windows))]
fn run_powershell(_script: &str, _page_id: Option<&str>) -> Result<String, String> {
    Err("OneNote import needs Windows with the OneNote desktop app.".into())
}

/// Notebooks, section groups, sections and pages (HierarchyScope hsPages = 4).
#[tauri::command]
async fn onenote_hierarchy() -> Result<String, String> {
    let script = format!("{PS_PRELUDE} $on.GetHierarchy('', 4, [ref]$xml); [Console]::Out.Write($xml)");
    run_powershell(&script, None)
}

/// One page with its images included (PageInfo piBinaryData = 1).
#[tauri::command]
async fn onenote_page(id: String) -> Result<String, String> {
    let script = format!("{PS_PRELUDE} $on.GetPageContent($env:NOTESAPP_PAGE_ID, [ref]$xml, 1); [Console]::Out.Write($xml)");
    run_powershell(&script, Some(&id))
}

#[tauri::command]
fn write_bytes(path: String, data: Vec<u8>) -> Result<(), String> {
    ensure_parent(&path)?;
    fs::write(&path, data).map_err(err)
}

#[tauri::command]
fn make_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(err)
}

#[tauri::command]
fn move_path(from: String, to: String) -> Result<(), String> {
    if Path::new(&to).exists() {
        return Err(format!("{to} already exists"));
    }
    ensure_parent(&to)?;
    fs::rename(&from, &to).map_err(err)
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            list_dir,
            read_text,
            write_text,
            read_bytes,
            write_bytes,
            make_dir,
            move_path,
            path_exists,
            remove_file,
            onenote_hierarchy,
            onenote_page
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
