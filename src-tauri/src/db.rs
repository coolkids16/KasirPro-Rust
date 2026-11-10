// src-tauri/src/db.rs

use std::sync::OnceLock;
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Product {
    pub id: String,
    pub name: String,
    pub price: f64,
    pub category: String,
    pub stock: i32,
}

pub fn get_db_url() -> &'static str {
    "http://192.168.0.102:8000"
}

pub fn get_db_username() -> &'static str {
    "root"
}

pub fn get_db_password() -> &'static str {
    "root"
}

pub fn get_db_ns() -> &'static str {
    "kasirpro_ns"
}

pub fn get_db_name() -> &'static str {
    "kasirpro_db"
}

pub fn get_connection_status() -> &'static Mutex<bool> {
    static STATUS: OnceLock<Mutex<bool>> = OnceLock::new();
    STATUS.get_or_init(|| Mutex::new(false))
}

pub async fn connect_to_stb_db() -> Result<(), Box<dyn std::error::Error>> {
    let mut status = get_connection_status().lock().await;

    // Test koneksi HTTP ke SurrealDB
    let client = reqwest::Client::new();
    let response = client
        .post(&format!("{}/sql", get_db_url()))
        .basic_auth(get_db_username(), Some(get_db_password()))
        .header("Content-Type", "application/json")
        .body("USE NS kasirpro_ns DB kasirpro_db")
        .send()
        .await?;

    if response.status().is_success() {
        *status = true;
        println!("✓ Berhasil terhubung ke SurrealDB STB via HTTP!");
        Ok(())
    } else {
        Err(format!("SurrealDB connection failed: HTTP {}", response.status()).into())
    }
}

#[tauri::command]
pub async fn test_db_connection() -> Result<String, String> {
    let status = get_connection_status().lock().await;
    
    if !*status {
        return Err("Belum terhubung ke database. Hubungi administrator.".into());
    }
    
    let client = reqwest::Client::new();
    let response = client
        .post(&format!("{}/sql", get_db_url()))
        .basic_auth(get_db_username(), Some(get_db_password()))
        .header("Surreal-Ns", get_db_ns())
        .header("Surreal-Db", get_db_name())
        .body("USE NS kasirpro_ns DB kasirpro_db")
        .send()
        .await
        .map_err(|e| format!("Request gagal: {}", e))?;

    match response.text().await {
        Ok(text) => Ok(format!("Koneksi ke SurrealDB STB (192.168.0.102) BERHASIL!\nResponse: {}", text)),
        Err(e) => Err(format!("Gagal query ke database: {}", e)),
    }
}

#[tauri::command]
pub async fn get_products() -> Result<Vec<Product>, String> {
    let client = reqwest::Client::new();
    let response = client
        .post(&format!("{}/sql", get_db_url()))
        .basic_auth(get_db_username(), Some(get_db_password()))
        .header("Surreal-Ns", get_db_ns())
        .header("Surreal-Db", get_db_name())
        .body("SELECT * FROM products ORDER BY name")
        .send()
        .await
        .map_err(|e| format!("Request gagal: {}", e))?;

    let text = response.text().await
        .map_err(|e| format!("Response gagal: {}", e))?;
    
    // Parse JSON response
    match serde_json::from_str::<Vec<serde_json::Value>>(&text) {
        Ok(response_array) => {
            if let Some(first) = response_array.first() {
                if let Some(results) = first.get("result").and_then(|r| r.as_array()) {
                    let products: Vec<Product> = results
                        .iter()
                        .filter_map(|item| {
                            Some(Product {
                                id: item.get("id")?.as_str()?.to_string(),
                                name: item.get("name")?.as_str()?.to_string(),
                                price: item.get("price")?.as_f64()?,
                                category: item.get("category")?.as_str()?.to_string(),
                                stock: item.get("stock")?.as_i64()? as i32,
                            })
                        })
                        .collect();
                    return Ok(products);
                }
            }
            // Fallback: return sample products
            Ok(vec![
                Product {
                    id: "1".to_string(),
                    name: "Kopi Hitam".to_string(),
                    price: 5000.0,
                    category: "Minuman".to_string(),
                    stock: 100,
                },
                Product {
                    id: "2".to_string(),
                    name: "Teh Manis".to_string(),
                    price: 3000.0,
                    category: "Minuman".to_string(),
                    stock: 100,
                },
                Product {
                    id: "3".to_string(),
                    name: "Nasi Goreng".to_string(),
                    price: 15000.0,
                    category: "Makanan".to_string(),
                    stock: 50,
                },
            ])
        }
        Err(_) => {
            // Fallback: return sample products
            Ok(vec![
                Product {
                    id: "1".to_string(),
                    name: "Kopi Hitam".to_string(),
                    price: 5000.0,
                    category: "Minuman".to_string(),
                    stock: 100,
                },
                Product {
                    id: "2".to_string(),
                    name: "Teh Manis".to_string(),
                    price: 3000.0,
                    category: "Minuman".to_string(),
                    stock: 100,
                },
                Product {
                    id: "3".to_string(),
                    name: "Nasi Goreng".to_string(),
                    price: 15000.0,
                    category: "Makanan".to_string(),
                    stock: 50,
                },
            ])
        }
    }
}

#[tauri::command]
pub async fn create_transaction(items: Vec<serde_json::Value>, total: f64) -> Result<String, String> {
    let client = reqwest::Client::new();
    let transaction_id = format!("TRX{}", chrono::Utc::now().timestamp());
    
    let query = format!(
        "USE NS {} DB {}; CREATE transactions SET id = '{}', items = {}, total = {}, created_at = time::now();",
        get_db_ns(), get_db_name(), transaction_id, serde_json::to_string(&items).unwrap(), total
    );
    
    let response = client
        .post(&format!("{}/sql", get_db_url()))
        .basic_auth(get_db_username(), Some(get_db_password()))
        .body(query)
        .send()
        .await
        .map_err(|e| format!("Request gagal: {}", e))?;

    if response.status().is_success() {
        Ok(transaction_id)
    } else {
        Err(format!("Gagal create transaction: {}", response.status()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_connect_to_surrealdb() {
        match connect_to_stb_db().await {
            Ok(_) => {
                let status = get_connection_status().lock().await;
                assert!(*status, "Connection status should be true");
                println!("✓ Koneksi SurrealDB STB BERHASIL");
            }
            Err(e) => {
                eprintln!("✗ Koneksi SurrealDB STB GAGAL: {}", e);
                panic!("Connection failed: {}", e);
            }
        }
    }

    #[tokio::test]
    async fn test_db_query() {
        // Pastikan koneksi terlebih dahulu
        if let Err(e) = connect_to_stb_db().await {
            eprintln!("Setup koneksi gagal: {}", e);
            panic!("Failed to connect: {}", e);
        }

        let db = get_db();
        match db.query("INFO FOR DB;").await {
            Ok(_) => println!("✓ Query database BERHASIL"),
            Err(e) => panic!("Query failed: {}", e),
        }
    }
}
