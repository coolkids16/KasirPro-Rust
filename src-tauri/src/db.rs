// src-tauri/src/db.rs

use std::sync::OnceLock;
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Product {
    pub id: String,
    pub code: String,
    #[serde(default)]
    pub barcode: String,
    pub name: String,
    pub price: f64,
    pub category: String,
    pub stock: f64,
    #[serde(default = "default_input_method")]
    pub input_method: String,
    #[serde(default = "default_stock_unit")]
    pub stock_unit: String,
    #[serde(default = "default_conversion_factor")]
    pub conversion_factor: f64,
    #[serde(default)]
    pub cost_price: f64,
    #[serde(default = "default_cost_unit")]
    pub cost_unit: String,
    #[serde(default)]
    pub bag_cost: f64,
    #[serde(default)]
    pub bag_weight_kg: f64,
    #[serde(default)]
    pub min_stock: f64,
    #[serde(default = "default_label_color")]
    pub label_color: String,
}

fn default_input_method() -> String { "retail".into() }
fn default_stock_unit() -> String { "pcs".into() }
fn default_conversion_factor() -> f64 { 1.0 }
fn default_cost_unit() -> String { "pcs".into() }
fn default_label_color() -> String { "#10b981".into() }

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StoreSettings {
    pub store_name: String,
    pub address: String,
    pub phone: String,
    pub receipt_footer: String,
    pub cashier_name: String,
}

impl Default for StoreSettings {
    fn default() -> Self {
        Self {
            store_name: "COOL KIDS CELL".into(),
            address: String::new(),
            phone: String::new(),
            receipt_footer: "Terima kasih telah berbelanja".into(),
            cashier_name: String::new(),
        }
    }
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
    println!("[get_products] Fetching products from SurrealDB...");
    
    let client = reqwest::Client::new();
    let response = client
        .post(&format!("{}/sql", get_db_url()))
        .basic_auth(get_db_username(), Some(get_db_password()))
        .header("Surreal-Ns", get_db_ns())
        .header("Surreal-Db", get_db_name())
        .header("Accept", "application/json")
        .body("SELECT * FROM products ORDER BY name")
        .send()
        .await
        .map_err(|e| format!("Request gagal: {}", e))?;

    let text = response.text().await
        .map_err(|e| format!("Response gagal: {}", e))?;
    
