// src-tauri/src/lib.rs

mod printer;
mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
    .setup(|_app| {
        tauri::async_runtime::spawn(async {
            if let Err(e) = db::connect_to_stb_db().await {
                eprintln!("Gagal terhubung ke database STB: {}", e);
            }
        });
        Ok(())
    })
    .invoke_handler(tauri::generate_handler![
        printer::print_receipt_command,
        db::test_db_connection,
        db::get_products,
        db::add_product,
        db::adjust_product_stock,
        db::delete_product,
        db::get_store_settings,
        db::save_store_settings,
        db::create_transaction
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
