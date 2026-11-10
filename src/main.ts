import { invoke } from "@tauri-apps/api/core";

// Types
interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  stock: number;
}

interface CartItem {
  name: string;
  price: number;
  qty: number;
}

// State
let products: Product[] = [];
let cart: CartItem[] = [];
let currentCategory: string = "all";

// DOM Elements
const productsGrid = document.getElementById("products-grid") as HTMLDivElement;
const cartItemsDiv = document.getElementById("cart-items") as HTMLDivElement;
const subtotalSpan = document.getElementById("subtotal") as HTMLSpanElement;
const taxSpan = document.getElementById("tax") as HTMLSpanElement;
const totalSpan = document.getElementById("total") as HTMLSpanElement;
const paymentMethod = document.getElementById("payment-method") as HTMLSelectElement;
const paymentInput = document.getElementById("payment-amount") as HTMLInputElement;
const payPrintBtn = document.getElementById("pay-print-btn") as HTMLButtonElement;
const clearCartBtn = document.getElementById("clear-cart-btn") as HTMLButtonElement;

// Load products from backend
async function loadProducts() {
  try {
    products = await invoke<Product[]>("get_products");
    renderProducts();
  } catch (error) {
    console.error("Gagal memuat produk:", error);
    productsGrid.innerHTML = `<div class="col-span-3 text-center text-red-500 py-8">Gagal memuat produk dari database</div>`;
  }
}

// Render products grid
function renderProducts() {
  const filtered = currentCategory === "all" 
    ? products 
    : products.filter(p => p.category === currentCategory);

  if (filtered.length === 0) {
    productsGrid.innerHTML = `<div class="col-span-3 text-center text-gray-500 py-8">Tidak ada produk</div>`;
    return;
  }

  productsGrid.innerHTML = filtered.map(product => `
    <div class="product-card bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md cursor-pointer transition" data-id="${product.id}">
      <div class="text-xs text-gray-400 mb-1">${product.category}</div>
      <h3 class="font-medium text-gray-800 mb-2">${product.name}</h3>
      <div class="flex justify-between items-center">
        <span class="text-blue-600 font-bold">Rp ${product.price.toLocaleString("id-ID")}</span>
        <span class="text-xs text-gray-400">Stok: ${product.stock}</span>
      </div>
    </div>
  `).join("");

  // Add click handlers
  document.querySelectorAll(".product-card").forEach(card => {
    card.addEventListener("click", () => addToCart(card.getAttribute("data-id")!));
  });
}

// Add to cart
function addToCart(productId: string) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  const existingItem = cart.find(item => item.name === product.name);
  if (existingItem) {
    existingItem.qty += 1;
  } else {
    cart.push({
      name: product.name,
      price: product.price,
      qty: 1
    });
  }

  renderCart();
}

// Render cart
function renderCart() {
  if (cart.length === 0) {
    cartItemsDiv.innerHTML = `<div class="text-center text-gray-400 text-sm py-8">Keranjang kosong</div>`;
    updateTotals();
    return;
  }

  cartItemsDiv.innerHTML = cart.map((item, index) => `
    <div class="bg-gray-50 p-3 rounded border border-gray-200">
      <div class="flex justify-between items-start mb-2">
        <div class="flex-1">
          <div class="font-medium text-sm text-gray-800">${item.name}</div>
          <div class="text-xs text-gray-500">Rp ${item.price.toLocaleString("id-ID")}</div>
        </div>
        <button class="text-red-500 hover:text-red-700 text-sm" data-index="${index}">✕</button>
      </div>
      <div class="flex justify-between items-center">
        <div class="flex gap-2">
          <button class="qty-btn w-6 h-6 bg-gray-200 rounded text-xs hover:bg-gray-300" data-action="decrease" data-index="${index}">-</button>
          <span class="text-sm font-medium">${item.qty}</span>
          <button class="qty-btn w-6 h-6 bg-gray-200 rounded text-xs hover:bg-gray-300" data-action="increase" data-index="${index}">+</button>
        </div>
        <span class="text-sm font-bold text-gray-700">Rp ${(item.price * item.qty).toLocaleString("id-ID")}</span>
      </div>
    </div>
  `).join("");

  // Add event listeners for remove and quantity buttons
  cartItemsDiv.querySelectorAll("button[data-index]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      const index = parseInt(target.getAttribute("data-index")!);
      const action = target.getAttribute("data-action");

      if (action === "remove" || !action) {
        cart.splice(index, 1);
      } else if (action === "increase") {
        cart[index].qty += 1;
      } else if (action === "decrease") {
        if (cart[index].qty > 1) {
          cart[index].qty -= 1;
        } else {
          cart.splice(index, 1);
        }
      }

      renderCart();
    });
  });

  updateTotals();
}