    println!("[get_products] Response from SurrealDB: {}", text);
    
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
                                code: item.get("code").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                barcode: item.get("barcode").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                name: item.get("name")?.as_str()?.to_string(),
                                price: item.get("price")?.as_f64()?,
                                category: item.get("category")?.as_str()?.to_string(),
                                stock: item.get("stock")?.as_f64().or_else(|| item.get("stock")?.as_i64().map(|value| value as f64))?,
                                input_method: item.get("input_method").and_then(|value| value.as_str()).unwrap_or("retail").to_string(),
                                stock_unit: item.get("stock_unit").and_then(|value| value.as_str()).unwrap_or("pcs").to_string(),
                                conversion_factor: item.get("conversion_factor").and_then(|value| value.as_f64()).unwrap_or(1.0),
                                cost_price: item.get("cost_price").and_then(|value| value.as_f64()).unwrap_or(0.0),
                                cost_unit: item.get("cost_unit").and_then(|value| value.as_str()).unwrap_or("pcs").to_string(),
                                bag_cost: item.get("bag_cost").and_then(|value| value.as_f64()).unwrap_or(0.0),
                                bag_weight_kg: item.get("bag_weight_kg").and_then(|value| value.as_f64()).unwrap_or(0.0),
                                min_stock: item.get("min_stock").and_then(|value| value.as_f64()).or_else(|| item.get("min_stock").and_then(|value| value.as_i64()).map(|value| value as f64)).unwrap_or(5.0),
                                label_color: item.get("label_color").and_then(|value| value.as_str()).unwrap_or("#10b981").to_string(),
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
                    code: "P001".to_string(),
                    barcode: String::new(),
                    name: "Kopi Hitam".to_string(),
                    price: 5000.0,
                    category: "Minuman".to_string(),
                    stock: 100.0,
                    input_method: default_input_method(),
                    stock_unit: default_stock_unit(),
                    conversion_factor: default_conversion_factor(),
                    cost_price: 0.0,
                    cost_unit: default_cost_unit(),
                    bag_cost: 0.0,
                    bag_weight_kg: 0.0,
                    min_stock: 5.0,
                    label_color: default_label_color(),
                },
                Product {
                    id: "2".to_string(),
                    code: "P002".to_string(),
                    barcode: String::new(),
                    name: "Teh Manis".to_string(),
                    price: 3000.0,
                    category: "Minuman".to_string(),
                    stock: 100.0,
                    input_method: default_input_method(),
                    stock_unit: default_stock_unit(),
                    conversion_factor: default_conversion_factor(),
                    cost_price: 0.0,
                    cost_unit: default_cost_unit(),
                    bag_cost: 0.0,
                    bag_weight_kg: 0.0,
                    min_stock: 5.0,
                    label_color: default_label_color(),
                },
                Product {
                    id: "3".to_string(),
                    code: "P003".to_string(),
                    barcode: String::new(),
                    name: "Nasi Goreng".to_string(),
                    price: 15000.0,
                    category: "Makanan".to_string(),
                    stock: 50.0,
                    input_method: default_input_method(),
                    stock_unit: default_stock_unit(),
                    conversion_factor: default_conversion_factor(),
                    cost_price: 0.0,
                    cost_unit: default_cost_unit(),
                    bag_cost: 0.0,
                    bag_weight_kg: 0.0,
                    min_stock: 5.0,
                    label_color: default_label_color(),
                },
            ])
        }
        Err(_) => {
            // Fallback: return sample products
            Ok(vec![
                Product {
                    id: "1".to_string(),
                    code: "P001".to_string(),
                    barcode: String::new(),
                    name: "Kopi Hitam".to_string(),
                    price: 5000.0,
                    category: "Minuman".to_string(),
                    stock: 100.0,
                    input_method: default_input_method(),
                    stock_unit: default_stock_unit(),
                    conversion_factor: default_conversion_factor(),
                    cost_price: 0.0,
                    cost_unit: default_cost_unit(),
                    bag_cost: 0.0,
                    bag_weight_kg: 0.0,
                    min_stock: 5.0,
                    label_color: default_label_color(),
                },
                Product {
                    id: "2".to_string(),
                    code: "P002".to_string(),
                    barcode: String::new(),
                    name: "Teh Manis".to_string(),
                    price: 3000.0,
                    category: "Minuman".to_string(),
                    stock: 100.0,
                    input_method: default_input_method(),
                    stock_unit: default_stock_unit(),
                    conversion_factor: default_conversion_factor(),
                    cost_price: 0.0,
                    cost_unit: default_cost_unit(),
                    bag_cost: 0.0,
                    bag_weight_kg: 0.0,
                    min_stock: 5.0,
                    label_color: default_label_color(),
                },
                Product {
                    id: "3".to_string(),
                    code: "P003".to_string(),
                    barcode: String::new(),
                    name: "Nasi Goreng".to_string(),
                    price: 15000.0,
                    category: "Makanan".to_string(),
                    stock: 50.0,
                    input_method: default_input_method(),
                    stock_unit: default_stock_unit(),
                    conversion_factor: default_conversion_factor(),
                    cost_price: 0.0,
                    cost_unit: default_cost_unit(),
                    bag_cost: 0.0,
                    bag_weight_kg: 0.0,
                    min_stock: 5.0,
                    label_color: default_label_color(),
                },
            ])
        }
    }
}

