// src-tauri/src/db.rs

use std::collections::HashMap;
use std::sync::{Mutex as StdMutex, OnceLock};
use argon2::{password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString}, Argon2};
use rand::rngs::OsRng;
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Product {
    pub id: String,
    #[serde(default)]
    pub store_id: String,
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
    #[serde(default)]
    pub monthly_sold: f64,
    #[serde(default)]
    pub sales_month: String,
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
    #[serde(default)]
    pub logo_data_url: String,
    #[serde(default)]
    pub tax_enabled: bool,
    #[serde(default = "default_tax_rate")]
    pub tax_rate: f64,
    #[serde(default = "default_timezone")]
    pub timezone: String,
}

fn default_tax_rate() -> f64 { 11.0 }
fn default_timezone() -> String { "Asia/Jakarta".into() }

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserSession {
    pub session_id: String,
    pub user_id: String,
    pub store_id: String,
    pub store_name: String,
    pub name: String,
    pub email: String,
    pub role: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StaffMember {
    pub user_id: String,
    pub name: String,
    pub email: String,
    pub role: String,
    pub created_at: String,
}

fn active_sessions() -> &'static StdMutex<HashMap<String, UserSession>> {
    static SESSIONS: OnceLock<StdMutex<HashMap<String, UserSession>>> = OnceLock::new();
    SESSIONS.get_or_init(|| StdMutex::new(HashMap::new()))
}

fn require_session(session_id: &str) -> Result<UserSession, String> {
    active_sessions().lock().map_err(|_| "Sesi aplikasi tidak tersedia".to_string())?
        .get(session_id).cloned().ok_or_else(|| "Sesi berakhir. Silakan login kembali.".to_string())
}

fn require_role(session: &UserSession, roles: &[&str]) -> Result<(), String> {
    if roles.contains(&session.role.as_str()) { Ok(()) }
    else { Err("Akun Anda tidak memiliki hak akses untuk tindakan ini".into()) }
}

impl Default for StoreSettings {
    fn default() -> Self {
        Self {
            store_name: "COOL KIDS CELL".into(),
            address: String::new(),
            phone: String::new(),
            receipt_footer: "Terima kasih telah berbelanja".into(),
            cashier_name: String::new(),
            logo_data_url: String::new(),
            tax_enabled: false,
            tax_rate: default_tax_rate(),
            timezone: default_timezone(),
        }
    }
}

pub fn get_db_url() -> String {
    std::env::var("KASIRPRO_DB_URL")
        .unwrap_or_else(|_| "http://192.168.0.102:8000".into())
        .trim_end_matches('/')
        .to_string()
}

pub fn get_db_username() -> String {
    std::env::var("KASIRPRO_DB_USERNAME").unwrap_or_else(|_| "root".into())
}

pub fn get_db_password() -> String {
    std::env::var("KASIRPRO_DB_PASSWORD").unwrap_or_else(|_| "namikaze".into())
}

pub fn get_db_ns() -> String {
    std::env::var("KASIRPRO_DB_NAMESPACE").unwrap_or_else(|_| "kasirpro-ns".into())
}

pub fn get_db_name() -> String {
    std::env::var("KASIRPRO_DB_NAME").unwrap_or_else(|_| "kasirpro_db".into())
}

pub fn get_connection_status() -> &'static Mutex<bool> {
    static STATUS: OnceLock<Mutex<bool>> = OnceLock::new();
    STATUS.get_or_init(|| Mutex::new(false))
}

fn application_schema_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

pub async fn connect_to_stb_db() -> Result<(), Box<dyn std::error::Error>> {
    *get_connection_status().lock().await = false;
    ensure_application_tables().await.map_err(std::io::Error::other)?;
    run_surreal_query("INFO FOR DB".into()).await.map_err(std::io::Error::other)?;
    *get_connection_status().lock().await = true;
    println!("✓ Berhasil terhubung ke SurrealDB via HTTP!");
    Ok(())
}

async fn run_surreal_query(query: String) -> Result<Vec<serde_json::Value>, String> {
    run_surreal_query_with_retry(query, false).await
}

async fn run_surreal_root_query(query: String) -> Result<Vec<serde_json::Value>, String> {
    run_surreal_query_with_retry(query, true).await
}

async fn run_surreal_query_with_retry(query: String, root_scope: bool) -> Result<Vec<serde_json::Value>, String> {
    for attempt in 0..3 {
        match run_surreal_query_once(&query, root_scope).await {
            Err(error) if error.contains("Transaction conflict") && attempt < 2 => {
                tokio::time::sleep(std::time::Duration::from_millis(25 * (1 << attempt))).await;
            }
            result => return result,
        }
    }
    unreachable!()
}

async fn run_surreal_query_once(query: &str, root_scope: bool) -> Result<Vec<serde_json::Value>, String> {
    let client = reqwest::Client::new();
    let mut request = client
        .post(format!("{}/sql", get_db_url()))
        .basic_auth(get_db_username(), Some(get_db_password()))
        .header("Accept", "application/json");
    if !root_scope {
        request = request.header("Surreal-Ns", get_db_ns()).header("Surreal-Db", get_db_name());
    }
    let response = request.body(query.to_string()).send().await
        .map_err(|error| format!("Tidak dapat menghubungi SurrealDB: {}", error))?;
    let status = response.status();
    let text = response.text().await.map_err(|error| format!("Gagal membaca respons SurrealDB: {}", error))?;
    if !status.is_success() {
        return Err(format!("SurrealDB mengembalikan HTTP {}: {}", status, text));
    }
    parse_surreal_response(&text)
}

fn parse_surreal_response(text: &str) -> Result<Vec<serde_json::Value>, String> {
    let rows: Vec<serde_json::Value> = serde_json::from_str(text)
        .map_err(|error| format!("Respons SurrealDB tidak valid: {}", error))?;
    if let Some(error) = rows.iter().find(|row| row.get("status").and_then(serde_json::Value::as_str) == Some("ERR")) {
        let message = error.get("detail").and_then(serde_json::Value::as_str)
            .or_else(|| error.get("result").and_then(serde_json::Value::as_str))
            .unwrap_or("Query SurrealDB gagal");
        return Err(message.to_string());
    }
    Ok(rows)
}

fn surreal_identifier(identifier: &str) -> String {
    format!("`{}`", identifier.replace('`', "``"))
}

fn result_rows(rows: &[serde_json::Value]) -> Vec<serde_json::Value> {
    rows.iter().flat_map(|row| row.get("result").and_then(serde_json::Value::as_array).cloned().unwrap_or_default()).collect()
}

fn hash_user_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default().hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| format!("Gagal mengamankan password: {}", error))
}

async fn create_user_session(user: &serde_json::Value, store_name: String) -> Result<UserSession, String> {
    let session = UserSession {
        session_id: uuid::Uuid::new_v4().to_string(),
        user_id: user.get("id").and_then(serde_json::Value::as_str).unwrap_or_default().to_string(),
        store_id: user.get("store_id").and_then(serde_json::Value::as_str).unwrap_or_default().to_string(),
        store_name,
        name: user.get("name").and_then(serde_json::Value::as_str).unwrap_or_default().to_string(),
        email: user.get("email").and_then(serde_json::Value::as_str).unwrap_or_default().to_string(),
        role: user.get("role").and_then(serde_json::Value::as_str).unwrap_or("cashier").to_string(),
    };
    run_surreal_query(format!(
        "CREATE sessions SET session_id = {}, user_id = {}, store_id = {}, store_name = {}, name = {}, email = {}, role = {}",
        surreal_string_literal(&session.session_id), surreal_string_literal(&session.user_id),
        surreal_string_literal(&session.store_id), surreal_string_literal(&session.store_name),
        surreal_string_literal(&session.name), surreal_string_literal(&session.email), surreal_string_literal(&session.role)
    )).await?;
    active_sessions().lock().map_err(|_| "Sesi aplikasi tidak tersedia".to_string())?.insert(session.session_id.clone(), session.clone());
    Ok(session)
}

#[tauri::command]
pub async fn auth_bootstrap_status() -> Result<bool, String> {
    ensure_application_tables().await?;
    let rows = run_surreal_query("SELECT id FROM users LIMIT 1".into()).await?;
    Ok(result_rows(&rows).is_empty())
}

