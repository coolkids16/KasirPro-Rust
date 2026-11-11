use tokio;

#[tokio::test]
async fn test_surrealdb_http() {
    match test_http_connection().await {
        Ok(msg) => println!("✓ {}", msg),
        Err(e) => panic!("✗ Connection failed: {}", e),
    }
}

async fn test_http_connection() -> Result<String, Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let url = std::env::var("KASIRPRO_DB_URL").unwrap_or_else(|_| "http://192.168.0.102:8000".into());
    let username = std::env::var("KASIRPRO_DB_USERNAME").unwrap_or_else(|_| "root".into());
    let password = std::env::var("KASIRPRO_DB_PASSWORD").unwrap_or_else(|_| "namikaze".into());
    let namespace = std::env::var("KASIRPRO_DB_NAMESPACE").unwrap_or_else(|_| "kasirpro-ns".into());
    let database = std::env::var("KASIRPRO_DB_NAME").unwrap_or_else(|_| "kasirpro_db".into());
    let response = client
        .post(format!("{}/sql", url.trim_end_matches('/')))
        .basic_auth(username, Some(password))
        .header("Surreal-Ns", namespace)
        .header("Surreal-Db", database)
        .body("INFO FOR DB")
        .send()
        .await?;
    
    let status = response.status();
    let text = response.text().await?;
    
    if status.is_success() {
        Ok(format!("Berhasil terhubung ke SurrealDB!\nResponse: {}", text))
    } else {
        Err(format!("HTTP {} - Response: {}", status, text).into())
    }
}
