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
    
    // Test HTTP endpoint SurrealDB - query database
    let response = client
        .post("http://192.168.0.102:8000/sql")
        .basic_auth("root", Some("root"))
        .body("USE NS kasirpro_ns DB kasirpro_db; INFO FOR DB;")
        .send()
        .await?;
    
    let status = response.status();
    let text = response.text().await?;
    
    if status.is_success() {
        Ok(format!("Berhasil terhubung ke SurrealDB STB!\nNamespace: kasirpro_ns\nDatabase: kasirpro_db\nResponse: {}", text))
    } else {
        Err(format!("HTTP {} - Response: {}", status, text).into())
    }
}