#[tauri::command]
pub async fn add_product(
    code: String,
    barcode: String,
    name: String,
    category: String,
    price: f64,
    stock: f64,
    input_method: String,
    stock_unit: String,
    conversion_factor: f64,
    cost_price: f64,
    cost_unit: String,
    bag_cost: f64,
    bag_weight_kg: f64,
    min_stock: f64,
    label_color: String,
) -> Result<Product, String> {
    println!("[add_product] Adding product: code={}, name={}, category={}, price={}, stock={}", 
             code, name, category, price, stock);
    
    let client = reqwest::Client::new();
    
    if !stock.is_finite() || stock < 0.0 || !conversion_factor.is_finite() || conversion_factor <= 0.0
        || !cost_price.is_finite() || cost_price < 0.0 || !bag_cost.is_finite() || bag_cost < 0.0
        || !bag_weight_kg.is_finite() || bag_weight_kg < 0.0 || !min_stock.is_finite() || min_stock < 0.0
    {
        return Err("Jumlah stok dan rasio konversi harus valid dan tidak negatif".into());
    }
    if !label_color.starts_with('#') || label_color.len() != 7 || !label_color[1..].chars().all(|value| value.is_ascii_hexdigit()) {
        return Err("Warna label tidak valid".into());
    }

    let query = format!(
        "CREATE products SET code = {}, barcode = {}, name = {}, category = {}, price = {}, stock = {}, input_method = {}, stock_unit = {}, conversion_factor = {}, cost_price = {}, cost_unit = {}, bag_cost = {}, bag_weight_kg = {}, min_stock = {}, label_color = {} RETURN AFTER",
        surreal_string_literal(&code),
        surreal_string_literal(&barcode),
        surreal_string_literal(&name),
        surreal_string_literal(&category),
        price,
        stock,
        surreal_string_literal(&input_method),
        surreal_string_literal(&stock_unit),
        conversion_factor,
        cost_price,
        surreal_string_literal(&cost_unit),
        bag_cost,
        bag_weight_kg,
        min_stock,
        surreal_string_literal(&label_color)
    );
    
    println!("[add_product] Query: {}", query);
    
    let response = client
        .post(&format!("{}/sql", get_db_url()))
        .basic_auth(get_db_username(), Some(get_db_password()))
        .header("Surreal-Ns", get_db_ns())
        .header("Surreal-Db", get_db_name())
        .header("Accept", "application/json")
        .body(query)
        .send()
        .await
        .map_err(|e| format!("Request gagal: {}", e))?;

    let text = response.text().await
        .map_err(|e| format!("Response gagal: {}", e))?;
    
    println!("[add_product] Response from SurrealDB: {}", text);
    
    // Parse response
    match serde_json::from_str::<Vec<serde_json::Value>>(&text) {
        Ok(response_array) => {
            if let Some(first) = response_array.first() {
                if let Some(results) = first.get("result").and_then(|r| r.as_array()) {
                    if let Some(item) = results.first() {
                        let product = Product {
                            id: item.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            code: item.get("code").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            barcode: item.get("barcode").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            name: item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            price: item.get("price").and_then(|v| v.as_f64()).unwrap_or(0.0),
                            category: item.get("category").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            stock: item.get("stock").and_then(|v| v.as_f64()).or_else(|| item.get("stock").and_then(|v| v.as_i64()).map(|value| value as f64)).unwrap_or(0.0),
                            input_method: item.get("input_method").and_then(|v| v.as_str()).unwrap_or("retail").to_string(),
                            stock_unit: item.get("stock_unit").and_then(|v| v.as_str()).unwrap_or("pcs").to_string(),
                            conversion_factor: item.get("conversion_factor").and_then(|v| v.as_f64()).unwrap_or(1.0),
                            cost_price: item.get("cost_price").and_then(|v| v.as_f64()).unwrap_or(0.0),
                            cost_unit: item.get("cost_unit").and_then(|v| v.as_str()).unwrap_or("pcs").to_string(),
                            bag_cost: item.get("bag_cost").and_then(|v| v.as_f64()).unwrap_or(0.0),
                            bag_weight_kg: item.get("bag_weight_kg").and_then(|v| v.as_f64()).unwrap_or(0.0),
                            min_stock: item.get("min_stock").and_then(|v| v.as_f64()).or_else(|| item.get("min_stock").and_then(|v| v.as_i64()).map(|value| value as f64)).unwrap_or(5.0),
                            label_color: item.get("label_color").and_then(|v| v.as_str()).unwrap_or("#10b981").to_string(),
                        };
                        if product.code.is_empty() || product.name.is_empty() {
                            return Err(format!(
                                "SurrealDB membuat record tanpa field produk: {}",
                                item
                            ));
                        }
                        println!("[add_product] Product created successfully: {:?}", product);
                        return Ok(product);
                    }
                }
            }
            println!("[add_product] Error: No result in response");
        }
        Err(e) => {
            println!("[add_product] Parse error: {}", e);
            return Err(format!("Parse error: {}", e));
        }
    }
    
    Err("Failed to create product".into())
}

