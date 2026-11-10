import { invoke } from "@tauri-apps/api/core";

// Types
interface Product {
  id: string;
  code: string;
  barcode: string;
  name: string;
  price: number;
  category: string;
  stock: number;
  input_method: string;
  stock_unit: string;
  conversion_factor: number;
  cost_price: number;
  cost_unit: string;
  bag_cost: number;
  bag_weight_kg: number;
  min_stock: number;
  label_color: string;
}

interface CartItem {
  name: string;
  price: number;
  qty: number;
}

interface StoreSettings {
  store_name: string;
  address: string;
  phone: string;
  receipt_footer: string;
  cashier_name: string;
}

interface LocalCashierAccount {
  username: string;
  cashierName: string;
  salt: string;
  passwordHash: string;
}

// State
let products: Product[] = [];
let cart: CartItem[] = [];
let currentCategory: string = "all";
let activeCashier = "";
let barcodeCameraStream: MediaStream | null = null;
let currentProductLabelColor = "#10b981";
let storeSettings: StoreSettings = {
  store_name: "COOL KIDS CELL",
  address: "",
  phone: "",
  receipt_footer: "Terima kasih telah berbelanja",
  cashier_name: ""
};

// DOM Elements
const productsGrid = document.getElementById("products-grid") as HTMLDivElement;
const cartItemsDiv = document.getElementById("cart-items") as HTMLDivElement;
const subtotalSpan = document.getElementById("subtotal") as HTMLSpanElement;
const totalSpan = document.getElementById("total") as HTMLSpanElement;
const paymentInput = document.getElementById("payment-amount") as HTMLInputElement;
const changeSpan = document.getElementById("change") as HTMLSpanElement;
const payPrintBtn = document.getElementById("pay-print-btn") as HTMLButtonElement;
const clearCartBtn = document.getElementById("clear-cart-btn") as HTMLButtonElement;
const cartCountSpan = document.getElementById("cart-count") as HTMLSpanElement;
const searchInput = document.getElementById("search-input") as HTMLInputElement;
const inventoryList = document.getElementById("inventory-list") as HTMLTableSectionElement;
const inventorySearch = document.getElementById("inventory-search") as HTMLInputElement;
const settingsForm = document.getElementById("store-settings-form") as HTMLFormElement;

// Load products from backend
async function loadProducts() {
  try {
    products = await invoke<Product[]>("get_products");
    renderProducts();
    renderInventory();
  } catch (error) {
    console.error("Gagal memuat produk:", error);
    productsGrid.innerHTML = `<div class="col-span-4 text-center text-red-500 py-8">Gagal memuat produk dari database</div>`;
  }
}

// Render products grid
function renderProducts() {
  let filtered = currentCategory === "all" 
    ? products 
    : products.filter(p => p.category === currentCategory);

  // Search filter
  const searchTerm = searchInput.value.toLowerCase().trim();
  if (searchTerm) {
    filtered = filtered.filter(p => 
      p.name.toLowerCase().includes(searchTerm) || 
      p.code.toLowerCase().includes(searchTerm) ||
      p.barcode.toLowerCase().includes(searchTerm)
    );
  }

  if (filtered.length === 0) {
    productsGrid.innerHTML = `<div class="col-span-4 text-center text-gray-500 py-8">Tidak ada produk</div>`;
    return;
  }

  productsGrid.innerHTML = filtered.map(product => `
    <div class="product-card bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md cursor-pointer transition overflow-hidden" data-id="${product.id}">
      <!-- Top accent bar -->
      <div class="h-1" style="background-color:${safeLabelColor(product.label_color)}"></div>
      <div class="p-3">
        <div class="flex justify-between items-start mb-2">
          <span class="text-xs text-gray-500 font-medium">${product.code}</span>
          <span class="text-xs text-gray-400">Stok: ${formatStock(product)}</span>
        </div>
        <h3 class="font-semibold text-gray-900 text-sm mb-1 line-clamp-1">${product.name}</h3>
        <p class="text-xs text-gray-500 mb-2">Terlaris bulan ini: 44.5 terjual</p>
        <div class="text-lg font-bold text-green-600">Rp ${product.price.toLocaleString("id-ID")}</div>
      </div>
    </div>
  `).join("");

  // Add click handlers
  document.querySelectorAll(".product-card").forEach(card => {
    card.addEventListener("click", () => addToCart(card.getAttribute("data-id")!));
  });
}

