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
    
    // Test HTTP endpoint SurrealDB
    let response = client
        .post("http://192.168.0.102:8000/sql")
        .basic_auth("root", Some("root"))
        .body("USE NS kasirpro_ns DB kasirpro_db; INFO FOR DB;")
        .send()
        .await?;
    
    let status = response.status();
    let text = response.text().await?;
    
    if status.is_success() {
        Ok(format!("Koneksi ke SurrealDB STB BERHASIL!\nResponse: {}", text))
    } else {
        Err(format!("HTTP {} - {}", status, text).into())
    }
}
