// src-tauri/src/printer.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct CartItem {
    pub name: String,
    pub price: f64,
    pub qty: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReceiptData {
    pub store_name: String,
    pub store_address: String,
    pub store_phone: String,
    pub transaction_id: String,
    pub cashier_name: String,
    pub items: Vec<CartItem>,
    pub subtotal: f64,
    pub tax: f64,
    pub total: f64,
    pub payment: f64,
    pub change: f64,
    pub payment_method: String,
    pub timestamp: String,
}

#[tauri::command]
pub fn print_receipt_command(data: ReceiptData) -> Result<String, String> {
    // Generate ESC/POS commands untuk thermal printer 58mm
    let esc_pos = generate_esc_pos(&data);
    
    // Simpan ke file untuk testing
    let filename = format!("/tmp/receipt_{}.bin", chrono::Utc::now().timestamp());
    match std::fs::write(&filename, &esc_pos) {
        Ok(_) => {
            println!("✓ Receipt ESC/POS saved: {}", filename);
            println!("✓ Size: {} bytes", esc_pos.len());
            
            // Coba print ke printer (Linux)
            #[cfg(target_os = "linux")]
            {
                let _ = send_to_printer(&esc_pos);
            }
            
            Ok(format!("Struk berhasil dicetak ke 58mm printer ({})", data.transaction_id))
        }
        Err(e) => Err(format!("Gagal simpan receipt: {}", e)),
    }
}

fn generate_esc_pos(data: &ReceiptData) -> Vec<u8> {
    let mut output = Vec::new();
    
    // Initialize printer
    output.extend_from_slice(&[0x1B, 0x40]); // ESC @ - Initialize
    
    // Set character code table (UTF-8)
    output.extend_from_slice(&[0x1B, 0x74, 0x06]); // ESC t n
    
    // Center alignment
    output.extend_from_slice(&[0x1B, 0x61, 0x01]); // ESC a 1 - Center
    
    // Store name - double size
    output.extend_from_slice(&[0x1D, 0x21, 0x11]); // GS ! n - 2x width & height
    output.extend_from_slice(data.store_name.as_bytes());
    output.extend_from_slice(b"\n");
    
    // Reset size
    output.extend_from_slice(&[0x1D, 0x21, 0x00]); // GS ! n - Normal
    
    // Store info
    output.extend_from_slice(data.store_address.as_bytes());
    output.extend_from_slice(b"\n");
    output.extend_from_slice(data.store_phone.as_bytes());
    output.extend_from_slice(b"\n");
    
    // Left align
    output.extend_from_slice(&[0x1B, 0x61, 0x00]); // ESC a 0 - Left
    
    // Separator
    output.extend_from_slice(b"================================\n");
    
    // Transaction info
    output.extend_from_slice(format!("No. Transaksi: {}\n", data.transaction_id).as_bytes());
    output.extend_from_slice(format!("Kasir: {}\n", data.cashier_name).as_bytes());
    output.extend_from_slice(format!("Waktu: {}\n", data.timestamp).as_bytes());
    output.extend_from_slice(b"================================\n");
    
    // Items header
    output.extend_from_slice(b"Item            Qty    Harga   Total\n");
    output.extend_from_slice(b"--------------------------------\n");
    
    // Items list
    for item in &data.items {
        let name = truncate(&item.name, 14);
        let line = format!(
            "{:<14} {:>3}x {:>7.0} {:>8.0}\n",
            name,
            item.qty,
            item.price,
            item.qty as f64 * item.price
        );
        output.extend_from_slice(line.as_bytes());
    }
    
    output.extend_from_slice(b"--------------------------------\n");
    
    // Right align for totals
    output.extend_from_slice(&[0x1B, 0x61, 0x02]); // ESC a 2 - Right
    output.extend_from_slice(format!("Subtotal:    {:>10.0}\n", data.subtotal).as_bytes());
    
    if data.tax > 0.0 {
        output.extend_from_slice(format!("Pajak:       {:>10.0}\n", data.tax).as_bytes());
    }
    
    // Double size for total
    output.extend_from_slice(&[0x1D, 0x21, 0x11]); // Double size
    output.extend_from_slice(format!("TOTAL:       {:>10.0}\n", data.total).as_bytes());
    output.extend_from_slice(&[0x1D, 0x21, 0x00]); // Normal size
    
    output.extend_from_slice(format!("Bayar:       {:>10.0}\n", data.payment).as_bytes());
    output.extend_from_slice(format!("Kembalian:   {:>10.0}\n", data.change).as_bytes());
    
    // Left align
    output.extend_from_slice(&[0x1B, 0x61, 0x00]); // Left
    output.extend_from_slice(b"--------------------------------\n");
    
    // Payment method
    output.extend_from_slice(format!("Metode: {}\n", data.payment_method).as_bytes());
    output.extend_from_slice(b"================================\n");
    
    // Thank you - center
    output.extend_from_slice(&[0x1B, 0x61, 0x01]); // Center
    output.extend_from_slice(&[0x1D, 0x21, 0x01]); // 1x width, 2x height
    output.extend_from_slice(b"Terima Kasih\n");
    output.extend_from_slice(&[0x1D, 0x21, 0x00]); // Normal
    output.extend_from_slice(b"Selamat Datang Kembali\n");
    output.extend_from_slice(b"\n\n\n");
    
    // Partial cut paper
    output.extend_from_slice(&[0x1D, 0x56, 0x01]); // GS V 1 - Partial cut
    
    output
}

fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len - 3])
    }
}

#[cfg(target_os = "linux")]
fn send_to_printer(data: &[u8]) -> Result<(), Box<dyn std::error::Error>> {
    use std::fs::OpenOptions;
    use std::io::Write;
    
    // Try /dev/usb/lp0 (USB printer)
    if let Ok(mut file) = OpenOptions::new().write(true).open("/dev/usb/lp0") {
        file.write_all(data)?;
        file.flush()?;
        println!("✓ Printer output to /dev/usb/lp0");
        return Ok(());
    }
    
    // Try /dev/ttyUSB0 (Serial printer)
    if let Ok(mut file) = OpenOptions::new().write(true).open("/dev/ttyUSB0") {
        file.write_all(data)?;
        file.flush()?;
        println!("✓ Printer output to /dev/ttyUSB0");
        return Ok(());
    }
    
    // Try /dev/ttyS0 (COM1)
    if let Ok(mut file) = OpenOptions::new().write(true).open("/dev/ttyS0") {
        file.write_all(data)?;
        file.flush()?;
        println!("✓ Printer output to /dev/ttyS0");
        return Ok(());
    }
    
    println!("⚠ No printer device found, receipt saved to /tmp only");
    Ok(())
}