function renderInventory() {
  const searchTerm = inventorySearch.value.toLowerCase().trim();
  const filtered = products.filter(product =>
    `${product.code} ${product.barcode} ${product.name} ${product.category}`.toLowerCase().includes(searchTerm)
  );
  const emptyState = document.getElementById("inventory-empty") as HTMLDivElement;
  const count = document.getElementById("inventory-count") as HTMLSpanElement;
  count.textContent = filtered.length.toString();
  emptyState.classList.toggle("hidden", filtered.length > 0);

  inventoryList.innerHTML = filtered.map(product => `
    <tr>
      <td class="px-4 py-3">
        <div class="font-semibold text-gray-900">${escapeHtml(product.name)}</div>
        <div class="mt-0.5 text-xs text-gray-500">${escapeHtml(product.code)}</div>
        ${product.barcode ? `<div class="mt-0.5 text-xs text-gray-400">Barcode: ${escapeHtml(product.barcode)}</div>` : ""}
      </td>
      <td class="px-4 py-3 text-gray-600">${escapeHtml(product.category)}</td>
      <td class="px-4 py-3 text-right">
        <div class="font-medium text-gray-900">Rp ${product.price.toLocaleString("id-ID")}</div>
        <div class="mt-0.5 text-xs text-gray-500">Modal /${escapeHtml(product.cost_unit || "pcs")}: Rp ${product.cost_price.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</div>
        ${product.bag_weight_kg > 0 ? `<div class="mt-0.5 text-xs text-gray-400">Karung ${product.bag_weight_kg} kg • Modal karung Rp ${product.bag_cost.toLocaleString("id-ID")}</div>` : ""}
      </td>
      <td class="px-4 py-3 text-center">
        <span class="inline-block min-w-8 font-semibold ${product.stock <= 5 ? "text-red-600" : "text-gray-800"}">${formatStock(product)}</span>
      </td>
      <td class="px-4 py-3">
        <div class="flex flex-wrap justify-end gap-1.5">
          <button type="button" class="stock-adjust rounded border border-gray-300 px-2.5 py-1 text-gray-700 hover:bg-gray-100 disabled:opacity-40" data-code="${escapeHtml(product.code)}" data-delta="-1" aria-label="Kurangi stok ${escapeHtml(product.name)}" ${product.stock <= 0 ? "disabled" : ""}>-1</button>
          <button type="button" class="stock-adjust rounded border border-green-200 bg-green-50 px-2.5 py-1 font-medium text-green-700 hover:bg-green-100" data-code="${escapeHtml(product.code)}" data-delta="1" aria-label="Tambah stok ${escapeHtml(product.name)}">+1</button>
          <input type="number" min="0.01" step="0.01" inputmode="decimal" class="stock-adjust-amount w-20 rounded border border-gray-300 px-2 py-1 text-xs text-gray-800 outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200" data-code="${escapeHtml(product.code)}" aria-label="Jumlah stok tambahan untuk ${escapeHtml(product.name)}" placeholder="Jumlah" />
          <button type="button" class="stock-adjust-custom rounded border border-green-600 bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700" data-code="${escapeHtml(product.code)}">Tambah</button>
          <button type="button" class="delete-product rounded border border-red-200 px-2.5 py-1 text-red-600 hover:bg-red-50" data-code="${escapeHtml(product.code)}" data-name="${escapeHtml(product.name)}">Hapus</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function formatStock(product: Product) {
  return `${product.stock.toLocaleString("id-ID", { maximumFractionDigits: 2 })} ${product.stock_unit || "pcs"}`;
}

function safeLabelColor(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#10b981";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]!);
}

async function adjustProductStock(code: string, delta: number) {
  try {
    await invoke("adjust_product_stock", { code, delta });
    await loadProducts();
    return true;
  } catch (error) {
    console.error("Gagal memperbarui stok:", error);
    alert(`Gagal memperbarui stok: ${error}`);
    return false;
  }
}

async function deleteProduct(code: string, name: string) {
  if (!confirm(`Hapus produk "${name}" dari katalog?`)) return;
  try {
    await invoke("delete_product", { code });
    await loadProducts();
  } catch (error) {
    console.error("Gagal menghapus produk:", error);
    alert(`Gagal menghapus produk: ${error}`);
  }
}

function showView(selectedView: string) {
  document.querySelectorAll<HTMLElement>("#pos-view, #inventory-view, #settings-view").forEach(view => {
    view.classList.toggle("hidden", view.id !== `${selectedView}-view`);
  });
  document.querySelectorAll<HTMLButtonElement>(".nav-tab[data-view]").forEach(tab => {
    const isActive = tab.dataset.view === selectedView;
    tab.classList.toggle("bg-green-500", isActive);
    tab.classList.toggle("text-white", isActive);
    tab.classList.toggle("text-gray-700", !isActive);
  });
  if (selectedView === "inventory") renderInventory();
  if (selectedView === "settings") void loadStoreSettings();
}

function setupNavigation() {
  document.querySelectorAll<HTMLButtonElement>(".nav-tab[data-view]").forEach(tab => {
    tab.addEventListener("click", () => showView(tab.dataset.view!));
  });

  const menuButton = document.getElementById("account-menu-button") as HTMLButtonElement;
  const accountMenu = document.getElementById("account-menu") as HTMLDivElement;
  const menuContainer = document.getElementById("account-menu-container") as HTMLDivElement;
  const menuMessage = document.getElementById("account-menu-message") as HTMLParagraphElement;

  menuButton.addEventListener("click", () => {
    const isOpen = !accountMenu.classList.contains("hidden");
    accountMenu.classList.toggle("hidden", isOpen);
    menuButton.setAttribute("aria-expanded", String(!isOpen));
    menuMessage.classList.add("hidden");
  });

  accountMenu.querySelectorAll<HTMLButtonElement>("[data-account-action]").forEach(item => {
    item.addEventListener("click", () => {
      accountMenu.classList.add("hidden");
      menuButton.setAttribute("aria-expanded", "false");
      if (item.dataset.accountAction === "settings") {
        showView("settings");
        return;
      }
      menuMessage.textContent = "Menu ini belum tersedia.";
      menuMessage.classList.remove("hidden");
      accountMenu.classList.remove("hidden");
      menuButton.setAttribute("aria-expanded", "true");
    });
  });

  document.addEventListener("click", event => {
    if (!menuContainer.contains(event.target as Node)) {
      accountMenu.classList.add("hidden");
      menuButton.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      accountMenu.classList.add("hidden");
      menuButton.setAttribute("aria-expanded", "false");
    }
  });
}

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

async function hashPassword(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBuffer = Uint8Array.from(salt).buffer;
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBuffer, iterations: 210000, hash: "SHA-256" }, key, 256);
  return toBase64(new Uint8Array(bits));
}

function showAuthForm(isSetup: boolean) {
  const title = document.getElementById("auth-title") as HTMLHeadingElement;
  const description = document.getElementById("auth-description") as HTMLParagraphElement;
  const nameWrap = document.getElementById("auth-name-wrap") as HTMLDivElement;
  const nameInput = document.getElementById("auth-name") as HTMLInputElement;
  const passwordInput = document.getElementById("auth-password") as HTMLInputElement;
  const submit = document.getElementById("auth-submit") as HTMLButtonElement;
  const eyebrow = document.getElementById("auth-eyebrow") as HTMLParagraphElement;
  const account = localStorage.getItem("kasirpro.cashier-account");

  eyebrow.textContent = isSetup ? "Penyiapan Awal" : "Sesi Kasir";
  title.textContent = isSetup ? "Buat Akun Kasir" : "Login Kasir";
  description.textContent = isSetup
    ? "Buat akun lokal untuk membuka aplikasi. Password disimpan sebagai hash di perangkat ini."
    : "Masuk menggunakan akun kasir lokal yang telah didaftarkan.";
  nameWrap.classList.toggle("hidden", !isSetup);
  nameInput.required = isSetup;
  passwordInput.autocomplete = isSetup ? "new-password" : "current-password";
  submit.textContent = isSetup ? "Buat Akun & Masuk" : "Login";
  if (!isSetup && account) {
    (document.getElementById("auth-username") as HTMLInputElement).value = (JSON.parse(account) as LocalCashierAccount).username;
  }
}

function setActiveCashier(name: string) {
  activeCashier = name;
  const cashierLabel = document.getElementById("active-cashier") as HTMLDivElement;
  const avatar = document.getElementById("cashier-avatar") as HTMLDivElement;
  cashierLabel.textContent = name;
  avatar.textContent = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? "").join("");
  document.getElementById("auth-overlay")!.classList.add("hidden");
}

function lockCashierSession() {
  activeCashier = "";
  document.getElementById("active-cashier")!.textContent = "Sesi terkunci";
  showAuthForm(false);
  document.getElementById("auth-overlay")!.classList.remove("hidden");
  (document.getElementById("auth-password") as HTMLInputElement).value = "";
  (document.getElementById("auth-password") as HTMLInputElement).focus();
}

async function handleAuthSubmit(event: SubmitEvent) {
  event.preventDefault();
  const error = document.getElementById("auth-error") as HTMLParagraphElement;
  error.classList.add("hidden");
  const username = (document.getElementById("auth-username") as HTMLInputElement).value.trim();
  const password = (document.getElementById("auth-password") as HTMLInputElement).value;
  const isSetup = !localStorage.getItem("kasirpro.cashier-account");

  try {
    if (isSetup) {
      const cashierName = (document.getElementById("auth-name") as HTMLInputElement).value.trim();
      if (!cashierName || username.length < 3 || password.length < 8) {
        throw new Error("Isi nama kasir, username minimal 3 karakter, dan password minimal 8 karakter.");
      }
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const account: LocalCashierAccount = {
        username,
        cashierName,
        salt: toBase64(salt),
        passwordHash: await hashPassword(password, salt)
      };
      localStorage.setItem("kasirpro.cashier-account", JSON.stringify(account));
      setActiveCashier(cashierName);
      return;
    }

    const account = JSON.parse(localStorage.getItem("kasirpro.cashier-account")!) as LocalCashierAccount;
    const submittedHash = await hashPassword(password, fromBase64(account.salt));
    if (username !== account.username || submittedHash !== account.passwordHash) {
      throw new Error("Username atau password salah.");
    }
    setActiveCashier(account.cashierName);
  } catch (authError) {
    error.textContent = authError instanceof Error ? authError.message : String(authError);
    error.classList.remove("hidden");
  }
}

async function loadStoreSettings() {
  const status = document.getElementById("settings-status") as HTMLParagraphElement;
  try {
    storeSettings = await invoke<StoreSettings>("get_store_settings");
    (document.getElementById("store-name") as HTMLInputElement).value = storeSettings.store_name;
    (document.getElementById("store-address") as HTMLTextAreaElement).value = storeSettings.address;
    (document.getElementById("store-phone") as HTMLInputElement).value = storeSettings.phone;
    (document.getElementById("store-cashier") as HTMLInputElement).value = storeSettings.cashier_name;
    (document.getElementById("receipt-footer") as HTMLTextAreaElement).value = storeSettings.receipt_footer;
    status.textContent = "Pengaturan toko dimuat dari database.";
  } catch (error) {
    console.error("Gagal memuat pengaturan toko:", error);
    status.textContent = `Gagal memuat pengaturan: ${error}`;
  }
}

async function saveStoreSettings(event: SubmitEvent) {
  event.preventDefault();
  const status = document.getElementById("settings-status") as HTMLParagraphElement;
  const settings: StoreSettings = {
    store_name: (document.getElementById("store-name") as HTMLInputElement).value.trim(),
    address: (document.getElementById("store-address") as HTMLTextAreaElement).value.trim(),
    phone: (document.getElementById("store-phone") as HTMLInputElement).value.trim(),
    cashier_name: (document.getElementById("store-cashier") as HTMLInputElement).value.trim(),
    receipt_footer: (document.getElementById("receipt-footer") as HTMLTextAreaElement).value.trim()
  };
  try {
    storeSettings = await invoke<StoreSettings>("save_store_settings", { settings });
    status.textContent = "Pengaturan toko berhasil disimpan.";
  } catch (error) {
    console.error("Gagal menyimpan pengaturan toko:", error);
    status.textContent = `Gagal menyimpan pengaturan: ${error}`;
  }
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
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  cartCountSpan.textContent = totalItems.toString();

  if (cart.length === 0) {
    cartItemsDiv.innerHTML = `
      <div class="text-center text-gray-400 py-12">
        <div class="text-4xl mb-2">🛍️</div>
        <div class="text-sm">Keranjang masih kosong</div>
        <div class="text-xs text-gray-300">Klik produk di atas untuk menambahkan</div>
      </div>
    `;
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
        <button class="text-red-500 hover:text-red-700 text-sm" data-index="${index}" data-action="remove">✕</button>
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
  const total = subtotal;

  subtotalSpan.textContent = `Rp ${subtotal.toLocaleString("id-ID")}`;
  totalSpan.textContent = `Rp ${total.toLocaleString("id-ID")}`;

  // Update change
  const payment = parseFloat(paymentInput.value) || 0;
  const change = payment - total;
  changeSpan.textContent = `Rp ${Math.max(0, change).toLocaleString("id-ID")}`;
}

// Quick payment
function setQuickPayment(amount: number) {
  paymentInput.value = amount.toString();
  updateTotals();
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
    storeSettings = await invoke<StoreSettings>("get_store_settings");
    await invoke<string>("print_receipt_command", {
      data: {
        store_name: storeSettings.store_name,
        store_address: storeSettings.address,
        store_phone: storeSettings.phone,
        receipt_footer: storeSettings.receipt_footer,
        transaction_id: transactionId,
        cashier_name: activeCashier || storeSettings.cashier_name || "Kasir",
        items: cart,
        subtotal,
        tax: 0,
        total,
        payment,
        change,
        payment_method: "Tunai",
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
      paymentMethod: "Tunai"
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
        b.classList.remove("bg-green-500", "text-white");
        b.classList.add("bg-gray-200", "text-gray-700");
      });
      btn.classList.remove("bg-gray-200", "text-gray-700");
      btn.classList.add("bg-green-500", "text-white");
      
      currentCategory = btn.getAttribute("data-category") || "all";
      renderProducts();
    });
  });
}

// Product Management
function openProductModal() {
  const modal = document.getElementById("product-modal") as HTMLDivElement;
  (document.getElementById("product-code") as HTMLInputElement).value = generateProductCode();
  (document.getElementById("product-barcode") as HTMLInputElement).value = "";
  (document.getElementById("product-category") as HTMLSelectElement).value = "Makanan";
  (document.getElementById("product-custom-category") as HTMLInputElement).value = "";
  document.getElementById("product-custom-category")!.classList.add("hidden");
  (document.getElementById("product-min-stock") as HTMLInputElement).value = "5";
  (document.getElementById("product-price") as HTMLInputElement).value = "";
  (document.getElementById("product-input-method") as HTMLSelectElement).value = "retail";
  currentProductLabelColor = "#10b981";
  updateLabelColorSelection();
  ["product-cost-price", "product-stock", "product-units-per-package", "product-rice-bag-weight"].forEach(id => {
    (document.getElementById(id) as HTMLInputElement).value = "";
  });
  document.querySelector<HTMLElement>("#add-product-form .overflow-y-auto")?.scrollTo({ top: 0 });
  updateStockInputMode();
  modal.style.display = "flex";
}

function generateProductCode() {
  let code = "";
  do {
    code = `PRD-${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;
  } while (products.some(product => product.code === code));
  return code;
}

function updateStockInputMode() {
  const method = (document.getElementById("product-input-method") as HTMLSelectElement).value;
  document.getElementById("wholesale-stock-fields")!.classList.toggle("hidden", method !== "wholesale_box");
  document.getElementById("rice-stock-fields")!.classList.toggle("hidden", method !== "rice_kg_liter");
  const stockInput = document.getElementById("product-stock") as HTMLInputElement;
  const stockLabel = document.getElementById("product-stock-label") as HTMLLabelElement;
  const stockHelp = document.getElementById("product-stock-help") as HTMLParagraphElement;
  stockInput.step = method === "rice_kg_liter" ? "0.01" : "1";
  stockInput.placeholder = method === "rice_kg_liter" ? "Stok hasil konversi (Liter)" : method === "wholesale_box" ? "Masukkan stok unit eceran" : "50";
  stockLabel.textContent = "Jumlah Stok";
  stockHelp.textContent = "";
  stockHelp.classList.add("hidden");
  if (method === "rice_kg_liter") updateRiceStockFromBagWeight();
  (document.getElementById("product-cost-label") as HTMLLabelElement).textContent = method === "rice_kg_liter"
    ? "Harga Modal 1 Karung (Rp)"
    : method === "wholesale_box" ? "Modal per Dus (Rp, tanpa konversi)" : "Modal per Eceran (Rp)";
  (document.getElementById("product-price-label") as HTMLLabelElement).textContent = method === "rice_kg_liter"
    ? "Harga Jual per Liter (Rp)"
    : method === "wholesale_box" ? "Harga Jual per Unit Eceran (Rp)" : "Harga Jual (Rp)";

  stockInput.required = true;
  (document.getElementById("product-units-per-package") as HTMLInputElement).required = method === "wholesale_box";
  (document.getElementById("product-rice-bag-weight") as HTMLInputElement).required = method === "rice_kg_liter";
  document.querySelectorAll<HTMLButtonElement>(".input-method-btn").forEach(button => {
    const active = button.dataset.method === method;
    button.classList.toggle("bg-emerald-500", active);
    button.classList.toggle("text-white", active);
    button.classList.toggle("text-slate-500", !active);
    button.setAttribute("aria-pressed", String(active));
  });
  updateStockPreviews();
}

function updateLabelColorSelection() {
  document.querySelectorAll<HTMLButtonElement>(".label-color").forEach(button => {
    const active = button.dataset.color === currentProductLabelColor;
    button.classList.toggle("ring-2", active);
    button.classList.toggle("ring-offset-2", active);
    button.classList.toggle("ring-emerald-500", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function updateStockPreviews() {
  const unitsPerPackage = parseFloat((document.getElementById("product-units-per-package") as HTMLInputElement).value) || 0;
  const wholesaleCost = parseFloat((document.getElementById("product-cost-price") as HTMLInputElement).value) || 0;
  const costPerUnit = unitsPerPackage > 0 ? wholesaleCost / unitsPerPackage : 0;
  (document.getElementById("wholesale-modal-preview") as HTMLParagraphElement).textContent =
    `Modal per unit: Rp ${costPerUnit.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`;

  const bagWeightKg = parseFloat((document.getElementById("product-rice-bag-weight") as HTMLInputElement).value) || 0;
  const riceStockLiters = parseFloat((document.getElementById("product-stock") as HTMLInputElement).value) || 0;
  const bagCost = parseFloat((document.getElementById("product-cost-price") as HTMLInputElement).value) || 0;
  const costPerLiter = bagWeightKg > 0 ? bagCost / (bagWeightKg * 1.25) : 0;
  (document.getElementById("rice-stock-preview") as HTMLParagraphElement).textContent =
    `${riceStockLiters.toLocaleString("id-ID", { maximumFractionDigits: 2 })} Liter`;
  (document.getElementById("rice-modal-preview") as HTMLParagraphElement).textContent =
    `Rp ${costPerLiter.toLocaleString("id-ID", { maximumFractionDigits: 2 })} / Liter`;
}

function updateRiceStockFromBagWeight() {
  const bagWeightKg = parseFloat((document.getElementById("product-rice-bag-weight") as HTMLInputElement).value);
  const stockInput = document.getElementById("product-stock") as HTMLInputElement;
  stockInput.value = Number.isFinite(bagWeightKg) && bagWeightKg > 0
    ? (bagWeightKg * 1.25).toFixed(2).replace(/\.00$/, "")
    : "";
  updateStockPreviews();
}

function handleStockInput() {
  updateStockPreviews();
}

function handleBagWeightInput() {
  updateRiceStockFromBagWeight();
}

function closeProductModal() {
  stopBarcodeCamera();
  const modal = document.getElementById("product-modal") as HTMLDivElement;
  modal.style.display = "none";
}

type BarcodeDetectorResult = { rawValue: string };
type BarcodeDetectorInstance = { detect: (source: HTMLVideoElement) => Promise<BarcodeDetectorResult[]> };
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

async function startBarcodeCamera() {
  const detectorConstructor = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  const panel = document.getElementById("barcode-camera-panel") as HTMLDivElement;
  const status = document.getElementById("barcode-camera-status") as HTMLSpanElement;
  const video = document.getElementById("barcode-camera-video") as HTMLVideoElement;

  if (!navigator.mediaDevices?.getUserMedia) {
    status.textContent = "Akses kamera tidak tersedia. Masukkan barcode secara manual.";
    panel.classList.remove("hidden");
    return;
  }
  if (!detectorConstructor) {
    status.textContent = "Pemindai barcode tidak didukung perangkat ini. Masukkan barcode secara manual.";
    panel.classList.remove("hidden");
    return;
  }

  try {
    barcodeCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    video.srcObject = barcodeCameraStream;
    panel.classList.remove("hidden");
    status.textContent = "Arahkan barcode ke kamera.";
    await video.play();
    const detector = new detectorConstructor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
    const scanFrame = async () => {
      if (!barcodeCameraStream) return;
      try {
        const [result] = await detector.detect(video);
        if (result?.rawValue) {
          (document.getElementById("product-barcode") as HTMLInputElement).value = result.rawValue;
          stopBarcodeCamera();
          return;
        }
      } catch {
        status.textContent = "Tidak dapat membaca barcode. Coba atur posisi kamera.";
      }
      if (barcodeCameraStream) requestAnimationFrame(() => void scanFrame());
    };
    void scanFrame();
  } catch (error) {
    stopBarcodeCamera();
    panel.classList.remove("hidden");
    status.textContent = `Kamera tidak dapat dibuka: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function stopBarcodeCamera() {
  barcodeCameraStream?.getTracks().forEach(track => track.stop());
  barcodeCameraStream = null;
  const video = document.getElementById("barcode-camera-video") as HTMLVideoElement | null;
  if (video) video.srcObject = null;
  document.getElementById("barcode-camera-panel")?.classList.add("hidden");
}

async function submitAddProduct() {
  const codeInput = document.getElementById("product-code") as HTMLInputElement;
  const barcodeInput = document.getElementById("product-barcode") as HTMLInputElement;
  const nameInput = document.getElementById("product-name") as HTMLInputElement;
  const categorySelect = document.getElementById("product-category") as HTMLSelectElement;
  const priceInput = document.getElementById("product-price") as HTMLInputElement;
  const costInput = document.getElementById("product-cost-price") as HTMLInputElement;
  const inputMethod = (document.getElementById("product-input-method") as HTMLSelectElement).value;

  const code = codeInput.value.trim() || generateProductCode();
  const barcode = barcodeInput.value.trim();
  const name = nameInput.value.trim();
  const price = parseFloat(priceInput.value);
  const minStock = parseFloat((document.getElementById("product-min-stock") as HTMLInputElement).value);
  const customCategoryInput = document.getElementById("product-custom-category") as HTMLInputElement;
  let category = categorySelect.value;
  if (!customCategoryInput.classList.contains("hidden") && customCategoryInput.value.trim()) {
    category = customCategoryInput.value.trim();
    if (![...categorySelect.options].some(option => option.value === category)) {
      categorySelect.add(new Option(category, category));
    }
    categorySelect.value = category;
  }
  const enteredCostPrice = parseFloat(costInput.value);
  let costPrice = enteredCostPrice;
  let costUnit = "pcs";
  let bagCost = 0;
  let bagWeightKg = 0;
  let stock: number;
  let stockUnit = "pcs";
  let conversionFactor = 1;
  let stockEntryValid = true;

  if (inputMethod === "retail") {
    stock = parseFloat((document.getElementById("product-stock") as HTMLInputElement).value);
    stockEntryValid = Number.isInteger(stock);
  } else if (inputMethod === "wholesale_box") {
    stock = parseFloat((document.getElementById("product-stock") as HTMLInputElement).value);
    conversionFactor = parseFloat((document.getElementById("product-units-per-package") as HTMLInputElement).value);
    costPrice = enteredCostPrice / conversionFactor;
    costUnit = "pcs";
    stockEntryValid = Number.isInteger(stock) && Number.isInteger(conversionFactor);
  } else {
    bagCost = enteredCostPrice;
    bagWeightKg = parseFloat((document.getElementById("product-rice-bag-weight") as HTMLInputElement).value);
    const riceStockLiters = parseFloat((document.getElementById("product-stock") as HTMLInputElement).value);
    conversionFactor = 1.25;
    stock = riceStockLiters;
    costPrice = bagCost / (bagWeightKg * conversionFactor);
    costUnit = "liter";
    stockUnit = "liter";
    stockEntryValid = Number.isFinite(riceStockLiters) && riceStockLiters >= 0 && Number.isFinite(bagWeightKg) && bagWeightKg > 0;
  }

  if (!code || !name || !category || !Number.isFinite(price) || price <= 0 || !Number.isFinite(minStock) || minStock < 0 || !Number.isFinite(enteredCostPrice) || enteredCostPrice < 0 || !Number.isFinite(costPrice) || !Number.isFinite(stock) || stock < 0 || !Number.isFinite(conversionFactor) || conversionFactor <= 0 || !stockEntryValid) {
    alert("Periksa nama, harga, jumlah stok, dan rasio konversi produk.");
    return;
  }

  try {
    const newProduct = await invoke<Product>("add_product", {
      code,
      barcode,
      name,
      category,
      price,
      stock,
      inputMethod,
      stockUnit,
      conversionFactor,
      costPrice,
      costUnit,
      bagCost,
      bagWeightKg,
      minStock,
      labelColor: currentProductLabelColor
    });
    
    console.log("Product added successfully:", newProduct);
    
    // Clear form
    codeInput.value = "";
    barcodeInput.value = "";
    nameInput.value = "";
    categorySelect.value = "Makanan";
    (document.getElementById("product-min-stock") as HTMLInputElement).value = "5";
    priceInput.value = "";
    costInput.value = "";
    ["product-stock", "product-units-per-package", "product-rice-bag-weight"].forEach(id => {
      (document.getElementById(id) as HTMLInputElement).value = "";
    });
    
    alert("Produk berhasil ditambahkan!");
    closeProductModal();
    
    // Reload products from database to update grid real-time
    console.log("Reloading products from database...");
    await loadProducts();
    
  } catch (error) {
    console.error("Gagal tambah produk:", error);
    alert(`Gagal tambah produk: ${error}`);
  }
}

function openProductListModal() {
  const modal = document.getElementById("product-list-modal") as HTMLDivElement;
  const listDiv = document.getElementById("product-list") as HTMLDivElement;
  
  listDiv.innerHTML = products.map(p => `
    <div class="bg-gray-50 p-4 rounded border border-gray-200">
      <div class="flex justify-between mb-2">
        <div>
          <p class="font-medium text-gray-800">${p.name}</p>
          <p class="text-sm text-gray-500">Kode: ${p.code}</p>
        </div>
        <div class="text-right">
          <p class="text-lg font-bold text-blue-600">Rp ${p.price.toLocaleString("id-ID")}</p>
          <p class="text-xs text-gray-500">Modal /${escapeHtml(p.cost_unit || "pcs")}: Rp ${p.cost_price.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</p>
          ${p.bag_weight_kg > 0 ? `<p class="text-xs text-gray-400">Karung ${p.bag_weight_kg} kg • Rp ${p.bag_cost.toLocaleString("id-ID")}</p>` : ""}
          <p class="text-sm text-gray-500">Stok: ${formatStock(p)}</p>
        </div>
      </div>
      <p class="text-xs text-gray-400 mb-2">Kategori: ${p.category}</p>
    </div>
  `).join("");
  
  modal.style.display = "flex";
}

function closeProductListModal() {
  const modal = document.getElementById("product-list-modal") as HTMLDivElement;
  modal.style.display = "none";
}

// Test printer
async function testPrinter() {
  try {
    storeSettings = await invoke<StoreSettings>("get_store_settings");
    await invoke<string>("print_receipt_command", {
      data: {
        store_name: storeSettings.store_name,
        store_address: storeSettings.address,
        store_phone: storeSettings.phone,
        receipt_footer: storeSettings.receipt_footer,
        transaction_id: "TEST-" + Date.now(),
        cashier_name: activeCashier || storeSettings.cashier_name || "Kasir",
        items: [
          { name: "Test Produk 1", price: 10000, qty: 2 },
          { name: "Test Produk 2", price: 5000, qty: 1 }
        ],
        subtotal: 25000,
        tax: 0,
        total: 25000,
        payment: 30000,
        change: 5000,
        payment_method: "Tunai",
        timestamp: new Date().toLocaleString("id-ID")
      }
    });
    alert("Test cetak berhasil!");
  } catch (error) {
    console.error("Test printer error:", error);
    alert(`Gagal test printer: ${error}`);
  }
}

// Expose functions to global scope for onclick handlers
declare global {
  function openProductModal(): void;
  function closeProductModal(): void;
  function submitAddProduct(): Promise<void>;
  function openProductListModal(): void;
  function closeProductListModal(): void;
  function testPrinter(): Promise<void>;
}

(window as any).openProductModal = openProductModal;
(window as any).closeProductModal = closeProductModal;
(window as any).submitAddProduct = submitAddProduct;
(window as any).openProductListModal = openProductListModal;
(window as any).closeProductListModal = closeProductListModal;
(window as any).testPrinter = testPrinter;

// Initialize
window.addEventListener("DOMContentLoaded", () => {
  setupCategoryFilter();
  setupNavigation();
  loadProducts();
  void loadStoreSettings();

  showAuthForm(!localStorage.getItem("kasirpro.cashier-account"));
  document.getElementById("auth-form")!.addEventListener("submit", event => {
    void handleAuthSubmit(event as SubmitEvent);
  });
  document.getElementById("lock-session-btn")!.addEventListener("click", lockCashierSession);
  settingsForm.addEventListener("submit", event => {
    void saveStoreSettings(event as SubmitEvent);
  });
  document.getElementById("scan-product-barcode")!.addEventListener("click", () => void startBarcodeCamera());
  document.getElementById("stop-barcode-camera")!.addEventListener("click", stopBarcodeCamera);
  document.getElementById("scan-product-barcode-device")!.addEventListener("click", () => {
    (document.getElementById("product-barcode") as HTMLInputElement).focus();
  });
  document.querySelectorAll<HTMLButtonElement>(".input-method-btn").forEach(button => {
    button.addEventListener("click", () => {
      (document.getElementById("product-input-method") as HTMLSelectElement).value = button.dataset.method!;
      updateStockInputMode();
    });
  });
  document.getElementById("toggle-custom-category")!.addEventListener("click", () => {
    const input = document.getElementById("product-custom-category") as HTMLInputElement;
    input.classList.toggle("hidden");
    if (!input.classList.contains("hidden")) input.focus();
  });
  document.querySelectorAll<HTMLButtonElement>(".label-color").forEach(button => {
    button.addEventListener("click", () => {
      currentProductLabelColor = button.dataset.color!;
      updateLabelColorSelection();
    });
  });
  document.getElementById("product-stock")!.addEventListener("input", handleStockInput);
  document.getElementById("product-rice-bag-weight")!.addEventListener("input", handleBagWeightInput);
  ["product-units-per-package", "product-cost-price"].forEach(id => {
    document.getElementById(id)!.addEventListener("input", updateStockPreviews);
  });

  inventorySearch.addEventListener("input", renderInventory);
  inventoryList.addEventListener("click", event => {
    const target = event.target as HTMLElement;
    const stockButton = target.closest<HTMLButtonElement>(".stock-adjust");
    if (stockButton) {
      void adjustProductStock(stockButton.dataset.code!, Number(stockButton.dataset.delta));
      return;
    }
    const addStockButton = target.closest<HTMLButtonElement>(".stock-adjust-custom");
    if (addStockButton) {
      const code = addStockButton.dataset.code!;
      const amountInput = inventoryList.querySelector<HTMLInputElement>(`.stock-adjust-amount[data-code="${CSS.escape(code)}"]`);
      const amount = Number(amountInput?.value);
      if (!Number.isFinite(amount) || amount <= 0) {
        amountInput?.focus();
        alert("Masukkan jumlah stok lebih dari 0. Desimal diperbolehkan.");
        return;
      }
      void adjustProductStock(code, amount).then(success => {
        if (success && amountInput) amountInput.value = "";
      });
      return;
    }
    const deleteButton = target.closest<HTMLButtonElement>(".delete-product");
    if (deleteButton) void deleteProduct(deleteButton.dataset.code!, deleteButton.dataset.name!);
  });

  // Search input
  searchInput.addEventListener("input", () => renderProducts());
  searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      // Could add barcode scan logic here
    }
  });

  // Quick payment buttons
  document.querySelectorAll(".quick-pay").forEach(btn => {
    btn.addEventListener("click", () => {
      const amount = parseFloat(btn.getAttribute("data-amount") || "0");
      setQuickPayment(amount);
    });
  });

  // Payment input change
  paymentInput.addEventListener("input", updateTotals);

  payPrintBtn.addEventListener("click", payAndPrint);
  clearCartBtn.addEventListener("click", clearCart);
});