fn surreal_string_literal(value: &str) -> String {
    let escaped = value
        .replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t");
    format!("'{}'", escaped)
}

#[tauri::command]
pub async fn adjust_product_stock(code: String, delta: f64) -> Result<(), String> {
    if !delta.is_finite() || delta == 0.0 {
        return Err("Perubahan stok tidak boleh nol".into());
    }

    let client = reqwest::Client::new();
    let escaped_code = surreal_string_literal(&code);
    let query = format!(
        "UPDATE products SET stock = stock + {} WHERE code = {} AND stock + {} >= 0 RETURN AFTER",
        delta, escaped_code, delta
    );
    let response = client
        .post(&format!("{}/sql", get_db_url()))
        .basic_auth(get_db_username(), Some(get_db_password()))
        .header("Surreal-Ns", get_db_ns())
        .header("Surreal-Db", get_db_name())
        .body(query)
        .send()
        .await
        .map_err(|error| format!("Request gagal: {}", error))?;

    let status = response.status();
    let text = response.text().await.map_err(|error| format!("Response gagal: {}", error))?;
    if !status.is_success() {
        return Err(format!("Gagal memperbarui stok: {}", text));
    }
    let rows: Vec<serde_json::Value> = serde_json::from_str(&text)
        .map_err(|error| format!("Response stok tidak valid: {}", error))?;
    let Some(statement) = rows.first() else {
        return Err("SurrealDB tidak mengembalikan hasil perubahan stok".into());
    };
    if statement.get("status").and_then(serde_json::Value::as_str) == Some("ERR") {
        return Err(format!("Gagal memperbarui stok: {}", statement));
    }
    if statement.get("result").and_then(serde_json::Value::as_array).is_none_or(Vec::is_empty) {
        return Err(format!("Produk dengan kode {} tidak ditemukan atau stok tidak mencukupi", code));
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_product(code: String) -> Result<(), String> {
    println!("[delete_product] Deleting product with code={}", code);
    let client = reqwest::Client::new();
    let query = format!(
        "DELETE products WHERE code = {} RETURN BEFORE",
        surreal_string_literal(&code)
    );
    let response = client
        .post(&format!("{}/sql", get_db_url()))
        .basic_auth(get_db_username(), Some(get_db_password()))
        .header("Surreal-Ns", get_db_ns())
        .header("Surreal-Db", get_db_name())
        .body(query)
        .send()
        .await
        .map_err(|error| format!("Request gagal: {}", error))?;

    let status = response.status();
    let text = response.text().await.map_err(|error| format!("Response gagal: {}", error))?;
    println!("[delete_product] SurrealDB response: {}", text);
    if !status.is_success() {
        return Err(format!("Gagal menghapus produk: {}", text));
    }

    let response: Vec<serde_json::Value> = serde_json::from_str(&text)
        .map_err(|error| format!("Response hapus produk tidak valid: {}", error))?;
    let Some(statement) = response.first() else {
        return Err("SurrealDB tidak mengembalikan hasil penghapusan".into());
    };
    if statement.get("status").and_then(serde_json::Value::as_str) == Some("ERR") {
        let message = statement.get("detail")
            .and_then(serde_json::Value::as_str)
            .or_else(|| statement.get("result").and_then(serde_json::Value::as_str))
            .unwrap_or("Query DELETE ditolak oleh SurrealDB");
        return Err(format!("Gagal menghapus produk: {}", message));
    }

    let deleted_count = statement.get("result")
        .and_then(serde_json::Value::as_array)
        .map_or(0, Vec::len);
    if deleted_count == 0 {
        return Err(format!("Produk dengan kode {} tidak ditemukan; tidak ada data yang dihapus", code));
    }

    println!("[delete_product] Deleted {} record(s)", deleted_count);
    Ok(())
}

#[tauri::command]
pub async fn get_store_settings() -> Result<StoreSettings, String> {
    let client = reqwest::Client::new();
    let response = client
        .post(&format!("{}/sql", get_db_url()))
        .basic_auth(get_db_username(), Some(get_db_password()))
        .header("Surreal-Ns", get_db_ns())
        .header("Surreal-Db", get_db_name())
        .body("SELECT * FROM settings:store")
        .send()
        .await
        .map_err(|error| format!("Request pengaturan toko gagal: {}", error))?;

    let status = response.status();
    let text = response.text().await.map_err(|error| format!("Response pengaturan toko gagal: {}", error))?;
    if !status.is_success() {
        return Err(format!("Gagal mengambil pengaturan toko: {}", text));
    }

    let rows: Vec<serde_json::Value> = serde_json::from_str(&text)
        .map_err(|error| format!("Response pengaturan toko tidak valid: {}", error))?;
    let Some(settings) = rows.first().and_then(|row| row.get("result")).and_then(|result| result.as_array()).and_then(|result| result.first()) else {
        return Ok(StoreSettings::default());
    };

    serde_json::from_value(settings.clone())
        .map_err(|error| format!("Data pengaturan toko tidak valid: {}", error))
}

#[tauri::command]
pub async fn save_store_settings(settings: StoreSettings) -> Result<StoreSettings, String> {
    if settings.store_name.trim().is_empty() {
        return Err("Nama toko wajib diisi".into());
    }

    let client = reqwest::Client::new();
    let params = serde_json::json!({ "settings": settings });
    let response = client
        .post(&format!("{}/sql", get_db_url()))
        .basic_auth(get_db_username(), Some(get_db_password()))
        .header("Surreal-Ns", get_db_ns())
        .header("Surreal-Db", get_db_name())
        .header("Surreal-Params", params.to_string())
        .body("UPSERT settings:store CONTENT $settings RETURN AFTER")
        .send()
        .await
        .map_err(|error| format!("Request simpan pengaturan toko gagal: {}", error))?;

    let status = response.status();
    let text = response.text().await.map_err(|error| format!("Response simpan pengaturan toko gagal: {}", error))?;
    if !status.is_success() || text.contains("\"status\":\"ERR\"") {
        return Err(format!("Gagal menyimpan pengaturan toko: {}", text));
    }

    let rows: Vec<serde_json::Value> = serde_json::from_str(&text)
        .map_err(|error| format!("Response simpan pengaturan toko tidak valid: {}", error))?;
    let saved = rows.first()
        .and_then(|row| row.get("result"))
        .and_then(|result| result.as_array())
        .and_then(|result| result.first())
        .cloned()
        .ok_or_else(|| "SurrealDB tidak mengembalikan pengaturan yang disimpan".to_string())?;

    serde_json::from_value(saved)
        .map_err(|error| format!("Data pengaturan tersimpan tidak valid: {}", error))
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
