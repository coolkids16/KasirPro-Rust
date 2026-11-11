// src-tauri/src/bin/test_connection.rs

use reqwest;

#[tokio::main]
async fn main() {
    println!("Testing SurrealDB connection...");
    
    match test_connection().await {
        Ok(msg) => println!("✓ {}", msg),
        Err(e) => eprintln!("✗ {}", e),
    }
}

async fn test_connection() -> Result<String, Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let url = std::env::var("KASIRPRO_DB_URL").unwrap_or_else(|_| "http://192.168.0.102:8000".into());
    let username = std::env::var("KASIRPRO_DB_USERNAME").unwrap_or_else(|_| "root".into());
    let password = std::env::var("KASIRPRO_DB_PASSWORD").unwrap_or_else(|_| "namikaze".into());
    let namespace = std::env::var("KASIRPRO_DB_NAMESPACE").unwrap_or_else(|_| "kasirpro-ns".into());
    let database = std::env::var("KASIRPRO_DB_NAME").unwrap_or_else(|_| "kasirpro_db".into());
    let endpoint = format!("{}/sql", url.trim_end_matches('/'));
    let quoted_namespace = format!("`{}`", namespace.replace('`', "``"));
    let quoted_database = format!("`{}`", database.replace('`', "``"));
    let bootstrap = client
        .post(&endpoint)
        .basic_auth(&username, Some(&password))
        .header("Accept", "application/json")
        .body(format!(
            "DEFINE NAMESPACE IF NOT EXISTS {}; USE NS {}; DEFINE DATABASE IF NOT EXISTS {}",
            quoted_namespace, quoted_namespace, quoted_database
        ))
        .send()
        .await?;
    let bootstrap_status = bootstrap.status();
    let bootstrap_text = bootstrap.text().await?;
    if !bootstrap_status.is_success() {
        return Err(format!("HTTP {} - {}", bootstrap_status, bootstrap_text).into());
    }
    check_query_errors(&bootstrap_text)?;

    let response = client
        .post(&endpoint)
        .basic_auth(&username, Some(&password))
        .header("Surreal-Ns", &namespace)
        .header("Surreal-Db", &database)
        .header("Accept", "application/json")
        .body("INFO FOR DB")
        .send()
        .await?;
    
    let status = response.status();
    let text = response.text().await?;
    
    if status.is_success() {
        check_query_errors(&text)?;
        Ok(format!("Koneksi ke SurrealDB BERHASIL! Namespace: {} | Database: {}", namespace, database))
    } else {
        Err(format!("HTTP {} - {}", status, text).into())
    }
}

fn check_query_errors(text: &str) -> Result<(), Box<dyn std::error::Error>> {
    let rows: Vec<serde_json::Value> = serde_json::from_str(text)?;
    if let Some(error) = rows.iter().find(|row| row.get("status").and_then(serde_json::Value::as_str) == Some("ERR")) {
        return Err(error.get("detail").and_then(serde_json::Value::as_str).unwrap_or("SurrealQL query failed").to_string().into());
    }
    Ok(())
}