async fn ensure_application_tables() -> Result<(), String> {
    let _schema_guard = application_schema_lock().lock().await;
    let namespace = surreal_identifier(&get_db_ns());
    let database = surreal_identifier(&get_db_name());
    run_surreal_root_query(format!(
        "DEFINE NAMESPACE IF NOT EXISTS {}; USE NS {}; DEFINE DATABASE IF NOT EXISTS {}",
        namespace, namespace, database
    )).await?;
    for table in ["users", "stores", "products", "settings", "transactions", "sessions", "cash_entries", "customer_names", "customer_debts", "debt_payments", "savings_accounts", "savings_entries"] {
        run_surreal_query(format!("DEFINE TABLE IF NOT EXISTS {} SCHEMALESS", table)).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn register_owner(name: String, email: String, password: String, store_name: String, address: String, phone: String) -> Result<UserSession, String> {
    ensure_application_tables().await?;
    let name = name.trim();
    let email = email.trim().to_lowercase();
    let store_name = store_name.trim();
    if name.is_empty() || store_name.is_empty() || !email.contains('@') || password.len() < 8 {
        return Err("Isi nama pemilik, nama toko, email valid, dan password minimal 8 karakter".into());
    }
    let existing = run_surreal_query("SELECT id FROM users LIMIT 1".into()).await?;
    if !result_rows(&existing).is_empty() {
        return Err("Registrasi Owner sudah pernah dilakukan. Silakan login atau minta Owner menambahkan akun Anda.".into());
    }

    let store_id = uuid::Uuid::new_v4().simple().to_string();
    let store_sql = format!(
        "CREATE stores SET store_id = {}, name = {}, owner_email = {}, address = {}, phone = {}, created_at = time::now() RETURN AFTER",
        surreal_string_literal(&store_id), surreal_string_literal(store_name), surreal_string_literal(&email),
        surreal_string_literal(address.trim()), surreal_string_literal(phone.trim())
    );
    run_surreal_query(store_sql).await?;
    let password_hash = hash_user_password(&password)?;
    let user_sql = format!(
        "CREATE users SET store_id = {}, name = {}, email = {}, password_hash = {}, role = 'owner', created_at = time::now() RETURN AFTER",
        surreal_string_literal(&store_id), surreal_string_literal(name), surreal_string_literal(&email), surreal_string_literal(&password_hash)
    );
    let user_rows = run_surreal_query(user_sql).await?;
    let user = result_rows(&user_rows).into_iter().next().ok_or_else(|| "Akun Owner gagal dibuat".to_string())?;

    // Existing unscoped data belongs to the first store during initial migration.
    let migrate_products = format!("UPDATE products SET store_id = {} WHERE store_id = NONE", surreal_string_literal(&store_id));
    let _ = run_surreal_query(migrate_products).await;
    let settings = StoreSettings { store_name: store_name.to_string(), address: address.trim().to_string(), phone: phone.trim().to_string(), cashier_name: name.to_string(), ..StoreSettings::default() };
    let settings_sql = format!(
        "UPSERT settings:{} CONTENT {{ store_id: {}, store_name: {}, address: {}, phone: {}, receipt_footer: {}, cashier_name: {}, logo_data_url: '', tax_enabled: false, tax_rate: 11, timezone: 'Asia/Jakarta' }} RETURN AFTER",
        store_id, surreal_string_literal(&store_id), surreal_string_literal(&settings.store_name), surreal_string_literal(&settings.address),
        surreal_string_literal(&settings.phone), surreal_string_literal(&settings.receipt_footer), surreal_string_literal(&settings.cashier_name)
    );
    run_surreal_query(settings_sql).await?;
    create_user_session(&user, store_name.to_string()).await
}

#[tauri::command]
pub async fn login_user(email: String, password: String) -> Result<UserSession, String> {
    let email = email.trim().to_lowercase();
    let query = format!("SELECT * FROM users WHERE email = {} LIMIT 1", surreal_string_literal(&email));
    let rows = run_surreal_query(query).await?;
    let user = result_rows(&rows).into_iter().next().ok_or_else(|| "Email atau password salah".to_string())?;
    let encoded = user.get("password_hash").and_then(serde_json::Value::as_str).ok_or_else(|| "Akun tidak memiliki password hash".to_string())?;
    let parsed = PasswordHash::new(encoded).map_err(|_| "Data password akun tidak valid".to_string())?;
    Argon2::default().verify_password(password.as_bytes(), &parsed).map_err(|_| "Email atau password salah".to_string())?;
    let store_id = user.get("store_id").and_then(serde_json::Value::as_str).unwrap_or_default();
    let store_query = format!("SELECT name FROM stores WHERE store_id = {} LIMIT 1", surreal_string_literal(store_id));
    let store_rows = run_surreal_query(store_query).await?;
    let store = result_rows(&store_rows).into_iter().next().ok_or_else(|| "Toko untuk akun ini tidak ditemukan".to_string())?;
    let store_name = store.get("name").and_then(serde_json::Value::as_str).unwrap_or("Toko").to_string();
    create_user_session(&user, store_name).await
}

#[tauri::command]
pub async fn logout_user(session_id: String) -> Result<(), String> {
    run_surreal_query(format!("DELETE sessions WHERE session_id = {}", surreal_string_literal(&session_id))).await?;
    active_sessions().lock().map_err(|_| "Sesi aplikasi tidak tersedia".to_string())?.remove(&session_id);
    Ok(())
}

#[tauri::command]
pub async fn validate_session(session_id: String) -> Result<UserSession, String> {
    if let Ok(session) = require_session(&session_id) {
        return Ok(session);
    }
    let rows = run_surreal_query(format!(
        "SELECT * FROM sessions WHERE session_id = {} LIMIT 1",
        surreal_string_literal(&session_id)
    )).await?;
    let session: UserSession = result_rows(&rows).into_iter().next()
        .ok_or_else(|| "Sesi berakhir. Silakan login kembali.".to_string())
        .and_then(|value| serde_json::from_value(value).map_err(|error| format!("Data sesi tidak valid: {}", error)))?;
    active_sessions().lock().map_err(|_| "Sesi aplikasi tidak tersedia".to_string())?
        .insert(session.session_id.clone(), session.clone());
    Ok(session)
}

#[tauri::command]
pub async fn list_store_staff(session_id: String) -> Result<Vec<StaffMember>, String> {
    let session = require_session(&session_id)?;
    require_role(&session, &["owner"])?;
    let query = format!("SELECT * FROM users WHERE store_id = {}", surreal_string_literal(&session.store_id));
    let rows = run_surreal_query(query).await?;
    Ok(result_rows(&rows).into_iter().filter_map(|user| {
        let role = user.get("role")?.as_str()?.to_string();
        if role == "owner" { return None; }
        Some(StaffMember {
            user_id: user.get("id")?.as_str()?.to_string(),
            name: user.get("name")?.as_str()?.to_string(),
            email: user.get("email")?.as_str()?.to_string(),
            role,
            created_at: user.get("created_at").map(ToString::to_string).unwrap_or_default(),
        })
    }).collect())
}

#[tauri::command]
pub async fn create_store_staff(session_id: String, name: String, email: String, password: String, role: String) -> Result<StaffMember, String> {
    let session = require_session(&session_id)?;
    require_role(&session, &["owner"])?;
    let name = name.trim();
    let email = email.trim().to_lowercase();
    if name.is_empty() || !email.contains('@') || password.len() < 8 || !["manager", "cashier"].contains(&role.as_str()) {
        return Err("Nama, email, password minimal 8 karakter, dan peran Manager/Kasir wajib valid".into());
    }
    let exists = run_surreal_query(format!("SELECT id FROM users WHERE email = {} LIMIT 1", surreal_string_literal(&email))).await?;
    if !result_rows(&exists).is_empty() { return Err("Email ini sudah digunakan".into()); }
    let password_hash = hash_user_password(&password)?;
    let query = format!(
        "CREATE users SET store_id = {}, name = {}, email = {}, password_hash = {}, role = {}, created_at = time::now() RETURN AFTER",
        surreal_string_literal(&session.store_id), surreal_string_literal(name), surreal_string_literal(&email),
        surreal_string_literal(&password_hash), surreal_string_literal(&role)
    );
    let rows = run_surreal_query(query).await?;
    let user = result_rows(&rows).into_iter().next().ok_or_else(|| "Akun staf gagal dibuat".to_string())?;
    Ok(StaffMember {
        user_id: user.get("id").and_then(serde_json::Value::as_str).unwrap_or_default().to_string(),
        name: name.to_string(), email, role, created_at: user.get("created_at").map(ToString::to_string).unwrap_or_default(),
    })
}

#[tauri::command]
pub async fn delete_store_staff(session_id: String, user_id: String) -> Result<(), String> {
    let session = require_session(&session_id)?;
    require_role(&session, &["owner"])?;
    let record_id = user_id.strip_prefix("users:").ok_or_else(|| "ID akun staf tidak valid".to_string())?;
    if record_id.is_empty() || !record_id.chars().all(|character| character.is_ascii_alphanumeric() || character == '_') {
        return Err("ID akun staf tidak valid".into());
    }
    let query = format!("DELETE users:{} WHERE store_id = {} AND role != 'owner' RETURN BEFORE", record_id, surreal_string_literal(&session.store_id));
    let rows = run_surreal_query(query).await?;
    if result_rows(&rows).is_empty() { return Err("Akun staf tidak ditemukan di toko ini".into()); }
    Ok(())
}

#[tauri::command]
pub async fn test_db_connection() -> Result<String, String> {
    ensure_application_tables().await?;
    let client = reqwest::Client::new();
    let response = client
        .post(&format!("{}/sql", get_db_url()))
        .basic_auth(get_db_username(), Some(get_db_password()))
        .header("Surreal-Ns", get_db_ns())
        .header("Surreal-Db", get_db_name())
        .body("INFO FOR DB")
        .send()
        .await
        .map_err(|error| format!("Request gagal: {}", error))?;

    let status_code = response.status();
    let text = response.text().await.map_err(|error| format!("Gagal membaca respons: {}", error))?;
    if status_code.is_success() {
        parse_surreal_response(&text)?;
        Ok("Koneksi ke SurrealDB dan namespace/database berhasil.".into())
    } else {
        Err(format!("SurrealDB mengembalikan HTTP {}: {}", status_code, text))
    }
}

#[tauri::command]
pub async fn get_products(session_id: String) -> Result<Vec<Product>, String> {
    let session = require_session(&session_id)?;
    let rows = run_surreal_query(format!(
        "SELECT * FROM products WHERE store_id = {} ORDER BY name",
        surreal_string_literal(&session.store_id)
    )).await?;

    let current_month = chrono::Local::now().format("%Y-%m").to_string();
    let products = result_rows(&rows).into_iter().filter_map(|item| {
        let sales_month = item.get("sales_month").and_then(|value| value.as_str()).unwrap_or_default().to_string();
        Some(Product {
            id: item.get("id")?.as_str()?.to_string(),
            store_id: item.get("store_id")?.as_str()?.to_string(),
            code: item.get("code")?.as_str()?.to_string(),
            barcode: item.get("barcode").and_then(|value| value.as_str()).unwrap_or_default().to_string(),
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
            monthly_sold: if sales_month == current_month { item.get("monthly_sold").and_then(|value| value.as_f64()).unwrap_or(0.0) } else { 0.0 },
            sales_month,
        })
    }).collect();
    Ok(products)
}

#[tauri::command]
pub async fn add_product(
    session_id: String,
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
    let session = require_session(&session_id)?;
    require_role(&session, &["owner", "manager"])?;
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
        "CREATE products SET store_id = {}, code = {}, barcode = {}, name = {}, category = {}, price = {}, stock = {}, input_method = {}, stock_unit = {}, conversion_factor = {}, cost_price = {}, cost_unit = {}, bag_cost = {}, bag_weight_kg = {}, min_stock = {}, label_color = {}, monthly_sold = 0, sales_month = {} RETURN AFTER",
        surreal_string_literal(&session.store_id),
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
        surreal_string_literal(&label_color),
        surreal_string_literal(&chrono::Local::now().format("%Y-%m").to_string())
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
                            store_id: item.get("store_id").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
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
                            monthly_sold: 0.0,
                            sales_month: chrono::Local::now().format("%Y-%m").to_string(),
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
pub async fn adjust_product_stock(session_id: String, code: String, delta: f64) -> Result<(), String> {
    let session = require_session(&session_id)?;
    require_role(&session, &["owner", "manager"])?;
    if !delta.is_finite() || delta == 0.0 {
        return Err("Perubahan stok tidak boleh nol".into());
    }

    let client = reqwest::Client::new();
    let escaped_code = surreal_string_literal(&code);
    let query = format!(
        "UPDATE products SET stock = stock + {} WHERE store_id = {} AND code = {} AND stock + {} >= 0 RETURN AFTER",
        delta, surreal_string_literal(&session.store_id), escaped_code, delta
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
pub async fn delete_product(session_id: String, code: String) -> Result<(), String> {
    let session = require_session(&session_id)?;
    require_role(&session, &["owner", "manager"])?;
    println!("[delete_product] Deleting product with code={}", code);
    let client = reqwest::Client::new();
    let query = format!(
        "DELETE products WHERE store_id = {} AND code = {} RETURN BEFORE",
        surreal_string_literal(&session.store_id), surreal_string_literal(&code)
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
pub async fn get_store_settings(session_id: String) -> Result<StoreSettings, String> {
    let session = require_session(&session_id)?;
    let client = reqwest::Client::new();
    let response = client
        .post(&format!("{}/sql", get_db_url()))
        .basic_auth(get_db_username(), Some(get_db_password()))
        .header("Surreal-Ns", get_db_ns())
        .header("Surreal-Db", get_db_name())
        .body(format!("SELECT * FROM settings:{}", session.store_id))
        .send()
        .await
        .map_err(|error| format!("Request pengaturan toko gagal: {}", error))?;

    let status = response.status();
    let text = response.text().await.map_err(|error| format!("Response pengaturan toko gagal: {}", error))?;
    if !status.is_success() {
        return Err(format!("Gagal mengambil pengaturan toko: {}", text));
    }

    let rows: Vec<serde_json::Value> = serde_json::from_str(&text)
        .map_err(|error| format!("Respons pengaturan toko tidak valid: {}", error))?;
    let Some(settings) = rows.first().and_then(|row| row.get("result")).and_then(|result| result.as_array()).and_then(|result| result.first()) else {
        return Ok(StoreSettings::default());
    };
    serde_json::from_value(settings.clone())
        .map_err(|error| format!("Data pengaturan toko tidak valid: {}", error))
}

#[tauri::command]
pub async fn save_store_settings(session_id: String, settings: StoreSettings) -> Result<StoreSettings, String> {
    let session = require_session(&session_id)?;
    require_role(&session, &["owner"])?;
    if settings.store_name.trim().is_empty() {
        return Err("Nama toko wajib diisi".into());
    }
    if !settings.tax_rate.is_finite() || !(0.0..=100.0).contains(&settings.tax_rate) {
        return Err("Tarif PPN harus di antara 0 dan 100".into());
    }
    if settings.logo_data_url.len() > 2_000_000 {
        return Err("Ukuran logo terlalu besar; gunakan gambar di bawah 1,5 MB".into());
    }
    if !["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"].contains(&settings.timezone.as_str()) {
        return Err("Zona waktu tidak valid".into());
    }

    let query = format!(
            "UPSERT settings:{} CONTENT {{ store_id: {}, store_name: {}, address: {}, phone: {}, receipt_footer: {}, cashier_name: {}, logo_data_url: {}, tax_enabled: {}, tax_rate: {}, timezone: {} }} RETURN AFTER",
        session.store_id,
        surreal_string_literal(&session.store_id),
        surreal_string_literal(&settings.store_name),
        surreal_string_literal(&settings.address),
        surreal_string_literal(&settings.phone),
        surreal_string_literal(&settings.receipt_footer),
            surreal_string_literal(&settings.cashier_name),
            surreal_string_literal(&settings.logo_data_url),
            settings.tax_enabled,
            settings.tax_rate,
            surreal_string_literal(&settings.timezone)
    );
    let rows = run_surreal_query(query).await?;
    let saved = result_rows(&rows).into_iter().next().ok_or_else(|| "SurrealDB tidak mengembalikan pengaturan yang disimpan".to_string())?;
    serde_json::from_value(saved).map_err(|error| format!("Data pengaturan tersimpan tidak valid: {}", error))
}

#[tauri::command]
pub async fn create_transaction(
    session_id: String,
    items: Vec<serde_json::Value>,
    total: f64,
    subtotal: f64,
    tax: f64,
    payment: f64,
    change: f64,
    cashier_name: String,
    credit_customer: Option<String>,
    business_date: Option<String>,
) -> Result<String, String> {
    let session = require_session(&session_id)?;
    require_role(&session, &["owner", "manager", "cashier"])?;
    if ![total, subtotal, tax, payment, change].iter().all(|amount| amount.is_finite() && *amount >= 0.0) {
        return Err("Total transaksi tidak valid".into());
    }
    let credit_customer = credit_customer.map(|name| name.trim().to_owned()).filter(|name| !name.is_empty());
    if let Some(name) = credit_customer.as_ref() {
        if payment >= total {
            return Err("Pilih status Lunas jika pembayaran sudah mencukupi total".into());
        }
        if name.is_empty() { return Err("Pelanggan wajib dipilih untuk transaksi belum lunas".into()); }
    } else if payment < total {
        return Err("Pilih pelanggan atau lunasi pembayaran terlebih dahulu".into());
    }
    let business_date = business_date.unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());
    if chrono::NaiveDate::parse_from_str(&business_date, "%Y-%m-%d").is_err() {
        return Err("Tanggal transaksi tidak valid".into());
    }
    let current_month = chrono::Local::now().format("%Y-%m").to_string();
    let mut stock_changes: Vec<(String, f64, f64, String)> = Vec::new();
    for item in &items {
        let code = item.get("code").and_then(serde_json::Value::as_str).unwrap_or_default().trim();
        let quantity = item.get("qty").and_then(serde_json::Value::as_f64)
            .or_else(|| item.get("qty").and_then(serde_json::Value::as_i64).map(|value| value as f64))
            .unwrap_or(0.0);
        if code.is_empty() || !quantity.is_finite() || quantity <= 0.0 {
            rollback_product_stock(&session.store_id, &stock_changes).await;
            return Err("Rincian produk atau jumlah transaksi tidak valid".into());
        }
        let product_rows = match run_surreal_query(format!(
            "SELECT stock, monthly_sold, sales_month FROM products WHERE store_id = {} AND code = {} LIMIT 1",
            surreal_string_literal(&session.store_id), surreal_string_literal(code)
        )).await {
            Ok(rows) => result_rows(&rows),
            Err(error) => {
                rollback_product_stock(&session.store_id, &stock_changes).await;
                return Err(error);
            }
        };
        let Some(product) = product_rows.first() else {
            rollback_product_stock(&session.store_id, &stock_changes).await;
            return Err(format!("Produk dengan kode {} tidak ditemukan", code));
        };
        let stock = product.get("stock").and_then(serde_json::Value::as_f64)
            .or_else(|| product.get("stock").and_then(serde_json::Value::as_i64).map(|value| value as f64)).unwrap_or(0.0);
        let old_sales_month = product.get("sales_month").and_then(serde_json::Value::as_str).unwrap_or_default().to_owned();
        let old_monthly_sold = product.get("monthly_sold").and_then(serde_json::Value::as_f64)
            .or_else(|| product.get("monthly_sold").and_then(serde_json::Value::as_i64).map(|value| value as f64)).unwrap_or(0.0);
        if stock < quantity {
            rollback_product_stock(&session.store_id, &stock_changes).await;
            return Err(format!("Stok {} tidak mencukupi. Tersedia {}", code, stock));
        }
        let new_monthly_sold = if old_sales_month == current_month { old_monthly_sold + quantity } else { quantity };
        let updated = run_surreal_query(format!(
            "UPDATE products SET stock = stock - {}, monthly_sold = {}, sales_month = {} WHERE store_id = {} AND code = {} AND stock >= {} RETURN AFTER",
            quantity, new_monthly_sold, surreal_string_literal(&current_month),
            surreal_string_literal(&session.store_id), surreal_string_literal(code), quantity
        )).await;
        match updated {
            Ok(rows) if !result_rows(&rows).is_empty() => stock_changes.push((code.to_owned(), quantity, old_monthly_sold, old_sales_month)),
            Ok(_) => {
                rollback_product_stock(&session.store_id, &stock_changes).await;
                return Err(format!("Stok {} berubah atau tidak mencukupi", code));
            }
            Err(error) => {
                rollback_product_stock(&session.store_id, &stock_changes).await;
                return Err(error);
            }
        }
    }
    let transaction_id = format!("TRX-{}", uuid::Uuid::new_v4().simple());
    let item_description = items.iter().filter_map(|item| {
        let name = item.get("name").and_then(serde_json::Value::as_str)?;
        let quantity = item.get("qty").and_then(serde_json::Value::as_f64).unwrap_or(1.0);
        Some(format!("{} x{}", name, quantity))
    }).collect::<Vec<_>>().join(", ");
    let serialized_items = serde_json::to_string(&items).map_err(|error| format!("Item transaksi tidak valid: {}", error))?;
    let query = format!(
        "CREATE transactions SET transaction_id = {}, store_id = {}, cashier_id = {}, cashier_name = {}, items = {}, subtotal = {}, tax = {}, total = {}, payment = {}, change = {}, payment_method = 'Tunai', payment_status = {}, customer_name = {}, created_at = time::now() RETURN AFTER",
        surreal_string_literal(&transaction_id),
        surreal_string_literal(&session.store_id),
        surreal_string_literal(&session.user_id),
        surreal_string_literal(&cashier_name),
        serialized_items,
        subtotal,
        tax,
        total,
        payment,
        change,
        surreal_string_literal(if credit_customer.is_some() { "unpaid" } else { "paid" }),
        credit_customer.as_deref().map(surreal_string_literal).unwrap_or_else(|| "NONE".into())
    );
    if let Err(error) = run_surreal_query(query).await {
        rollback_product_stock(&session.store_id, &stock_changes).await;
        return Err(error);
    }
    if let Some(customer_name) = credit_customer {
        let description = if item_description.is_empty() { format!("Transaksi POS {}", transaction_id) } else { item_description };
        if let Err(error) = create_customer_debt(
            session_id,
            customer_name,
            description,
            total - payment,
            None,
            Some("receivable".into()),
            None,
            Some(business_date),
        ).await {
            let _ = run_surreal_query(format!(
                "DELETE transactions WHERE store_id = {} AND transaction_id = {}",
                surreal_string_literal(&session.store_id), surreal_string_literal(&transaction_id)
            )).await;
            rollback_product_stock(&session.store_id, &stock_changes).await;
            return Err(format!("Gagal mencatat bon pelanggan: {}", error));
        }
    }
    Ok(transaction_id)
}

async fn rollback_product_stock(store_id: &str, changes: &[(String, f64, f64, String)]) {
    for (code, quantity, previous_monthly_sold, previous_sales_month) in changes.iter().rev() {
        let _ = run_surreal_query(format!(
            "UPDATE products SET stock = stock + {}, monthly_sold = {}, sales_month = {} WHERE store_id = {} AND code = {}",
            quantity, previous_monthly_sold, surreal_string_literal(previous_sales_month),
            surreal_string_literal(store_id), surreal_string_literal(code)
        )).await;
    }
}

#[tauri::command]
pub async fn list_transactions(session_id: String) -> Result<Vec<serde_json::Value>, String> {
    let session = require_session(&session_id)?;
    let query = format!(
        "SELECT transaction_id, cashier_name, customer_name, payment_status, items, subtotal, tax, total, payment, change, payment_method, created_at FROM transactions WHERE store_id = {} ORDER BY created_at DESC LIMIT 500",
        surreal_string_literal(&session.store_id)
    );
    let rows = run_surreal_query(query).await?;
    Ok(result_rows(&rows))
}

#[tauri::command]
pub async fn delete_transaction(session_id: String, transaction_id: String) -> Result<(), String> {
    let session = require_session(&session_id)?;
    if transaction_id.trim().is_empty() {
        return Err("ID transaksi wajib diisi".into());
    }
    let deleted = run_surreal_query(format!(
        "DELETE transactions WHERE store_id = {} AND transaction_id = {} RETURN BEFORE",
        surreal_string_literal(&session.store_id), surreal_string_literal(&transaction_id)
    )).await?;
    if result_rows(&deleted).is_empty() {
        return Err("Transaksi tidak ditemukan".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn list_cash_entries(session_id: String) -> Result<Vec<serde_json::Value>, String> {
    let session = require_session(&session_id)?;
    let rows = run_surreal_query(format!(
        "SELECT * FROM cash_entries WHERE store_id = {} ORDER BY created_at DESC LIMIT 500",
        surreal_string_literal(&session.store_id)
    )).await?;
    let mut entries = result_rows(&rows);
    for entry in &mut entries {
        if let Some(record_id) = entry.get("id").and_then(surreal_cash_record_id) {
            if let Some(object) = entry.as_object_mut() {
                object.insert("record_id".into(), serde_json::Value::String(record_id));
            }
        }
    }
    Ok(entries)
}

fn surreal_cash_record_id(value: &serde_json::Value) -> Option<String> {
    if let Some(record_id) = value.as_str() {
        let key = record_id.strip_prefix("cash_entries:")?;
        let key = key.strip_prefix('⟨').and_then(|value| value.strip_suffix('⟩')).unwrap_or(key);
        return Some(format!("cash_entries:{}", key));
    }
    let object = value.as_object()?;
    let table = object.get("tb")?.as_str()?;
    let id = object.get("id")?;
    let key = id.as_str().or_else(|| id.get("String").and_then(serde_json::Value::as_str))?;
    (table == "cash_entries").then(|| format!("cash_entries:{}", key))
}

#[tauri::command]
pub async fn delete_cash_entry(session_id: String, entry_id: Option<String>, record_id: Option<String>) -> Result<(), String> {
    let session = require_session(&session_id)?;
    if let Some(entry_id) = entry_id.filter(|value| !value.trim().is_empty()) {
        let deleted = run_surreal_query(format!(
            "DELETE cash_entries WHERE store_id = {} AND entry_id = {} RETURN BEFORE",
            surreal_string_literal(&session.store_id), surreal_string_literal(&entry_id)
        )).await?;
        if result_rows(&deleted).is_empty() {
            return Err("Transaksi kas tidak ditemukan".into());
        }
        return Ok(());
    }

    let record_id = record_id.ok_or_else(|| "ID transaksi kas wajib diisi".to_string())?;
    let (table, key) = record_id.split_once(':').ok_or_else(|| "ID record transaksi kas tidak valid".to_string())?;
    if table != "cash_entries" || key.is_empty() || !key.chars().all(|character| character.is_ascii_alphanumeric() || character == '_' || character == '-') {
        return Err("ID record transaksi kas tidak valid".into());
    }
    let deleted = run_surreal_query(format!(
        "DELETE cash_entries:{} WHERE store_id = {} RETURN BEFORE",
        key, surreal_string_literal(&session.store_id)
    )).await?;
    if result_rows(&deleted).is_empty() {
        return Err("Transaksi kas tidak ditemukan".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn create_cash_entry(
    session_id: String,
    direction: String,
    category: String,
    description: String,
    amount: f64,
    cost_amount: Option<f64>,
    received: Option<f64>,
    payment_method: Option<String>,
    business_date: Option<String>,
    items: Option<Vec<serde_json::Value>>,
    source: Option<String>,
    credit_customer: Option<String>,
) -> Result<(), String> {
    let session = require_session(&session_id)?;
    if !["income", "expense"].contains(&direction.as_str()) || !amount.is_finite() || amount <= 0.0 || category.trim().is_empty() {
        return Err("Jenis, kategori, dan nominal kas wajib valid".into());
    }
    let cost_amount = cost_amount.unwrap_or(0.0);
    let received = received.unwrap_or(amount);
    let credit_customer = credit_customer.map(|name| name.trim().to_owned()).filter(|name| !name.is_empty());
    if !cost_amount.is_finite() || cost_amount < 0.0 || !received.is_finite() || received < 0.0 || (credit_customer.is_none() && received < amount) || (credit_customer.is_some() && received >= amount) {
        return Err("Biaya modal tidak valid atau uang diterima kurang dari nominal pemasukan".into());
    }
    let payment_method = payment_method.unwrap_or_else(|| "Tunai".into());
    let business_date = business_date.unwrap_or_default();
    let source = source.unwrap_or_else(|| "Kas Toko (Laci Kasir)".into());
    let entry_id = uuid::Uuid::new_v4().simple().to_string();
    let serialized_items = serde_json::to_string(&items.unwrap_or_default())
        .map_err(|error| format!("Rincian pemasukan tidak valid: {}", error))?;
    let change = (received - amount).max(0.0);
    run_surreal_query(format!(
        "CREATE cash_entries SET entry_id = {}, store_id = {}, direction = {}, category = {}, description = {}, amount = {}, cost_amount = {}, received = {}, change = {}, payment_method = {}, business_date = {}, source = {}, items = {}, payment_status = {}, customer_name = {}, created_by = {}, created_at = time::now()",
        surreal_string_literal(&entry_id), surreal_string_literal(&session.store_id), surreal_string_literal(&direction),
        surreal_string_literal(category.trim()), surreal_string_literal(description.trim()),
        amount, cost_amount, received, change, surreal_string_literal(&payment_method),
        surreal_string_literal(&business_date), surreal_string_literal(&source), serialized_items,
        surreal_string_literal(if credit_customer.is_some() { "unpaid" } else { "paid" }),
        credit_customer.as_deref().map(surreal_string_literal).unwrap_or_else(|| "NONE".into()), surreal_string_literal(&session.user_id)
    )).await?;
    if let Some(customer_name) = credit_customer {
        let debt_description = if description.trim().is_empty() { category.clone() } else { format!("{}: {}", category, description) };
        if let Err(error) = create_customer_debt(
            session_id,
            customer_name,
            debt_description,
            amount - received,
            None,
            Some("receivable".into()),
            None,
            Some(business_date),
        ).await {
            let _ = run_surreal_query(format!(
                "DELETE cash_entries WHERE store_id = {} AND entry_id = {}",
                surreal_string_literal(&session.store_id), surreal_string_literal(&entry_id)
            )).await;
            return Err(format!("Gagal mencatat bon pelanggan: {}", error));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn list_customer_debts(session_id: String) -> Result<Vec<serde_json::Value>, String> {
    let session = require_session(&session_id)?;
    let rows = run_surreal_query(format!(
        "SELECT * FROM customer_debts WHERE store_id = {} ORDER BY created_at DESC LIMIT 1000",
        surreal_string_literal(&session.store_id)
    )).await?;
    Ok(result_rows(&rows))
}

#[tauri::command]
pub async fn list_debt_payments(session_id: String) -> Result<Vec<serde_json::Value>, String> {
    let session = require_session(&session_id)?;
    let rows = run_surreal_query(format!(
        "SELECT * FROM debt_payments WHERE store_id = {} ORDER BY created_at DESC LIMIT 2000",
        surreal_string_literal(&session.store_id)
    )).await?;
    Ok(result_rows(&rows))
}

#[tauri::command]
pub async fn list_customer_names(session_id: String, debt_side: Option<String>) -> Result<Vec<serde_json::Value>, String> {
    let session = require_session(&session_id)?;
    let debt_side = debt_side.unwrap_or_else(|| "receivable".into());
    if !["receivable", "payable"].contains(&debt_side.as_str()) { return Err("Jenis utang tidak valid".into()); }
    let name_side_filter = if debt_side == "receivable" {
        format!("(party_type = {} OR party_type = NONE)", surreal_string_literal(&debt_side))
    } else {
        format!("party_type = {}", surreal_string_literal(&debt_side))
    };
    let registered = run_surreal_query(format!(
        "SELECT customer_name, phone, party_type, is_deleted FROM customer_names WHERE store_id = {} AND {} ORDER BY customer_name LIMIT 1000",
        surreal_string_literal(&session.store_id), name_side_filter
    )).await?;
    let existing_debts = run_surreal_query(format!(
        "SELECT customer_name FROM customer_debts WHERE store_id = {} AND (history_archived = false OR history_archived = NONE) AND (debt_side = {} OR (debt_side = NONE AND {} = 'receivable')) LIMIT 1000",
        surreal_string_literal(&session.store_id), surreal_string_literal(&debt_side), surreal_string_literal(&debt_side)
    )).await?;
    let mut names = result_rows(&registered);
    let mut seen: std::collections::HashSet<String> = names.iter()
        .filter_map(|row| row.get("customer_name").and_then(serde_json::Value::as_str).map(str::to_lowercase))
        .collect();
    for row in result_rows(&existing_debts) {
        if let Some(name) = row.get("customer_name").and_then(serde_json::Value::as_str) {
            if seen.insert(name.to_lowercase()) {
                names.push(serde_json::json!({"customer_name": name, "phone": ""}));
            }
        }
    }
    names.sort_by(|left, right| left.get("customer_name").and_then(serde_json::Value::as_str).unwrap_or_default()
        .to_lowercase().cmp(&right.get("customer_name").and_then(serde_json::Value::as_str).unwrap_or_default().to_lowercase()));
    Ok(names)
}

#[tauri::command]
pub async fn create_customer_debt(session_id: String, customer_name: String, description: String, amount: f64, phone: Option<String>, debt_side: Option<String>, due_date: Option<String>, business_date: Option<String>) -> Result<(), String> {
    let session = require_session(&session_id)?;
    if customer_name.trim().is_empty() || description.trim().is_empty() || !amount.is_finite() || amount <= 0.0 {
        return Err("Nama pelanggan, keterangan, dan nominal utang wajib valid".into());
    }
    let debt_side = debt_side.unwrap_or_else(|| "receivable".into());
    if !["receivable", "payable"].contains(&debt_side.as_str()) {
        return Err("Jenis utang tidak valid".into());
    }
    let phone = phone.unwrap_or_default();
    let due_date = due_date.unwrap_or_default();
    let business_date = business_date.unwrap_or_default();
    if !due_date.is_empty() && chrono::NaiveDate::parse_from_str(&due_date, "%Y-%m-%d").is_err() {
        return Err("Tanggal jatuh tempo tidak valid".into());
    }
    if !business_date.is_empty() && chrono::NaiveDate::parse_from_str(&business_date, "%Y-%m-%d").is_err() {
        return Err("Tanggal bon tidak valid".into());
    }
    let existing_name = run_surreal_query(format!(
        "SELECT customer_name FROM customer_names WHERE store_id = {} AND party_type = {} AND string::lowercase(customer_name) = {} LIMIT 1",
        surreal_string_literal(&session.store_id), surreal_string_literal(&debt_side), surreal_string_literal(&customer_name.trim().to_lowercase())
    )).await?;
    if result_rows(&existing_name).is_empty() {
        run_surreal_query(format!(
            "CREATE customer_names SET store_id = {}, customer_name = {}, phone = {}, party_type = {}, is_deleted = false, created_at = time::now()",
            surreal_string_literal(&session.store_id), surreal_string_literal(customer_name.trim()), surreal_string_literal(phone.trim()), surreal_string_literal(&debt_side)
        )).await?;
    } else if !phone.trim().is_empty() {
        run_surreal_query(format!(
            "UPDATE customer_names SET phone = {}, is_deleted = false WHERE store_id = {} AND party_type = {} AND string::lowercase(customer_name) = {}",
            surreal_string_literal(phone.trim()), surreal_string_literal(&session.store_id), surreal_string_literal(&debt_side), surreal_string_literal(&customer_name.trim().to_lowercase())
        )).await?;
    } else {
        run_surreal_query(format!(
            "UPDATE customer_names SET is_deleted = false WHERE store_id = {} AND party_type = {} AND string::lowercase(customer_name) = {}",
            surreal_string_literal(&session.store_id), surreal_string_literal(&debt_side), surreal_string_literal(&customer_name.trim().to_lowercase())
        )).await?;
    }
    let debt_id = uuid::Uuid::new_v4().simple().to_string();
    run_surreal_query(format!(
        "CREATE customer_debts SET debt_id = {}, store_id = {}, debt_side = {}, customer_name = {}, description = {}, amount = {}, paid = 0, remaining = {}, due_date = {}, business_date = {}, history_archived = false, created_by = {}, created_at = time::now()",
        surreal_string_literal(&debt_id), surreal_string_literal(&session.store_id),
        surreal_string_literal(&debt_side), surreal_string_literal(customer_name.trim()), surreal_string_literal(description.trim()), amount, amount,
        surreal_string_literal(&due_date), surreal_string_literal(&business_date), surreal_string_literal(&session.user_id)
    )).await?;
    Ok(())
}

#[tauri::command]
pub async fn add_debt_payment(session_id: String, debt_id: String, amount: f64, note: Option<String>, business_date: Option<String>) -> Result<(), String> {
    let session = require_session(&session_id)?;
    if debt_id.trim().is_empty() || !amount.is_finite() || amount <= 0.0 {
        return Err("ID utang dan nominal cicilan wajib valid".into());
    }
    let business_date = business_date.unwrap_or_default();
    if !business_date.is_empty() && chrono::NaiveDate::parse_from_str(&business_date, "%Y-%m-%d").is_err() {
        return Err("Tanggal pembayaran tidak valid".into());
    }
    let updated = run_surreal_query(format!(
        "UPDATE customer_debts SET paid += {}, remaining -= {} WHERE debt_id = {} AND store_id = {} AND remaining >= {} RETURN AFTER",
        amount, amount, surreal_string_literal(&debt_id), surreal_string_literal(&session.store_id), amount
    )).await?;
    if result_rows(&updated).is_empty() {
        return Err("Utang tidak ditemukan atau nominal cicilan melebihi sisa utang".into());
    }
    let debt_side = result_rows(&updated)
        .first()
        .and_then(|row| row.get("debt_side"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or("receivable")
        .to_owned();
    let note = note.unwrap_or_default();
    run_surreal_query(format!(
        "CREATE debt_payments SET debt_id = {}, store_id = {}, customer_name = {}, debt_side = {}, payment_type = 'received', amount = {}, note = {}, business_date = {}, created_by = {}, created_at = time::now()",
        surreal_string_literal(&debt_id), surreal_string_literal(&session.store_id),
        surreal_string_literal(updated_debt_name(&updated)), surreal_string_literal(&debt_side), amount,
        surreal_string_literal(&note), surreal_string_literal(&business_date), surreal_string_literal(&session.user_id)
    )).await?;
    Ok(())
}

#[tauri::command]
pub async fn edit_customer_debt_amount(session_id: String, debt_id: String, amount: f64) -> Result<(), String> {
    let session = require_session(&session_id)?;
    if debt_id.trim().is_empty() || !amount.is_finite() || amount <= 0.0 {
        return Err("ID bon dan nominal baru wajib valid".into());
    }
    let current = run_surreal_query(format!(
        "SELECT paid FROM customer_debts WHERE store_id = {} AND debt_id = {} LIMIT 1",
        surreal_string_literal(&session.store_id), surreal_string_literal(&debt_id)
    )).await?;
    let row = result_rows(&current).into_iter().next().ok_or_else(|| "Bon tidak ditemukan".to_string())?;
    let paid = row.get("paid").and_then(serde_json::Value::as_f64).unwrap_or(0.0);
    if amount < paid {
        return Err("Nominal bon tidak boleh lebih kecil dari pembayaran yang sudah diterima".into());
    }
    run_surreal_query(format!(
        "UPDATE customer_debts SET amount = {}, remaining = {} - paid WHERE store_id = {} AND debt_id = {}",
        amount, amount, surreal_string_literal(&session.store_id), surreal_string_literal(&debt_id)
    )).await?;
    Ok(())
}

#[tauri::command]
pub async fn set_customer_debt_due_date(session_id: String, customer_name: String, due_date: String) -> Result<(), String> {
    let session = require_session(&session_id)?;
    let name = customer_name.trim();
    if name.is_empty() || chrono::NaiveDate::parse_from_str(&due_date, "%Y-%m-%d").is_err() {
        return Err("Nama pelanggan atau tanggal jatuh tempo tidak valid".into());
    }
    let rows = run_surreal_query(format!(
        "UPDATE customer_debts SET due_date = {} WHERE store_id = {} AND customer_name = {} AND remaining > 0 RETURN AFTER",
        surreal_string_literal(&due_date), surreal_string_literal(&session.store_id), surreal_string_literal(name)
    )).await?;
    if result_rows(&rows).is_empty() {
        return Err("Tidak ada utang aktif untuk pelanggan ini".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn get_customer_debt_history(session_id: String, customer_name: String, debt_side: Option<String>) -> Result<serde_json::Value, String> {
    let session = require_session(&session_id)?;
    let name = customer_name.trim();
    let debt_side = debt_side.unwrap_or_else(|| "receivable".into());
    if !["receivable", "payable"].contains(&debt_side.as_str()) { return Err("Jenis utang tidak valid".into()); }
    if name.is_empty() { return Err("Nama pelanggan wajib diisi".into()); }
    let debt_rows = run_surreal_query(format!(
        "SELECT * FROM customer_debts WHERE store_id = {} AND customer_name = {} AND debt_side = {} ORDER BY created_at DESC LIMIT 500",
        surreal_string_literal(&session.store_id), surreal_string_literal(name), surreal_string_literal(&debt_side)
    )).await?;
    let debts = result_rows(&debt_rows);
    let debt_ids: Vec<String> = debts.iter().filter_map(|debt| debt.get("debt_id").and_then(serde_json::Value::as_str).map(str::to_owned)).collect();
    let payments = if debt_ids.is_empty() {
        Vec::new()
    } else {
        let ids = debt_ids.iter().map(|id| surreal_string_literal(id)).collect::<Vec<_>>().join(", ");
        let rows = run_surreal_query(format!(
            "SELECT * FROM debt_payments WHERE store_id = {} AND debt_id IN [{}] ORDER BY created_at DESC LIMIT 1000",
            surreal_string_literal(&session.store_id), ids
        )).await?;
        result_rows(&rows)
    };
    let customer_rows = run_surreal_query(format!(
        "SELECT customer_name, phone FROM customer_names WHERE store_id = {} AND party_type = {} AND customer_name = {} LIMIT 1",
        surreal_string_literal(&session.store_id), surreal_string_literal(&debt_side), surreal_string_literal(name)
    )).await?;
    let customer = result_rows(&customer_rows).into_iter().next().unwrap_or_else(|| serde_json::json!({"customer_name": name, "phone": ""}));
    Ok(serde_json::json!({"customer": customer, "debts": debts, "payments": payments, "debt_side": debt_side}))
}

#[tauri::command]
pub async fn delete_customer_debt(session_id: String, debt_id: String) -> Result<(), String> {
    let session = require_session(&session_id)?;
    if debt_id.trim().is_empty() {
        return Err("ID bon wajib diisi".into());
    }
    let selected = run_surreal_query(format!(
        "SELECT debt_id, customer_name, amount, remaining, debt_side FROM customer_debts WHERE store_id = {} AND debt_id = {} LIMIT 1",
        surreal_string_literal(&session.store_id), surreal_string_literal(&debt_id)
    )).await?;
    let debt = result_rows(&selected).into_iter().next().ok_or_else(|| "Bon tidak ditemukan".to_string())?;
    let remaining = debt.get("remaining").and_then(serde_json::Value::as_f64).unwrap_or(0.0);
    if remaining > 0.0 {
        return Err("Bon aktif masih memiliki sisa utang, lunaskan dulu sebelum dihapus".into());
    }
    let customer_name = debt.get("customer_name").and_then(serde_json::Value::as_str).unwrap_or("").trim();
    let debt_side = debt.get("debt_side").and_then(serde_json::Value::as_str).unwrap_or("receivable");
    run_surreal_query(format!(
        "DELETE customer_debts WHERE store_id = {} AND debt_id = {}",
        surreal_string_literal(&session.store_id), surreal_string_literal(&debt_id)
    )).await?;
    run_surreal_query(format!(
        "DELETE debt_payments WHERE store_id = {} AND debt_id = {}",
        surreal_string_literal(&session.store_id), surreal_string_literal(&debt_id)
    )).await?;
    if !customer_name.is_empty() {
        let exists = run_surreal_query(format!(
            "SELECT debt_id FROM customer_debts WHERE store_id = {} AND customer_name = {} AND debt_side = {} LIMIT 1",
            surreal_string_literal(&session.store_id), surreal_string_literal(customer_name), surreal_string_literal(debt_side)
        )).await?;
        if result_rows(&exists).is_empty() {
            let _ = run_surreal_query(format!(
                "CREATE customer_names SET store_id = {}, customer_name = {}, phone = '', party_type = {}, created_at = time::now()",
                surreal_string_literal(&session.store_id), surreal_string_literal(customer_name), surreal_string_literal(debt_side)
            )).await?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn archive_customer_debt_history(session_id: String, customer_name: String, debt_side: Option<String>) -> Result<(), String> {
    let session = require_session(&session_id)?;
    let name = customer_name.trim();
    let debt_side = debt_side.unwrap_or_else(|| "receivable".into());
    if !["receivable", "payable"].contains(&debt_side.as_str()) { return Err("Jenis utang tidak valid".into()); }
    if name.is_empty() { return Err("Nama pelanggan wajib diisi".into()); }
    let debt_side_filter = if debt_side == "receivable" {
        format!("(debt_side = {} OR debt_side = NONE)", surreal_string_literal(&debt_side))
    } else {
        format!("debt_side = {}", surreal_string_literal(&debt_side))
    };
    let rows = run_surreal_query(format!(
        "SELECT debt_id, remaining FROM customer_debts WHERE store_id = {} AND customer_name = {} AND {}",
        surreal_string_literal(&session.store_id), surreal_string_literal(name), debt_side_filter
    )).await?;
    let debts = result_rows(&rows);
    if debts.is_empty() { return Err("Riwayat utang tidak ditemukan".into()); }
    if debts.iter().any(|debt| debt.get("remaining").and_then(serde_json::Value::as_f64).unwrap_or(0.0) > 0.0) {
        return Err("Riwayat hanya dapat dihapus setelah semua utang lunas".into());
    }
    let party_side_filter = if debt_side == "receivable" {
        format!("(party_type = {} OR party_type = NONE)", surreal_string_literal(&debt_side))
    } else {
        format!("party_type = {}", surreal_string_literal(&debt_side))
    };
    let customer = run_surreal_query(format!(
        "SELECT customer_name, phone FROM customer_names WHERE store_id = {} AND {} AND string::lowercase(customer_name) = {} LIMIT 1",
        surreal_string_literal(&session.store_id), party_side_filter, surreal_string_literal(&name.to_lowercase())
    )).await?;
    if result_rows(&customer).is_empty() {
        run_surreal_query(format!(
            "CREATE customer_names SET store_id = {}, customer_name = {}, phone = '', party_type = {}, is_deleted = false, created_at = time::now()",
            surreal_string_literal(&session.store_id), surreal_string_literal(name), surreal_string_literal(&debt_side)
        )).await?;
    } else {
        run_surreal_query(format!(
            "UPDATE customer_names SET is_deleted = false, party_type = {} WHERE store_id = {} AND {} AND string::lowercase(customer_name) = {}",
            surreal_string_literal(&debt_side), surreal_string_literal(&session.store_id), party_side_filter, surreal_string_literal(&name.to_lowercase())
        )).await?;
    }
    let ids = debts.iter().filter_map(|debt| debt.get("debt_id").and_then(serde_json::Value::as_str))
        .map(surreal_string_literal).collect::<Vec<_>>().join(", ");
    run_surreal_query(format!(
        "DELETE customer_debts WHERE store_id = {} AND customer_name = {} AND {}; DELETE debt_payments WHERE store_id = {} AND debt_id IN [{}]",
        surreal_string_literal(&session.store_id), surreal_string_literal(name), debt_side_filter,
        surreal_string_literal(&session.store_id), ids
    )).await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_customer_name(session_id: String, customer_name: String, debt_side: Option<String>) -> Result<(), String> {
    let session = require_session(&session_id)?;
    let name = customer_name.trim();
    let debt_side = debt_side.unwrap_or_else(|| "receivable".into());
    if !["receivable", "payable"].contains(&debt_side.as_str()) { return Err("Jenis utang tidak valid".into()); }
    if name.is_empty() { return Err("Nama pelanggan wajib diisi".into()); }
    let debt_side_filter = if debt_side == "receivable" {
        format!("(debt_side = {} OR debt_side = NONE)", surreal_string_literal(&debt_side))
    } else {
        format!("debt_side = {}", surreal_string_literal(&debt_side))
    };
    let rows = run_surreal_query(format!(
        "SELECT debt_id FROM customer_debts WHERE store_id = {} AND customer_name = {} AND {}",
        surreal_string_literal(&session.store_id), surreal_string_literal(name), debt_side_filter
    )).await?;
    let ids = result_rows(&rows).iter()
        .filter_map(|debt| debt.get("debt_id").and_then(serde_json::Value::as_str))
        .map(surreal_string_literal).collect::<Vec<_>>().join(", ");
    if !ids.is_empty() {
        run_surreal_query(format!(
            "DELETE debt_payments WHERE store_id = {} AND debt_id IN [{}]",
            surreal_string_literal(&session.store_id), ids
        )).await?;
    }
    let party_side_filter = if debt_side == "receivable" {
        format!("(party_type = {} OR party_type = NONE)", surreal_string_literal(&debt_side))
    } else {
        format!("party_type = {}", surreal_string_literal(&debt_side))
    };
    run_surreal_query(format!(
        "DELETE customer_debts WHERE store_id = {} AND customer_name = {} AND {}; DELETE customer_names WHERE store_id = {} AND {} AND string::lowercase(customer_name) = {}",
        surreal_string_literal(&session.store_id), surreal_string_literal(name), debt_side_filter,
        surreal_string_literal(&session.store_id), party_side_filter, surreal_string_literal(&name.to_lowercase())
    )).await?;
    Ok(())
}

fn updated_debt_name(rows: &[serde_json::Value]) -> &str {
    rows.first().and_then(|row| row.get("customer_name")).and_then(serde_json::Value::as_str).unwrap_or("")
}

#[tauri::command]
pub async fn list_savings_entries(session_id: String) -> Result<Vec<serde_json::Value>, String> {
    let session = require_session(&session_id)?;
    let rows = run_surreal_query(format!(
        "SELECT * FROM savings_entries WHERE store_id = {} ORDER BY created_at DESC LIMIT 500",
        surreal_string_literal(&session.store_id)
    )).await?;
    Ok(result_rows(&rows))
}

#[tauri::command]
pub async fn list_savings_accounts(session_id: String) -> Result<Vec<serde_json::Value>, String> {
    let session = require_session(&session_id)?;
    let accounts = run_surreal_query(format!(
        "SELECT * FROM savings_accounts WHERE store_id = {} ORDER BY created_at DESC LIMIT 1000",
        surreal_string_literal(&session.store_id)
    )).await?;
    let entries = run_surreal_query(format!(
        "SELECT * FROM savings_entries WHERE store_id = {} ORDER BY created_at DESC LIMIT 2000",
        surreal_string_literal(&session.store_id)
    )).await?;
    let mut grouped: std::collections::BTreeMap<String, serde_json::Value> = std::collections::BTreeMap::new();
    for account in result_rows(&accounts) {
        let account_id = account.get("account_id").and_then(serde_json::Value::as_str).unwrap_or_default().to_owned();
        let name = account.get("name").and_then(serde_json::Value::as_str).unwrap_or_default().to_owned();
        grouped.insert(account_id.clone(), serde_json::json!({
            "account_id": account_id,
            "name": name,
            "phone": account.get("phone").cloned().unwrap_or_else(|| serde_json::json!("")),
            "balance": 0.0,
            "total_deposited": 0.0,
            "total_withdrawn": 0.0,
            "transaction_count": 0,
            "created_at": account.get("created_at").cloned().unwrap_or(serde_json::Value::Null)
        }));
    }
    for entry in result_rows(&entries) {
        let name = entry.get("name").and_then(serde_json::Value::as_str).unwrap_or_default().to_owned();
        if name.is_empty() { continue; }
        let account_id = entry.get("account_id").and_then(serde_json::Value::as_str).map(str::to_owned)
            .unwrap_or_else(|| format!("legacy:{}", name));
        let account = grouped.entry(account_id.clone()).or_insert_with(|| serde_json::json!({
            "account_id": account_id,
            "name": name,
            "phone": "",
            "balance": 0.0,
            "total_deposited": 0.0,
            "total_withdrawn": 0.0,
            "transaction_count": 0,
            "created_at": entry.get("created_at").cloned().unwrap_or(serde_json::Value::Null)
        }));
        let amount = entry.get("amount").and_then(serde_json::Value::as_f64).unwrap_or(0.0);
        let direction = entry.get("direction").and_then(serde_json::Value::as_str).unwrap_or("deposit");
        let balance = account.get("balance").and_then(serde_json::Value::as_f64).unwrap_or(0.0);
        let deposited = account.get("total_deposited").and_then(serde_json::Value::as_f64).unwrap_or(0.0);
        let withdrawn = account.get("total_withdrawn").and_then(serde_json::Value::as_f64).unwrap_or(0.0);
        let count = account.get("transaction_count").and_then(serde_json::Value::as_u64).unwrap_or(0);
        account["balance"] = serde_json::json!(balance + if direction == "withdraw" { -amount } else { amount });
        account["total_deposited"] = serde_json::json!(deposited + if direction == "deposit" { amount } else { 0.0 });
        account["total_withdrawn"] = serde_json::json!(withdrawn + if direction == "withdraw" { amount } else { 0.0 });
        account["transaction_count"] = serde_json::json!(count + 1);
    }
    let mut result = grouped.into_values().collect::<Vec<_>>();
    result.sort_by(|left, right| left.get("name").and_then(serde_json::Value::as_str).unwrap_or_default().to_lowercase()
        .cmp(&right.get("name").and_then(serde_json::Value::as_str).unwrap_or_default().to_lowercase()));
    Ok(result)
}

#[tauri::command]
pub async fn get_savings_account_history(session_id: String, account_id: String) -> Result<serde_json::Value, String> {
    let session = require_session(&session_id)?;
    if account_id.trim().is_empty() { return Err("Rekening tabungan tidak valid".into()); }
    let legacy_name = account_id.strip_prefix("legacy:");
    let account = if let Some(name) = legacy_name {
        serde_json::json!({"account_id": account_id, "name": name, "phone": ""})
    } else {
        let rows = run_surreal_query(format!(
            "SELECT * FROM savings_accounts WHERE store_id = {} AND account_id = {} LIMIT 1",
            surreal_string_literal(&session.store_id), surreal_string_literal(&account_id)
        )).await?;
        result_rows(&rows).into_iter().next().ok_or_else(|| "Rekening tabungan tidak ditemukan".to_string())?
    };
    let name = account.get("name").and_then(serde_json::Value::as_str).unwrap_or_default();
    let filter = if legacy_name.is_some() {
        format!("name = {} AND account_id = NONE", surreal_string_literal(name))
    } else {
        format!("account_id = {}", surreal_string_literal(&account_id))
    };
    let rows = run_surreal_query(format!(
        "SELECT * FROM savings_entries WHERE store_id = {} AND {} ORDER BY created_at DESC LIMIT 1000",
        surreal_string_literal(&session.store_id), filter
    )).await?;
    let entries = result_rows(&rows);
    let balance = entries.iter().fold(0.0, |sum, entry| {
        let amount = entry.get("amount").and_then(serde_json::Value::as_f64).unwrap_or(0.0);
        if entry.get("direction").and_then(serde_json::Value::as_str) == Some("withdraw") { sum - amount } else { sum + amount }
    });
    Ok(serde_json::json!({"account": account, "entries": entries, "balance": balance}))
}

#[tauri::command]
pub async fn create_savings_account(session_id: String, name: String, phone: Option<String>, opening_amount: f64, business_date: String, note: Option<String>) -> Result<String, String> {
    let session = require_session(&session_id)?;
    let name = name.trim();
    if name.is_empty() || !opening_amount.is_finite() || opening_amount < 0.0 || chrono::NaiveDate::parse_from_str(&business_date, "%Y-%m-%d").is_err() {
        return Err("Nama nasabah, setoran awal, atau tanggal tidak valid".into());
    }
    let exists = run_surreal_query(format!(
        "SELECT account_id FROM savings_accounts WHERE store_id = {} AND string::lowercase(name) = {} LIMIT 1",
        surreal_string_literal(&session.store_id), surreal_string_literal(&name.to_lowercase())
    )).await?;
    if !result_rows(&exists).is_empty() { return Err("Nasabah tabungan dengan nama tersebut sudah ada".into()); }
    let legacy_exists = run_surreal_query(format!(
        "SELECT name FROM savings_entries WHERE store_id = {} AND account_id = NONE AND string::lowercase(name) = {} LIMIT 1",
        surreal_string_literal(&session.store_id), surreal_string_literal(&name.to_lowercase())
    )).await?;
    if !result_rows(&legacy_exists).is_empty() { return Err("Nasabah tabungan dengan nama tersebut sudah ada".into()); }
    let account_id = uuid::Uuid::new_v4().simple().to_string();
    run_surreal_query(format!(
        "CREATE savings_accounts SET account_id = {}, store_id = {}, name = {}, phone = {}, created_by = {}, created_at = time::now()",
        surreal_string_literal(&account_id), surreal_string_literal(&session.store_id), surreal_string_literal(name),
        surreal_string_literal(phone.unwrap_or_default().trim()), surreal_string_literal(&session.user_id)
    )).await?;
    if opening_amount > 0.0 {
        run_surreal_query(format!(
            "CREATE savings_entries SET store_id = {}, account_id = {}, name = {}, direction = 'deposit', amount = {}, note = {}, business_date = {}, created_by = {}, created_at = time::now()",
            surreal_string_literal(&session.store_id), surreal_string_literal(&account_id), surreal_string_literal(name), opening_amount,
            surreal_string_literal(&note.unwrap_or_default()), surreal_string_literal(&business_date), surreal_string_literal(&session.user_id)
        )).await?;
    }
    Ok(account_id)
}

#[tauri::command]
pub async fn add_savings_transaction(session_id: String, account_id: String, direction: String, amount: f64, note: Option<String>, business_date: String) -> Result<(), String> {
    let session = require_session(&session_id)?;
    if account_id.trim().is_empty() || !["deposit", "withdraw"].contains(&direction.as_str()) || !amount.is_finite() || amount <= 0.0 || chrono::NaiveDate::parse_from_str(&business_date, "%Y-%m-%d").is_err() {
        return Err("Rekening, jenis transaksi, nominal, atau tanggal tidak valid".into());
    }
    let legacy_name = account_id.strip_prefix("legacy:");
    let name = if let Some(name) = legacy_name {
        name.to_owned()
    } else {
        let account = run_surreal_query(format!(
            "SELECT account_id, name FROM savings_accounts WHERE store_id = {} AND account_id = {} LIMIT 1",
            surreal_string_literal(&session.store_id), surreal_string_literal(&account_id)
        )).await?;
        let account = result_rows(&account).into_iter().next().ok_or_else(|| "Rekening tabungan tidak ditemukan".to_string())?;
        account.get("name").and_then(serde_json::Value::as_str).unwrap_or_default().to_owned()
    };
    let entry_filter = if legacy_name.is_some() {
        format!("name = {} AND account_id = NONE", surreal_string_literal(&name))
    } else {
        format!("account_id = {}", surreal_string_literal(&account_id))
    };
    if direction == "withdraw" {
        let entries = run_surreal_query(format!(
            "SELECT direction, amount FROM savings_entries WHERE store_id = {} AND {}",
            surreal_string_literal(&session.store_id), entry_filter
        )).await?;
        let balance = result_rows(&entries).iter().fold(0.0, |sum, entry| {
            let value = entry.get("amount").and_then(serde_json::Value::as_f64).unwrap_or(0.0);
            if entry.get("direction").and_then(serde_json::Value::as_str) == Some("withdraw") { sum - value } else { sum + value }
        });
        if amount > balance { return Err(format!("Saldo tabungan tidak mencukupi. Saldo saat ini Rp {}", balance.round() as i64)); }
    }
    run_surreal_query(format!(
        "CREATE savings_entries SET store_id = {}, account_id = {}, name = {}, direction = {}, amount = {}, note = {}, business_date = {}, created_by = {}, created_at = time::now()",
        surreal_string_literal(&session.store_id), if legacy_name.is_some() { "NONE".into() } else { surreal_string_literal(&account_id) }, surreal_string_literal(&name), surreal_string_literal(&direction), amount,
        surreal_string_literal(&note.unwrap_or_default()), surreal_string_literal(&business_date), surreal_string_literal(&session.user_id)
    )).await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_savings_account(session_id: String, account_id: String) -> Result<(), String> {
    let session = require_session(&session_id)?;
    if let Some(name) = account_id.strip_prefix("legacy:") {
        run_surreal_query(format!(
            "DELETE savings_entries WHERE store_id = {} AND name = {} AND account_id = NONE",
            surreal_string_literal(&session.store_id), surreal_string_literal(name)
        )).await?;
        return Ok(());
    }
    let account = run_surreal_query(format!(
        "SELECT name FROM savings_accounts WHERE store_id = {} AND account_id = {} LIMIT 1",
        surreal_string_literal(&session.store_id), surreal_string_literal(&account_id)
    )).await?;
    let account = result_rows(&account).into_iter().next().ok_or_else(|| "Rekening tabungan tidak ditemukan".to_string())?;
    let name = account.get("name").and_then(serde_json::Value::as_str).unwrap_or_default();
    run_surreal_query(format!(
        "DELETE savings_entries WHERE store_id = {} AND account_id = {}; DELETE savings_accounts WHERE store_id = {} AND account_id = {}",
        surreal_string_literal(&session.store_id), surreal_string_literal(&account_id),
        surreal_string_literal(&session.store_id), surreal_string_literal(&account_id)
    )).await?;
    let _ = name;
    Ok(())
}

#[tauri::command]
pub async fn create_savings_entry(session_id: String, name: String, direction: String, amount: f64) -> Result<(), String> {
    let session = require_session(&session_id)?;
    if name.trim().is_empty() || !["deposit", "withdraw"].contains(&direction.as_str()) || !amount.is_finite() || amount <= 0.0 {
        return Err("Nama tabungan, jenis transaksi, dan nominal wajib valid".into());
    }
    run_surreal_query(format!(
        "CREATE savings_entries SET store_id = {}, name = {}, direction = {}, amount = {}, created_by = {}, created_at = time::now()",
        surreal_string_literal(&session.store_id), surreal_string_literal(name.trim()),
        surreal_string_literal(&direction), amount, surreal_string_literal(&session.user_id)
    )).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_connect_to_surrealdb() {
        connect_to_stb_db().await.expect("Koneksi ke SurrealDB gagal");
        assert!(*get_connection_status().lock().await);
    }

    #[tokio::test]
    async fn test_db_query() {
        connect_to_stb_db().await.expect("Setup koneksi gagal");
        run_surreal_query("INFO FOR DB".into()).await.expect("Query INFO FOR DB gagal");
    }
}
