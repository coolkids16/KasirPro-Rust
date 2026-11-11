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
        db::auth_bootstrap_status,
        db::register_owner,
        db::login_user,
        db::logout_user,
        db::validate_session,
        db::list_store_staff,
        db::create_store_staff,
        db::delete_store_staff,
        db::get_products,
        db::add_product,
        db::adjust_product_stock,
        db::delete_product,
        db::get_store_settings,
        db::save_store_settings,
        db::create_transaction,
        db::list_transactions,
        db::delete_transaction,
        db::list_cash_entries,
        db::delete_cash_entry,
        db::create_cash_entry,
        db::list_customer_debts,
        db::list_debt_payments,
        db::list_customer_names,
        db::get_customer_debt_history,
        db::create_customer_debt,
        db::add_debt_payment,
        db::edit_customer_debt_amount,
        db::delete_customer_debt,
        db::set_customer_debt_due_date,
        db::archive_customer_debt_history,
        db::delete_customer_name,
        db::list_savings_entries,
        db::create_savings_entry,
        db::list_savings_accounts,
        db::get_savings_account_history,
        db::create_savings_account,
        db::add_savings_transaction,
        db::delete_savings_account
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