// Update totals
function updateTotals() {
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const tax = 0; // 0% pajak
  const total = subtotal + tax;

  subtotalSpan.textContent = `Rp ${subtotal.toLocaleString("id-ID")}`;
  taxSpan.textContent = `Rp ${tax.toLocaleString("id-ID")}`;
  totalSpan.textContent = `Rp ${total.toLocaleString("id-ID")}`;
}

// Quick payment
function setQuickPayment(amount: number) {
  paymentInput.value = amount.toString();
}

// Pay and print
async function payAndPrint() {
  if (cart.length === 0) {
    alert("Keranjang kosong!");
    return;
  }

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const total = subtotal;
  const payment = parseFloat(paymentInput.value) || 0;

  if (payment < total) {
    alert(`Pembayaran kurang! Total: Rp ${total.toLocaleString("id-ID")}`);
    return;
  }

  const change = payment - total;
  const transactionId = `TRX-${Date.now()}`;
  const timestamp = new Date().toLocaleString("id-ID");

  try {
    await invoke<string>("print_receipt_command", {
      data: {
        store_name: "KasirPro 58mm",
        store_address: "Jl. Contoh No. 123",
        store_phone: "0812-3456-7890",
        transaction_id: transactionId,
        cashier_name: "Admin",
        items: cart,
        subtotal,
        tax: 0,
        total,
        payment,
        change,
        payment_method: paymentMethod.value,
        timestamp
      }
    });

    alert("Struk berhasil dicetak!");

    // Save transaction to database
    await invoke("create_transaction", {
      transactionId,
      items: cart,
      total,
      payment,
      paymentMethod: paymentMethod.value
    });

    // Clear cart
    cart = [];
    paymentInput.value = "";
    renderCart();

  } catch (error) {
    console.error("Error:", error);
    alert(`Gagal: ${error}`);
  }
}

// Clear cart
function clearCart() {
  if (cart.length === 0) return;
  if (confirm("Yakin batalkan transaksi?")) {
    cart = [];
    paymentInput.value = "";
    renderCart();
  }
}

// Category filter
function setupCategoryFilter() {
  document.querySelectorAll(".category-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".category-btn").forEach(b => {
        b.classList.remove("bg-blue-500", "text-white");
        b.classList.add("bg-gray-200", "text-gray-700");
      });
      btn.classList.remove("bg-gray-200", "text-gray-700");
      btn.classList.add("bg-blue-500", "text-white");
      
      currentCategory = btn.getAttribute("data-category") || "all";
      renderProducts();
    });
  });
}

// Initialize
window.addEventListener("DOMContentLoaded", () => {
  setupCategoryFilter();
  loadProducts();

  // Quick payment buttons
  document.querySelectorAll(".quick-pay").forEach(btn => {
    btn.addEventListener("click", () => {
      const amount = parseFloat(btn.getAttribute("data-amount") || "0");
      setQuickPayment(amount);
    });
  });

  payPrintBtn.addEventListener("click", payAndPrint);
  clearCartBtn.addEventListener("click", clearCart);
});
