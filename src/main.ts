import { invoke } from "@tauri-apps/api/core";
import { jsPDF } from "jspdf";

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
  monthly_sold: number;
  sales_month: string;
}

interface CartItem {
  code?: string;
  name: string;
  price: number;
  qty: number;
  cost_price?: number;
}

interface CashEntry {
  entry_id?: string;
  record_id?: string;
  direction: "income" | "expense";
  category: string;
  description: string;
  amount: number;
  cost_amount?: number;
  received?: number;
  change?: number;
  payment_method?: string;
  business_date?: string;
  source?: string;
  items?: Array<{ cost: number; income: number }>;
  created_at: string;
}

interface CustomerDebt {
  debt_id: string;
  customer_name: string;
  debt_side?: "receivable" | "payable";
  description: string;
  amount: number;
  paid: number;
  remaining: number;
  due_date?: string;
  business_date?: string;
  history_archived?: boolean;
  created_at: string;
}

interface CustomerName {
  customer_name: string;
  phone?: string;
  party_type?: "receivable" | "payable";
  is_deleted?: boolean;
}

interface DebtHistory {
  customer: CustomerName;
  debt_side?: "receivable" | "payable";
  debts: CustomerDebt[];
  payments: Array<{ debt_id: string; customer_name?: string; amount: number; payment_type?: string; created_at: string }>;
}

interface DebtPaymentEntry {
  debt_id: string;
  customer_name?: string;
  debt_side?: "receivable" | "payable";
  payment_type?: string;
  amount: number;
  note?: string;
  business_date?: string;
  created_at: string;
}

interface SavingsEntry {
  entry_id?: string;
  account_id?: string;
  name: string;
  direction: "deposit" | "withdraw";
  amount: number;
  note?: string;
  business_date?: string;
  created_at: string;
}

interface SavingsAccount {
  account_id: string;
  name: string;
  phone?: string;
  balance: number;
  total_deposited: number;
  total_withdrawn: number;
  transaction_count: number;
  created_at: string;
}

interface SavingsHistory {
  account: SavingsAccount;
  entries: SavingsEntry[];
  balance: number;
}

interface SavingsAccount {
  account_id: string;
  name: string;
  phone?: string;
  balance: number;
  total_deposited: number;
  total_withdrawn: number;
  transaction_count: number;
  created_at: string;
}

interface SavingsHistory {
  account: SavingsAccount;
  entries: SavingsEntry[];
  balance: number;
}

interface HistoryTransaction {
  transaction_id: string;
  cashier_name?: string;
  payment_status?: "paid" | "unpaid";
  customer_name?: string;
  items: CartItem[];
  subtotal?: number;
  tax?: number;
  total: number;
  payment?: number;
  change?: number;
  payment_method?: string;
  created_at: string;
}

interface ReceiptData {
  store_name: string;
  store_address: string;
  store_phone: string;
  logo_data_url: string;
  receipt_footer: string;
  transaction_id: string;
  cashier_name: string;
  items: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  payment: number;
  change: number;
  payment_method: string;
  timestamp: string;
}

interface StoreSettings {
  store_name: string;
  address: string;
  phone: string;
  receipt_footer: string;
  cashier_name: string;
  logo_data_url: string;
  tax_enabled: boolean;
  tax_rate: number;
  timezone: string;
}

interface UserSession {
  session_id: string;
  user_id: string;
  store_id: string;
  store_name: string;
  name: string;
  email: string;
  role: "owner" | "manager" | "cashier";
}

interface StaffMember {
  user_id: string;
  name: string;
  email: string;
  role: "manager" | "cashier";
  created_at: string;
}

// State
const SESSION_STORAGE_KEY = "kasirpro_session";

let products: Product[] = [];
let cart: CartItem[] = [];
let transactions: HistoryTransaction[] = [];
let visibleTransactions: HistoryTransaction[] = [];
let bookkeepingEntries: CashEntry[] = [];
let customerDebts: CustomerDebt[] = [];
let debtPayments: DebtPaymentEntry[] = [];
let customerNames: CustomerName[] = [];
let savingsEntries: SavingsEntry[] = [];
let savingsAccounts: SavingsAccount[] = [];
let selectedSavingsAccountId: string | null = null;
let selectedSavingsHistory: SavingsHistory | null = null;
let savingsAccountFilter: "all" | "balance" | "zero" = "all";
let bookkeepingFilter = "all";
let debtStatusFilter = "all";
let debtSide: "receivable" | "payable" = "receivable";
let posPaymentStatus: "paid" | "unpaid" = "paid";
let cashIncomePaymentStatus: "paid" | "unpaid" = "paid";
let selectedDebtCustomer: string | null = null;
let selectedDebtHistory: DebtHistory | null = null;
let currentReceipt: ReceiptData | null = null;
let currentCategory: string = "all";
let currentSession: UserSession | null = null;
let barcodeCameraStream: MediaStream | null = null;
let currentProductLabelColor = "#10b981";
let liveClockTimer: number | undefined;
let bookkeepingRefreshTimer: number | undefined;
let storeSettings: StoreSettings = {
  store_name: "COOL KIDS CELL",
  address: "",
  phone: "",
  receipt_footer: "Terima kasih telah berbelanja",
  cashier_name: "",
  logo_data_url: "",
  tax_enabled: false,
  tax_rate: 11,
  timezone: "Asia/Jakarta"
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
  if (!currentSession) return;
  try {
    products = await invoke<Product[]>("get_products", { sessionId: currentSession.session_id });
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

  const sortMode = (document.getElementById("product-sort") as HTMLSelectElement | null)?.value || "popular";
  filtered = [...filtered].sort((left, right) => {
    if (sortMode === "price-asc") return left.price - right.price || left.name.localeCompare(right.name);
    if (sortMode === "price-desc") return right.price - left.price || left.name.localeCompare(right.name);
    return Number(right.monthly_sold || 0) - Number(left.monthly_sold || 0) || left.name.localeCompare(right.name);
  });

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
        <p class="text-xs text-gray-500 mb-2">Terjual bulan ini: ${Number(product.monthly_sold || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 })}</p>
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
          ${currentSession?.role === "owner" || currentSession?.role === "manager" ? `<button type="button" class="delete-product rounded border border-red-200 px-2.5 py-1 text-red-600 hover:bg-red-50" data-code="${escapeHtml(product.code)}" data-name="${escapeHtml(product.name)}">Hapus</button>` : ""}
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
    if (!currentSession) throw new Error("Sesi login tidak tersedia");
    await invoke("adjust_product_stock", { sessionId: currentSession.session_id, code, delta });
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
    if (!currentSession) throw new Error("Sesi login tidak tersedia");
    await invoke("delete_product", { sessionId: currentSession.session_id, code });
    await loadProducts();
  } catch (error) {
    console.error("Gagal menghapus produk:", error);
    alert(`Gagal menghapus produk: ${error}`);
  }
}

function escapeHistoryText(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!);
}

function confirmAction(title: string, message: string, acceptLabel = "Hapus") {
  const dialog = document.getElementById("action-confirm-dialog")!;
  const titleElement = document.getElementById("action-confirm-title")!;
  const messageElement = document.getElementById("action-confirm-message")!;
  const acceptLabelElement = document.getElementById("action-confirm-accept-label")!;
  const acceptButton = document.getElementById("action-confirm-accept") as HTMLButtonElement;
  const cancelButton = document.getElementById("action-confirm-cancel") as HTMLButtonElement;
  const closeButton = document.getElementById("action-confirm-close") as HTMLButtonElement;
  titleElement.textContent = title;
  messageElement.textContent = message;
  acceptLabelElement.textContent = acceptLabel;

  return new Promise<boolean>(resolve => {
    const finish = (accepted: boolean) => {
      dialog.classList.add("hidden");
      dialog.classList.remove("flex");
      acceptButton.removeEventListener("click", accept);
      cancelButton.removeEventListener("click", cancel);
      closeButton.removeEventListener("click", cancel);
      dialog.removeEventListener("click", backdropClick);
      document.removeEventListener("keydown", keydown);
      resolve(accepted);
    };
    const accept = () => finish(true);
    const cancel = () => finish(false);
    const backdropClick = (event: MouseEvent) => { if (event.target === dialog) cancel(); };
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    acceptButton.addEventListener("click", accept);
    cancelButton.addEventListener("click", cancel);
    closeButton.addEventListener("click", cancel);
    dialog.addEventListener("click", backdropClick);
    document.addEventListener("keydown", keydown);
    dialog.classList.remove("hidden");
    dialog.classList.add("flex");
    acceptButton.focus();
  });
}

function historyDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: storeSettings.timezone || "Asia/Jakarta",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function shiftHistoryDate(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function transactionDateKey(transaction: HistoryTransaction) {
  const date = new Date(transaction.created_at);
  return Number.isNaN(date.getTime()) ? "" : historyDateKey(date);
}

function formatTransactionDate(transaction: HistoryTransaction) {
  const date = new Date(transaction.created_at);
  if (Number.isNaN(date.getTime())) return transaction.created_at;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: storeSettings.timezone || "Asia/Jakarta",
    dateStyle: "medium", timeStyle: "short"
  }).format(date);
}

function getFilteredTransactions() {
  const range = (document.getElementById("history-range") as HTMLSelectElement).value;
  const today = historyDateKey(new Date());
  let start = today;
  let end = today;
  if (range === "yesterday") start = end = shiftHistoryDate(today, -1);
  if (range === "last7") start = shiftHistoryDate(today, -6);
  if (range === "last30") start = shiftHistoryDate(today, -29);
  if (range === "thisMonth") start = `${today.slice(0, 7)}-01`;
  if (range === "lastMonth") {
    const firstOfThisMonth = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    firstOfThisMonth.setUTCMonth(firstOfThisMonth.getUTCMonth() - 1);
    start = firstOfThisMonth.toISOString().slice(0, 10);
    end = shiftHistoryDate(`${today.slice(0, 7)}-01`, -1);
  }
  if (range === "custom") {
    start = (document.getElementById("history-start-date") as HTMLInputElement).value;
    end = (document.getElementById("history-end-date") as HTMLInputElement).value;
  }
  return transactions.filter(transaction => {
    const dateKey = transactionDateKey(transaction);
    return dateKey && (!start || dateKey >= start) && (!end || dateKey <= end);
  });
}

function renderTransactionDetail(transaction: HistoryTransaction | null) {
  const detail = document.getElementById("history-detail") as HTMLElement;
  if (!transaction) {
    detail.innerHTML = '<p class="text-sm text-gray-500">Pilih transaksi untuk melihat detail.</p>';
    return;
  }
  const items = Array.isArray(transaction.items) ? transaction.items : [];
  detail.innerHTML = `
    <h2 class="break-all text-sm font-bold text-gray-900">${escapeHistoryText(transaction.transaction_id)}</h2>
    <p class="mt-1 text-xs text-gray-500">${escapeHistoryText(formatTransactionDate(transaction))}</p>
    <p class="mt-2 text-xs text-gray-600">Kasir: ${escapeHistoryText(transaction.cashier_name || "Kasir")}</p>
    <div class="my-3 divide-y divide-gray-100 border-y border-gray-100">
      ${items.map(item => `<div class="flex justify-between gap-3 py-2 text-xs"><span class="min-w-0">${escapeHistoryText(item.name)} <span class="text-gray-500">× ${Number(item.qty) || 0}</span></span><span class="shrink-0">Rp ${((Number(item.price) || 0) * (Number(item.qty) || 0)).toLocaleString("id-ID")}</span></div>`).join("") || '<p class="py-3 text-xs text-gray-500">Rincian produk tidak tersedia.</p>'}
    </div>
    ${transaction.subtotal !== undefined ? `<p class="flex justify-between text-xs text-gray-600"><span>Subtotal</span><span>Rp ${Number(transaction.subtotal).toLocaleString("id-ID")}</span></p>` : ""}
    ${Number(transaction.tax) > 0 ? `<p class="mt-1 flex justify-between text-xs text-gray-600"><span>Pajak</span><span>Rp ${Number(transaction.tax).toLocaleString("id-ID")}</span></p>` : ""}
    <p class="mt-2 flex justify-between border-t border-gray-200 pt-2 text-sm font-bold text-gray-900"><span>Total</span><span>Rp ${Number(transaction.total).toLocaleString("id-ID")}</span></p>
    ${transaction.payment !== undefined ? `<p class="mt-2 flex justify-between text-xs text-gray-600"><span>Bayar / Kembali</span><span>Rp ${Number(transaction.payment).toLocaleString("id-ID")} / Rp ${Number(transaction.change || 0).toLocaleString("id-ID")}</span></p>` : ""}
    ${transaction.payment_method ? `<p class="mt-1 text-xs text-gray-500">Metode: ${escapeHistoryText(transaction.payment_method)}</p>` : ""}
    <button type="button" data-reprint-transaction="${escapeHistoryText(transaction.transaction_id)}" class="mt-4 w-full rounded bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700">Lihat / Cetak Ulang Struk</button>`;
}

async function openTransactionReceipt(transaction: HistoryTransaction) {
  if (!currentSession) return;
  try {
    storeSettings = await invoke<StoreSettings>("get_store_settings", { sessionId: currentSession.session_id });
    const items = Array.isArray(transaction.items) ? transaction.items : [];
    const subtotal = transaction.subtotal ?? items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0), 0);
    const total = Number(transaction.total) || 0;
    const payment = transaction.payment ?? total;
    showReceiptDialog({
      store_name: storeSettings.store_name,
      store_address: storeSettings.address,
      store_phone: storeSettings.phone,
      logo_data_url: storeSettings.logo_data_url,
      receipt_footer: storeSettings.receipt_footer,
      transaction_id: transaction.transaction_id,
      cashier_name: transaction.cashier_name || "Kasir",
      items: items.map(item => ({ name: item.name, price: Number(item.price) || 0, qty: Number(item.qty) || 0 })),
      subtotal,
      tax: transaction.tax ?? Math.max(0, total - subtotal),
      total,
      payment,
      change: transaction.change ?? Math.max(0, payment - total),
      payment_method: transaction.payment_method || "Tunai",
      timestamp: formatTransactionDate(transaction)
    });
  } catch (error) {
    alert(`Gagal memuat pengaturan struk: ${error}`);
  }
}

function renderTransactionHistory() {
  visibleTransactions = getFilteredTransactions();
  const list = document.getElementById("history-list") as HTMLDivElement;
  (document.getElementById("history-count") as HTMLSpanElement).textContent = String(visibleTransactions.length);
  if (!visibleTransactions.length) {
    list.innerHTML = '<p class="px-4 py-8 text-center text-sm text-gray-500">Tidak ada transaksi pada periode ini.</p>';
    renderTransactionDetail(null);
    return;
  }
  list.innerHTML = visibleTransactions.map((transaction, index) => `
    <article class="flex items-center gap-2 border-b border-gray-100 px-2">
      <button type="button" data-history-index="${index}" class="flex min-w-0 flex-1 items-center justify-between gap-3 py-3 text-left hover:bg-green-50">
        <span class="min-w-0"><span class="block truncate text-sm font-medium text-gray-900">${escapeHistoryText(transaction.transaction_id)}</span><span class="mt-1 block text-xs text-gray-500">${escapeHistoryText(formatTransactionDate(transaction))} · ${escapeHistoryText(transaction.cashier_name || "Kasir")}</span></span>
        <span class="shrink-0 text-right"><span class="block text-sm font-semibold text-gray-800">Rp ${Number(transaction.total).toLocaleString("id-ID")}</span><span class="mt-0.5 block text-[9px] font-semibold ${transaction.payment_status === "unpaid" ? "text-amber-600" : "text-emerald-600"}">${transaction.payment_status === "unpaid" ? `BELUM LUNAS · ${escapeHistoryText(transaction.customer_name || "Pelanggan")}` : "LUNAS"}</span></span>
      </button>
      <button type="button" data-delete-history-transaction="${escapeHistoryText(transaction.transaction_id)}" aria-label="Hapus transaksi ${escapeHistoryText(transaction.transaction_id)}" title="Hapus transaksi" class="rounded p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><svg aria-hidden="true" viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg></button>
    </article>`).join("");
  renderTransactionDetail(null);
}

async function loadTransactionHistory() {
  if (!currentSession) return;
  const list = document.getElementById("history-list") as HTMLDivElement;
  list.innerHTML = '<p class="px-4 py-8 text-center text-sm text-gray-500">Memuat riwayat...</p>';
  try {
    transactions = await invoke<HistoryTransaction[]>("list_transactions", { sessionId: currentSession.session_id });
    renderTransactionHistory();
  } catch (error) {
    list.innerHTML = `<p class="px-4 py-8 text-center text-sm text-red-600">Gagal memuat riwayat: ${escapeHistoryText(String(error))}</p>`;
  }
}

async function deleteHistoryTransaction(transactionId: string) {
  if (!currentSession || !await confirmAction("Hapus transaksi?", `Transaksi ${transactionId} dan rinciannya akan dihapus permanen.`)) return;
  try {
    await invoke("delete_transaction", { sessionId: currentSession.session_id, transactionId });
    await Promise.all([loadTransactionHistory(), loadBookkeeping()]);
  } catch (error) {
    alert(`Gagal menghapus transaksi: ${error}`);
  }
}

async function deleteCashEntry(button: HTMLButtonElement) {
  if (!currentSession) return;
  const entryId = button.dataset.deleteCashEntry || null;
  const recordId = button.dataset.cashRecordId || null;
  const description = button.dataset.cashDescription || "transaksi kas";
  if (!entryId && !recordId) {
    alert("ID transaksi kas tidak tersedia, muat ulang pembukuan lalu coba lagi.");
    return;
  }
  if (!await confirmAction("Hapus transaksi kas?", `${description} akan dihapus permanen dari riwayat kas.`)) return;
  button.disabled = true;
  try {
    await invoke("delete_cash_entry", { sessionId: currentSession.session_id, entryId, recordId });
    await loadBookkeeping();
  } catch (error) {
    alert(`Gagal menghapus transaksi kas: ${error}`);
  } finally {
    button.disabled = false;
  }
}

function bookkeepingDateKey(date: Date) {
  return historyDateKey(date);
}

function isWithinBookkeepingPeriod(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = bookkeepingDateKey(new Date());
  const range = (document.getElementById("bookkeeping-period") as HTMLSelectElement).value;
  let start = today;
  let end = today;
  if (range === "yesterday") start = end = shiftHistoryDate(today, -1);
  if (range === "last7") start = shiftHistoryDate(today, -6);
  if (range === "last30") start = shiftHistoryDate(today, -29);
  if (range === "thisMonth") start = `${today.slice(0, 7)}-01`;
  if (range === "lastMonth") {
    const first = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    first.setUTCMonth(first.getUTCMonth() - 1);
    start = first.toISOString().slice(0, 10);
    end = shiftHistoryDate(`${today.slice(0, 7)}-01`, -1);
  }
  if (range === "custom") {
    start = (document.getElementById("bookkeeping-start-date") as HTMLInputElement).value;
    end = (document.getElementById("bookkeeping-end-date") as HTMLInputElement).value;
  }
  const key = bookkeepingDateKey(date);
  return (!start || key >= start) && (!end || key <= end);
}

function renderBookkeeping() {
  const filteredTransactions = transactions.filter(item => isWithinBookkeepingPeriod(item.created_at));
  const filteredEntries = bookkeepingEntries.filter(item =>
    isWithinBookkeepingPeriod(item.business_date || item.created_at) &&
    !["cicilan piutang", "pembayaran utang toko"].includes(item.category.trim().toLowerCase())
  );
  const filteredSavings = savingsEntries.filter(item => isWithinBookkeepingPeriod(item.created_at));
  const posIncome = filteredTransactions.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const otherIncome = filteredEntries.filter(item => item.direction === "income").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const serviceCostUsed = filteredEntries.filter(item => item.direction === "income").reduce((sum, item) => sum + Number(item.cost_amount || 0), 0);
  const expenseEntries = filteredEntries.filter(item => item.direction === "expense");
  const manualCashOut = expenseEntries.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const capitalPurchases = expenseEntries.filter(item => /modal|belanja stok/i.test(item.category)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const operationalExpenses = manualCashOut - capitalPurchases;
  const debtTotal = customerDebts.reduce((sum, debt) => sum + Number(debt.remaining || 0), 0);
  const debtPeople = new Set(customerDebts.filter(debt => Number(debt.remaining) > 0).map(debt => debt.customer_name)).size;
  const profitRecords = filteredTransactions.flatMap(transaction => transaction.items || []);
  const missingCostCount = profitRecords.filter(item => !Number.isFinite(item.cost_price) || Number(item.cost_price) < 0).length;
  const missingServiceCostCount = filteredEntries.filter(item => item.direction === "income" && (!Number.isFinite(item.cost_amount) || !Array.isArray(item.items))).length;
  const productCostUsed = profitRecords.reduce((sum, item) => {
    const unitCost = Number(item.cost_price);
    return Number.isFinite(unitCost) && unitCost >= 0 ? sum + unitCost * (Number(item.qty) || 0) : sum;
  }, 0);
  const totalExpenses = manualCashOut + productCostUsed + serviceCostUsed;
  const hasCompleteCost = profitRecords.length > 0 && missingCostCount === 0;
  const grossProfit = hasCompleteCost
    ? filteredTransactions.reduce((sum, transaction) => sum + (transaction.items || []).reduce((itemsSum, item) => itemsSum + ((Number(item.price) - Number(item.cost_price)) * Number(item.qty)), 0), 0)
    : null;
  const netProfit = missingCostCount > 0 || missingServiceCostCount > 0
    ? null
    : filteredTransactions.length === 0
      ? otherIncome - serviceCostUsed - manualCashOut
      : grossProfit === null
        ? null
        : grossProfit + otherIncome - serviceCostUsed - manualCashOut;

  const setText = (id: string, value: string) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };
  const money = (value: number) => `Rp ${Math.round(value).toLocaleString("id-ID")}`;
  setText("bookkeeping-income-total", money(posIncome + otherIncome));
  setText("bookkeeping-pos-income", `POS: ${money(posIncome)}`);
  setText("bookkeeping-other-income", `Luar Kasir: ${money(otherIncome)}`);
  setText("bookkeeping-expense-total", money(totalExpenses));
  setText("bookkeeping-expense-ops", `Operasional: ${money(operationalExpenses)}`);
  setText("bookkeeping-expense-capital", `Kas keluar modal: ${money(capitalPurchases)}`);
  setText("bookkeeping-expense-product-cost", `Modal produk POS: ${money(productCostUsed)}`);
  setText("bookkeeping-expense-service-cost", `Modal layanan: ${money(serviceCostUsed)}`);
  const incompleteCostNotes = [
    ...(missingCostCount > 0 ? [`${missingCostCount} item POS lama belum memiliki data modal`] : []),
    ...(missingServiceCostCount > 0 ? [`${missingServiceCostCount} pemasukan lama belum mencatat modal`] : [])
  ];
  setText("bookkeeping-expense-cost-note", incompleteCostNotes.join("; "));
  setText("bookkeeping-profit-total", netProfit === null ? "Belum tersedia" : money(netProfit));
  const profitStatus = document.getElementById("bookkeeping-profit-status");
  if (profitStatus) {
    profitStatus.textContent = filteredTransactions.length === 0 && otherIncome === 0 && manualCashOut === 0 ? "Tidak ada penjualan pada periode ini" : netProfit === null ? "Data modal lama belum lengkap" : netProfit >= 0 ? "Surplus" : "Defisit";
    profitStatus.classList.toggle("text-emerald-600", netProfit === null || netProfit >= 0);
    profitStatus.classList.toggle("text-rose-600", netProfit !== null && netProfit < 0);
  }
  setText("bookkeeping-debt-total", money(debtTotal));
  setText("bookkeeping-debt-count", `${debtPeople} Orang`);
  setText("bookkeeping-pos-count", `${filteredTransactions.length} Transaksi POS`);
  setText("bookkeeping-pos-sync-total", money(posIncome));
  setText("bookkeeping-pos-sync-count", `${filteredTransactions.length} Transaksi`);
  setText("bookkeeping-savings-total", String(savingsAccounts.length));

  const combined = [
    ...filteredTransactions.map(transaction => ({ kind: "pos", date: transaction.created_at, data: transaction })),
    ...filteredEntries.map(entry => ({ kind: entry.direction, date: entry.business_date || entry.created_at, data: entry })),
    ...(bookkeepingFilter === "savings" ? filteredSavings.map(entry => ({ kind: "savings", date: entry.created_at, data: entry })) : []),
    ...(bookkeepingFilter === "debt" ? customerDebts.map(debt => ({ kind: "debt", date: debt.created_at, data: debt })) : [])
  ].filter(item => bookkeepingFilter === "all" || bookkeepingFilter === "income" && (item.kind === "pos" || item.kind === "income") || bookkeepingFilter === "expense" && item.kind === "expense" || bookkeepingFilter === "savings" && item.kind === "savings" || bookkeepingFilter === "debt" && item.kind === "debt")
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  const flowList = document.getElementById("bookkeeping-flow-list") as HTMLDivElement;
  if (!combined.length) {
    flowList.innerHTML = '<p class="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-500">Belum ada transaksi pada periode ini.</p>';
  } else {
    flowList.innerHTML = combined.map(item => {
      const isExpense = item.kind === "expense";
      const isSavings = item.kind === "savings";
      const row = item.data;
      const isDebt = item.kind === "debt";
      const amount = Number(item.kind === "pos" ? (row as HistoryTransaction).total : isDebt ? (row as CustomerDebt).remaining : (row as CashEntry | SavingsEntry).amount) || 0;
      const title = item.kind === "pos" ? `Penjualan Kasir ${(row as HistoryTransaction).transaction_id}` : isDebt ? `${(row as CustomerDebt).customer_name}: ${(row as CustomerDebt).description}` : "description" in row ? row.description || ("category" in row ? row.category : "Pencatatan kas") : "name" in row ? row.name : "";
      const date = formatTransactionDate({ created_at: ("business_date" in row ? row.business_date : "") || row.created_at } as HistoryTransaction);
      const badge = isSavings ? "TABUNGAN" : isDebt ? "PIUTANG" : item.kind === "pos" ? "KASIR POS" : isExpense ? "KAS KELUAR" : "KAS MASUK";
      const category = "category" in row ? row.category : "";
      const source = "source" in row ? row.source : "";
      const deleteButton = item.kind === "income" || item.kind === "expense"
        ? `<button type="button" data-delete-cash-entry="${escapeHistoryText((row as CashEntry).entry_id || "")}" data-cash-record-id="${escapeHistoryText((row as CashEntry).record_id || "")}" data-cash-direction="${item.kind}" data-cash-description="${escapeHistoryText(title)}" aria-label="Hapus ${isExpense ? "pengeluaran" : "pemasukan"}" title="Hapus transaksi kas" class="rounded p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><svg aria-hidden="true" viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg></button>`
        : "";
      const posStatus = item.kind === "pos" ? (row as HistoryTransaction).payment_status : undefined;
      const statusBadge = item.kind === "pos" ? `<span class="rounded ${posStatus === "unpaid" ? "bg-amber-100 text-amber-700" : "bg-emerald-800 text-white"} px-1.5 py-0.5 text-[7px] font-bold">${posStatus === "unpaid" ? "BELUM LUNAS" : "LUNAS"}</span>` : "";
      return `<article class="flex items-center gap-2 rounded-lg border ${isExpense ? "border-rose-100" : isDebt ? "border-amber-100" : "border-emerald-100"} bg-slate-50/70 p-2"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${isExpense ? "bg-rose-100 text-rose-700" : isDebt ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}">${isExpense ? "↘" : isSavings ? "♧" : isDebt ? "▤" : "↗"}</span><div class="min-w-0 flex-1"><p class="truncate text-[9px] font-bold text-slate-800">${escapeHistoryText(title)}</p><p class="text-[8px] text-slate-500">${escapeHistoryText(badge)} · ${escapeHistoryText(date)}${category ? ` · ${escapeHistoryText(category)}` : ""}${source ? ` · ${escapeHistoryText(source)}` : ""}</p></div><strong class="shrink-0 text-[10px] ${isExpense ? "text-rose-600" : isDebt ? "text-amber-600" : "text-emerald-600"}">${isExpense ? "−" : "+"} ${money(amount)}</strong>${statusBadge}${deleteButton}</article>`;
    }).join("");
  }

  const unpaidByCustomer = new Map<string, { remaining: number; count: number }>();
  customerDebts
    .filter(debt => (debt.debt_side || "receivable") === "receivable" && !debt.history_archived && Number(debt.remaining) > 0)
    .forEach(debt => {
      const current = unpaidByCustomer.get(debt.customer_name) || { remaining: 0, count: 0 };
      current.remaining += Number(debt.remaining) || 0;
      current.count += 1;
      unpaidByCustomer.set(debt.customer_name, current);
    });
  const debtPreview = document.getElementById("bookkeeping-debt-list") as HTMLDivElement;
  const unpaidCustomers = [...unpaidByCustomer.entries()].sort((left, right) => right[1].remaining - left[1].remaining);
  debtPreview.innerHTML = unpaidCustomers.length
    ? unpaidCustomers.map(([customerName, debt]) => `<article class="flex items-center gap-3 rounded-lg border border-amber-100 bg-slate-50/70 px-3 py-2"><span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">▤</span><div class="min-w-0 flex-1"><p class="truncate text-[10px] font-bold text-slate-800">${escapeHistoryText(customerName)}</p><p class="mt-0.5 text-[8px] text-slate-500">${debt.count} bon belum lunas</p></div><strong class="shrink-0 font-mono text-[10px] font-bold text-amber-700">${money(debt.remaining)}</strong></article>`).join("")
    : '<p class="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-500">Tidak ada utang pelanggan yang belum lunas.</p>';

  renderDebtList();
  const debtMode = bookkeepingFilter === "debt";
  const savingsMode = bookkeepingFilter === "savings";
  document.getElementById("bookkeeping-debt-dashboard")!.classList.toggle("hidden", !debtMode);
  document.getElementById("bookkeeping-savings-dashboard")!.classList.toggle("hidden", !savingsMode);
  document.getElementById("bookkeeping-debt-list-view")!.classList.toggle("hidden", Boolean(selectedDebtHistory));
  document.getElementById("bookkeeping-debt-detail-view")!.classList.toggle("hidden", !selectedDebtHistory);
  document.getElementById("bookkeeping-summary-grid")!.classList.toggle("hidden", debtMode || savingsMode);
  document.getElementById("bookkeeping-ledger-grid")!.classList.toggle("hidden", debtMode || savingsMode);
  document.getElementById("bookkeeping-sync-banner")!.classList.toggle("hidden", debtMode || savingsMode);
  if (savingsMode) renderSavingsDashboard();
}

function renderSavingsDashboard() {
  const money = (amount: number) => `Rp ${Math.round(amount).toLocaleString("id-ID")}`;
  const totalBalance = savingsAccounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const totalDeposited = savingsAccounts.reduce((sum, account) => sum + Number(account.total_deposited || 0), 0);
  const totalWithdrawn = savingsAccounts.reduce((sum, account) => sum + Number(account.total_withdrawn || 0), 0);
  const activeAccounts = savingsAccounts.filter(account => Number(account.balance) > 0).length;
  const setText = (id: string, value: string) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  setText("savings-total-balance", money(totalBalance));
  setText("savings-active-count", `${activeAccounts} rekening aktif`);
  setText("savings-customer-count", String(savingsAccounts.length));
  setText("savings-total-deposited", money(totalDeposited));
  setText("savings-total-withdrawn", money(totalWithdrawn));
  const query = (document.getElementById("savings-search") as HTMLInputElement).value.trim().toLowerCase();
  const accounts = savingsAccounts.filter(account => {
    const matchesSearch = !query || `${account.name} ${account.phone || ""}`.toLowerCase().includes(query);
    const balance = Number(account.balance || 0);
    return matchesSearch && (savingsAccountFilter === "all" || savingsAccountFilter === "balance" && balance > 0 || savingsAccountFilter === "zero" && balance <= 0);
  });
  const list = document.getElementById("savings-account-list") as HTMLDivElement;
  list.innerHTML = accounts.length ? accounts.map(account => {
    const initials = account.name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
    const selected = account.account_id === selectedSavingsAccountId;
    return `<button type="button" data-savings-account="${escapeHistoryText(account.account_id)}" class="flex w-full items-center gap-2.5 px-3 py-3 text-left transition ${selected ? "bg-emerald-50" : "bg-white hover:bg-slate-50"}"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-500">${escapeHistoryText(initials)}</span><span class="min-w-0 flex-1"><span class="block truncate text-[10px] font-bold text-slate-800">${escapeHistoryText(account.name)}</span><span class="block truncate text-[9px] text-slate-500">${escapeHistoryText(account.phone || "Tidak ada no hp")}</span></span><span class="shrink-0 text-right"><span class="block font-mono text-[9px] font-bold text-emerald-600">${money(Number(account.balance) || 0)}</span><span class="text-[8px] text-slate-400">${Number(account.transaction_count) || 0} transaksi</span></span></button>`;
  }).join("") : '<p class="p-5 text-center text-xs text-slate-500">Belum ada rekening tabungan.</p>';

  const history = selectedSavingsHistory;
  const empty = document.getElementById("savings-account-empty")!;
  const detail = document.getElementById("savings-account-detail")!;
  empty.classList.toggle("hidden", Boolean(history));
  detail.classList.toggle("hidden", !history);
  if (!history) return;
  setText("savings-detail-name", history.account.name);
  setText("savings-detail-phone", history.account.phone ? `No. HP ${history.account.phone}` : "Tanpa no. telepon");
  setText("savings-detail-balance", money(history.balance));
  setText("savings-detail-deposit-count", String(history.entries.filter(entry => entry.direction === "deposit").length));
  setText("savings-detail-withdraw-count", String(history.entries.filter(entry => entry.direction === "withdraw").length));
  const entryList = document.getElementById("savings-entry-list") as HTMLDivElement;
  entryList.innerHTML = history.entries.length ? history.entries.map(entry => {
    const deposit = entry.direction === "deposit";
    const date = formatTransactionDate({ created_at: entry.business_date || entry.created_at } as HistoryTransaction);
    return `<article class="flex items-center gap-3 px-3 py-3"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${deposit ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600"}">${deposit ? "↙" : "↗"}</span><div class="min-w-0 flex-1"><p class="text-[10px] font-bold text-slate-800">${deposit ? "Setoran Tabungan" : "Penarikan Tabungan"}</p><p class="mt-0.5 truncate text-[9px] text-slate-500">${escapeHistoryText(entry.note || (deposit ? "Setoran" : "Penarikan"))}</p><p class="text-[8px] text-slate-400">${escapeHistoryText(date)}</p></div><strong class="shrink-0 font-mono text-[10px] font-bold ${deposit ? "text-emerald-600" : "text-rose-600"}">${deposit ? "+" : "−"} ${money(Number(entry.amount))}</strong></article>`;
  }).join("") : '<p class="p-5 text-center text-xs text-slate-400">Belum ada transaksi tabungan.</p>';
}

function renderDebtList() {
  const search = (document.getElementById("debt-search") as HTMLInputElement | null)?.value.trim().toLowerCase() || "";
  const sideDebts = customerDebts.filter(debt => (debt.debt_side || "receivable") === debtSide && !debt.history_archived);
  const sideNames = customerNames.filter(customer => !customer.is_deleted && (!customer.party_type || customer.party_type === debtSide));
  const deletedNames = new Set(customerNames.filter(customer => customer.is_deleted).map(customer => customer.customer_name.toLowerCase()));
  const grouped = new Map<string, CustomerDebt[]>();
  for (const debt of sideDebts) {
    const key = debt.customer_name.trim();
    const records = grouped.get(key) || [];
    records.push(debt);
    grouped.set(key, records);
  }
  const customers = sideNames.map(customer => ({
    ...customer,
    debts: grouped.get(customer.customer_name) || []
  }));
  for (const [name, debts] of grouped) {
    if (deletedNames.has(name.toLowerCase())) continue;
    if (!customers.some(customer => customer.customer_name.toLowerCase() === name.toLowerCase())) {
      customers.push({ customer_name: name, phone: "", debts });
    }
  }
  const receivableDebts = customerDebts.filter(debt => (debt.debt_side || "receivable") === "receivable" && !debt.history_archived);
  const payableDebts = customerDebts.filter(debt => debt.debt_side === "payable" && !debt.history_archived);
  const receivableTotal = receivableDebts.reduce((sum, debt) => sum + Math.max(0, Number(debt.remaining) || 0), 0);
  const payableTotal = payableDebts.reduce((sum, debt) => sum + Math.max(0, Number(debt.remaining) || 0), 0);
  const receivableCount = new Set(receivableDebts.filter(debt => Number(debt.remaining) > 0).map(debt => debt.customer_name)).size;
  const payableCount = new Set(payableDebts.filter(debt => Number(debt.remaining) > 0).map(debt => debt.customer_name)).size;
  const money = (amount: number) => `Rp ${Math.round(amount).toLocaleString("id-ID")}`;
  const listTotal = document.getElementById("debt-list-total");
  const listCount = document.getElementById("debt-list-count");
  if (listTotal) listTotal.textContent = money(receivableTotal);
  if (listCount) listCount.textContent = String(receivableCount);
  const otherTotal = payableTotal;
  const otherCount = payableCount;
  const payableMode = debtSide === "payable";
  (document.getElementById("debt-list-title") as HTMLElement).textContent = "Utang Pelanggan";
  (document.getElementById("debt-list-subtitle") as HTMLElement).textContent = "Uang yang harus Anda terima";
  (document.getElementById("debt-list-count-label") as HTMLElement).textContent = "Pelanggan Belum Lunas";
  (document.getElementById("debt-other-title") as HTMLElement).textContent = "Utang Saya";
  (document.getElementById("debt-other-subtitle") as HTMLElement).textContent = "Uang yang harus Anda bayar";
  (document.getElementById("debt-other-total") as HTMLElement).textContent = money(otherTotal);
  (document.getElementById("debt-other-count") as HTMLElement).textContent = `${otherCount} pihak belum lunas`;
  (document.getElementById("debt-search") as HTMLInputElement).placeholder = payableMode ? "Cari pemasok / kreditur..." : "Cari nama pelanggan...";
  document.querySelectorAll<HTMLButtonElement>("[data-debt-side]").forEach(card => {
    const active = card.dataset.debtSide === debtSide;
    card.setAttribute("aria-pressed", String(active));
    card.classList.toggle("ring-2", active);
    card.classList.toggle("ring-rose-200", active && card.dataset.debtSide === "receivable");
    card.classList.toggle("ring-amber-200", active && card.dataset.debtSide === "payable");
  });

  const filtered = customers.filter(customer => {
    const remaining = customer.debts.reduce((sum, debt) => sum + Number(debt.remaining || 0), 0);
    const matchesText = !search || `${customer.customer_name} ${customer.phone || ""} ${customer.debts.map(debt => debt.description).join(" ")}`.toLowerCase().includes(search);
    const today = historyDateKey(new Date());
    const overdue = customer.debts.some(debt => Number(debt.remaining) > 0 && Boolean(debt.due_date) && debt.due_date! < today);
    const matchesStatus = debtStatusFilter === "all" || debtStatusFilter === "unpaid" && remaining > 0 || debtStatusFilter === "paid" && remaining <= 0 || debtStatusFilter === "overdue" && overdue;
    return matchesText && matchesStatus;
  }).sort((left, right) => {
    const leftBalance = left.debts.reduce((sum, debt) => sum + Number(debt.remaining || 0), 0);
    const rightBalance = right.debts.reduce((sum, debt) => sum + Number(debt.remaining || 0), 0);
    return Number(rightBalance > 0) - Number(leftBalance > 0) || left.customer_name.localeCompare(right.customer_name);
  });
  const list = document.getElementById("debt-customer-list") as HTMLDivElement;
  if (!filtered.length) {
    list.innerHTML = '<p class="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-xs text-slate-500">Tidak ada pelanggan pada filter ini.</p>';
    return;
  }
  list.innerHTML = filtered.map(customer => {
    const balance = customer.debts.reduce((sum, debt) => sum + Number(debt.remaining || 0), 0);
    const description = customer.debts.filter(debt => Number(debt.remaining) > 0).map(debt => debt.description).slice(0, 2).join(" · ");
    const initials = customer.customer_name.trim().split(/\s+/).slice(0, 2).map(word => word[0] || "").join("").toUpperCase();
    const hue = Math.abs([...customer.customer_name].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 0)) % 360;
    return `<button type="button" data-debt-customer="${escapeHistoryText(customer.customer_name)}" class="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left hover:border-emerald-300 hover:bg-emerald-50/40"><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-extrabold text-slate-950" style="background:hsl(${hue} 85% 55%)">${escapeHistoryText(initials)}</span><span class="min-w-0 flex-1"><span class="block truncate text-xs font-bold text-slate-900">${escapeHistoryText(customer.customer_name)}</span><span class="mt-0.5 block truncate text-[9px] text-slate-500">${escapeHistoryText(customer.phone || description || "Pelanggan tersimpan")}</span></span><span class="shrink-0 text-right"><span class="block font-mono text-xs font-bold ${balance > 0 ? "text-rose-600" : "text-emerald-600"}">${money(balance)}</span><span class="mt-0.5 block text-[8px] font-semibold ${balance > 0 ? "text-slate-500" : "text-emerald-600"}">${balance > 0 ? "Belum Lunas" : "Lunas"}</span></span><span class="text-slate-400">›</span></button>`;
  }).join("");
}

function showDebtListView() {
  selectedDebtCustomer = null;
  selectedDebtHistory = null;
  document.getElementById("bookkeeping-debt-list-view")!.classList.remove("hidden");
  document.getElementById("bookkeeping-debt-detail-view")!.classList.add("hidden");
}

async function openCustomerDebtDetail(customerName: string) {
  if (!currentSession) return;
  try {
    selectedDebtHistory = await invoke<DebtHistory>("get_customer_debt_history", { sessionId: currentSession.session_id, customerName, debtSide });
    selectedDebtCustomer = customerName;
    renderCustomerDebtDetail();
    document.getElementById("bookkeeping-debt-list-view")!.classList.add("hidden");
    document.getElementById("bookkeeping-debt-detail-view")!.classList.remove("hidden");
  } catch (error) {
    alert(`Gagal memuat riwayat utang: ${error}`);
  }
}

function openDebtCreateDialog(customerName = "") {
  const form = document.getElementById("debt-create-form") as HTMLFormElement;
  form.reset();
  (document.getElementById("debt-customer-name") as HTMLInputElement).value = customerName;
  (document.getElementById("debt-created-date") as HTMLInputElement).value = historyDateKey(new Date());
  setDebtDatePreset("debt-created-date", "today");
  (document.getElementById("debt-created-due-date") as HTMLInputElement).value = "";
  document.getElementById("debt-create-title")!.textContent = debtSide === "payable" ? "Catat Utang Saya" : "Berikan Utang";
  document.getElementById("debt-create-subtitle")!.textContent = customerName || (debtSide === "payable" ? "Pemasok / pihak pemberi utang" : "Pelanggan");
  document.getElementById("debt-counterparty-label")!.textContent = debtSide === "payable" ? "Nama Pemasok / Kreditur" : "Nama Pelanggan";
  setActionButtonLabel(document.getElementById("debt-create-submit") as HTMLButtonElement, debtSide === "payable" ? "Simpan Utang Saya" : "Simpan Utang");
  document.getElementById("debt-customer-field")?.classList.toggle("hidden", Boolean(customerName));
  document.getElementById("debt-customer-phone-field")?.classList.toggle("hidden", Boolean(customerName));
  (document.getElementById("debt-create-error") as HTMLElement).classList.add("hidden");
  const suggestions = document.getElementById("debt-customer-suggestions") as HTMLDataListElement;
  suggestions.innerHTML = customerNames.filter(customer => !customer.is_deleted).map(customer => `<option value="${escapeHistoryText(customer.customer_name)}">`).join("");
  document.getElementById("debt-create-dialog")!.classList.remove("hidden");
  document.getElementById("debt-create-dialog")!.classList.add("flex");
  (document.getElementById(customerName ? "debt-amount" : "debt-customer-name") as HTMLInputElement).focus();
}

function closeDebtCreateDialog() {
  document.getElementById("debt-create-dialog")!.classList.add("hidden");
  document.getElementById("debt-create-dialog")!.classList.remove("flex");
}

async function saveNewCustomerDebt(event: SubmitEvent) {
  event.preventDefault();
  if (!currentSession) return;
  const customerName = (document.getElementById("debt-customer-name") as HTMLInputElement).value.trim();
  const phone = (document.getElementById("debt-customer-phone") as HTMLInputElement).value.trim();
  const description = (document.getElementById("debt-description") as HTMLInputElement).value.trim();
  const amount = Number((document.getElementById("debt-amount") as HTMLInputElement).value);
  const businessDate = (document.getElementById("debt-created-date") as HTMLInputElement).value;
  const dueDate = (document.getElementById("debt-created-due-date") as HTMLInputElement).value;
  const error = document.getElementById("debt-create-error") as HTMLParagraphElement;
  const submit = document.getElementById("debt-create-submit") as HTMLButtonElement;
  submit.disabled = true;
  setActionButtonLabel(submit, "Menyimpan...");
  error.classList.add("hidden");
  try {
    await invoke("create_customer_debt", { sessionId: currentSession.session_id, customerName, description, amount, phone: phone || null, debtSide, dueDate: dueDate || null, businessDate });
    closeDebtCreateDialog();
    selectedDebtCustomer = null;
    selectedDebtHistory = null;
    await loadBookkeeping();
    await openCustomerDebtDetail(customerName);
  } catch (saveError) {
    error.textContent = String(saveError);
    error.classList.remove("hidden");
  } finally {
    submit.disabled = false;
    setActionButtonLabel(submit, debtSide === "payable" ? "Simpan Utang Saya" : "Simpan Utang");
  }
}

function openDebtPaymentDialog(settleAll = false) {
  if (!selectedDebtHistory || !selectedDebtCustomer) return;
  const active = selectedDebtHistory.debts.filter(debt => Number(debt.remaining) > 0);
  const target = document.getElementById("debt-payment-target") as HTMLSelectElement;
  target.innerHTML = active.map(debt => `<option value="${escapeHistoryText(debt.debt_id)}">${escapeHistoryText(debt.description)} · Sisa Rp ${Number(debt.remaining).toLocaleString("id-ID")}</option>`).join("");
  if (!active.length) return;
  target.disabled = settleAll;
  if (settleAll) target.value = active[0].debt_id;
  document.getElementById("debt-payment-target-wrap")!.classList.toggle("hidden", settleAll || active.length === 1);
  document.getElementById("debt-payment-balance")!.classList.toggle("hidden", settleAll);
  document.getElementById("debt-payment-amount-wrap")!.classList.toggle("hidden", settleAll);
  document.getElementById("debt-payment-note-wrap")!.classList.toggle("hidden", settleAll);
  document.getElementById("debt-payment-date-wrap")!.classList.toggle("hidden", settleAll);
  document.getElementById("debt-settle-confirm")!.classList.toggle("hidden", !settleAll);
  document.getElementById("debt-payment-title")!.textContent = settleAll ? (debtSide === "payable" ? "Lunasi Utang?" : "Lunaskan Utang?") : (debtSide === "payable" ? "Bayar Utang" : "Terima Pembayaran");
  document.getElementById("debt-payment-amount-label")!.textContent = debtSide === "payable" ? "Jumlah Nominal Dibayar (Rp) *" : "Jumlah Nominal Diterima (Rp) *";
  setActionButtonLabel(document.getElementById("debt-payment-submit") as HTMLButtonElement, settleAll ? "Ya, Lunaskan" : "Simpan Pembayaran");
  const settleMessage = document.querySelector<HTMLElement>("#debt-settle-confirm p");
  if (settleMessage) settleMessage.textContent = debtSide === "payable" ? "Anda akan melunasi seluruh sisa utang:" : "Pelanggan akan melunasi seluruh sisa tagihan:";
  const remainingTotal = active.reduce((sum, debt) => sum + Number(debt.remaining), 0);
  const balance = document.querySelector<HTMLElement>("#debt-payment-balance strong");
  if (balance) balance.textContent = `Rp ${Math.round(remainingTotal).toLocaleString("id-ID")}`;
  const settleTotal = document.getElementById("debt-settle-confirm-total");
  if (settleTotal) settleTotal.textContent = `Rp ${Math.round(remainingTotal).toLocaleString("id-ID")}`;
  const amountInput = document.getElementById("debt-payment-amount") as HTMLInputElement;
  amountInput.value = String(settleAll ? remainingTotal : Number(active[0].remaining));
  amountInput.readOnly = settleAll;
  const paymentDate = document.getElementById("debt-payment-date") as HTMLInputElement;
  paymentDate.value = historyDateKey(new Date());
  setDebtDatePreset("debt-payment-date", "today");
  const clearCheckbox = document.getElementById("debt-clear-history-checkbox") as HTMLInputElement;
  clearCheckbox.checked = false;
  (document.getElementById("debt-payment-customer") as HTMLElement).textContent = selectedDebtCustomer;
  (document.getElementById("debt-payment-error") as HTMLElement).classList.add("hidden");
  document.getElementById("debt-payment-dialog")!.dataset.settleAll = String(settleAll);
  document.getElementById("debt-payment-dialog")!.classList.remove("hidden");
  document.getElementById("debt-payment-dialog")!.classList.add("flex");
  if (!settleAll) amountInput.focus();
}

function closeDebtPaymentDialog() {
  const dialog = document.getElementById("debt-payment-dialog")!;
  dialog.classList.add("hidden");
  dialog.classList.remove("flex");
}

function setActionButtonLabel(button: HTMLButtonElement, label: string) {
  const text = button.querySelector<HTMLElement>("[data-button-label]");
  if (text) text.textContent = label;
  else button.textContent = label;
}

function setDebtDatePreset(inputId: string, preset: "today" | "yesterday") {
  const input = document.getElementById(inputId) as HTMLInputElement | null;
  if (!input) return;
  const today = historyDateKey(new Date());
  input.value = preset === "yesterday" ? shiftHistoryDate(today, -1) : today;
  const group = document.querySelector(`[data-debt-date-group="${inputId}"]`);
  group?.querySelectorAll<HTMLButtonElement>("[data-debt-date-preset]").forEach(button => {
    const active = button.dataset.debtDatePreset === preset;
    button.classList.toggle("border-emerald-200", active);
    button.classList.toggle("bg-emerald-50", active);
    button.classList.toggle("text-emerald-700", active);
    button.classList.toggle("border-slate-200", !active);
    button.classList.toggle("bg-white", !active);
    button.classList.toggle("text-slate-600", !active);
  });
}

async function saveDebtPayment(event: SubmitEvent) {
  event.preventDefault();
  if (!currentSession || !selectedDebtHistory || !selectedDebtCustomer) return;
  const amount = Number((document.getElementById("debt-payment-amount") as HTMLInputElement).value);
  const target = document.getElementById("debt-payment-target") as HTMLSelectElement;
  const paymentDate = (document.getElementById("debt-payment-date") as HTMLInputElement).value || historyDateKey(new Date());
  const note = (document.getElementById("debt-payment-note") as HTMLInputElement).value.trim();
  const clearHistory = (document.getElementById("debt-clear-history-checkbox") as HTMLInputElement)?.checked ?? false;
  const error = document.getElementById("debt-payment-error") as HTMLParagraphElement;
  const settleAll = document.getElementById("debt-payment-dialog")!.dataset.settleAll === "true";
  const active = selectedDebtHistory.debts.filter(debt => Number(debt.remaining) > 0);
  const sessionId = currentSession.session_id;
  if (!settleAll && (!Number.isFinite(amount) || amount <= 0)) {
    error.textContent = "Nominal pembayaran harus lebih dari Rp 0.";
    error.classList.remove("hidden");
    return;
  }
  const submit = document.getElementById("debt-payment-submit") as HTMLButtonElement;
  const submitText = submit.querySelector<HTMLElement>("[data-button-label]")?.textContent || submit.textContent || "Simpan Pembayaran";
  submit.disabled = true;
  setActionButtonLabel(submit, "Memproses...");
  error.classList.add("hidden");
  try {
    if (settleAll) {
      await Promise.all(active.map(debt => invoke("add_debt_payment", { sessionId, debtId: debt.debt_id, amount: Number(debt.remaining), note, businessDate: paymentDate })));
      if (clearHistory) {
        await invoke("archive_customer_debt_history", { sessionId: currentSession.session_id, customerName: selectedDebtCustomer, debtSide });
        selectedDebtHistory = {
          customer: selectedDebtHistory.customer,
          debt_side: debtSide,
          debts: [],
          payments: []
        };
        renderCustomerDebtDetail();
      }
    } else {
      await invoke("add_debt_payment", { sessionId: currentSession.session_id, debtId: target.value, amount, note, businessDate: paymentDate });
    }
    closeDebtPaymentDialog();
    await loadBookkeeping();
  } catch (saveError) {
    error.textContent = String(saveError);
    error.classList.remove("hidden");
  } finally {
    submit.disabled = false;
    setActionButtonLabel(submit, submitText);
  }
}

async function deleteSelectedCustomerName() {
  if (!currentSession || !selectedDebtCustomer || !selectedDebtHistory) return;
  if (!await confirmAction("Hapus pelanggan?", `${selectedDebtCustomer} beserta semua bon dan mutasinya akan dihapus permanen.`)) return;
  const button = document.getElementById("debt-delete-customer-button") as HTMLButtonElement;
  button.disabled = true;
  setActionButtonLabel(button, "Menghapus...");
  try {
    await invoke("delete_customer_name", { sessionId: currentSession.session_id, customerName: selectedDebtCustomer, debtSide });
    showDebtListView();
    await loadBookkeeping();
  } catch (error) {
    alert(`Gagal menghapus nama pelanggan: ${error}`);
  } finally {
    button.disabled = false;
    setActionButtonLabel(button, "Hapus");
  }
}

function renderCustomerDebtDetail() {
  const detail = selectedDebtHistory;
  if (!detail) return;
  const debts = detail.debts || [];
  const payments = detail.payments || [];
  const totalGiven = debts.reduce((sum, debt) => sum + Number(debt.amount || 0), 0);
  const totalRemaining = debts.reduce((sum, debt) => sum + Number(debt.remaining || 0), 0);
  const totalReceived = debts.reduce((sum, debt) => sum + Number(debt.paid || 0), 0);
  const dueDates = debts.filter(debt => Number(debt.remaining) > 0 && debt.due_date).map(debt => debt.due_date!).sort();
  const customerName = detail.customer?.customer_name || selectedDebtCustomer || "Pelanggan";
  const initials = customerName.trim().split(/\s+/).slice(0, 2).map(word => word[0] || "").join("").toUpperCase();
  const money = (amount: number) => `Rp ${Math.round(amount).toLocaleString("id-ID")}`;
  (document.getElementById("debt-detail-name") as HTMLElement).textContent = customerName;
  (document.getElementById("debt-detail-phone") as HTMLElement).textContent = detail.customer?.phone || "";
  (document.getElementById("debt-detail-avatar") as HTMLElement).textContent = initials;
  (document.getElementById("debt-detail-status") as HTMLElement).textContent = totalRemaining > 0 ? "BELUM LUNAS" : "LUNAS";
  document.getElementById("debt-detail-status")!.classList.toggle("bg-rose-100", totalRemaining > 0);
  document.getElementById("debt-detail-status")!.classList.toggle("text-rose-600", totalRemaining > 0);
  document.getElementById("debt-detail-status")!.classList.toggle("bg-emerald-100", totalRemaining <= 0);
  document.getElementById("debt-detail-status")!.classList.toggle("text-emerald-700", totalRemaining <= 0);
  (document.getElementById("debt-detail-total") as HTMLElement).textContent = money(totalRemaining);
  (document.getElementById("debt-detail-given") as HTMLElement).textContent = money(totalGiven);
  (document.getElementById("debt-detail-received") as HTMLElement).textContent = money(totalReceived);
  setActionButtonLabel(document.getElementById("debt-add-bon-button") as HTMLButtonElement, debtSide === "payable" ? "Catat Utang (Tambah Bon)" : "Berikan (Tambah Bon)");
  setActionButtonLabel(document.getElementById("debt-add-payment-button") as HTMLButtonElement, debtSide === "payable" ? "Bayar / Cicil Utang" : "Terima (Bayar / Cicil)");
  document.getElementById("debt-settle-all-button")!.textContent = debtSide === "payable" ? "◉ Lunasi Sekarang" : "◉ Lunaskan Sekarang";
  (document.getElementById("debt-due-date-summary") as HTMLElement).textContent = dueDates.length ? `Jatuh tempo ${dueDates[0]}` : "Belum diatur";
  const visibleDebts = debts.filter(debt => !debt.history_archived);
  (document.getElementById("debt-history-count") as HTMLElement).textContent = `${visibleDebts.length + payments.length} Catatan`;
  document.getElementById("debt-settle-all-button")!.classList.toggle("hidden", totalRemaining <= 0);
  document.getElementById("debt-delete-customer-button")!.classList.remove("hidden");

  const history = [
    ...visibleDebts.map(debt => ({ date: debt.created_at, note: debt.description, given: Number(debt.amount), received: 0, id: debt.debt_id, kind: "debt" })),
    ...payments.map(payment => ({ date: payment.created_at, note: payment.payment_type === "given" ? "Bon tambahan" : "Pembayaran cicilan", given: payment.payment_type === "given" ? Number(payment.amount) : 0, received: payment.payment_type === "given" ? 0 : Number(payment.amount), id: payment.debt_id, kind: "payment" }))
  ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  const historyList = document.getElementById("debt-history-list") as HTMLDivElement;
  historyList.innerHTML = history.map(item => `<div class="grid grid-cols-[minmax(0,1fr)_100px_100px_32px] items-center gap-2 px-3 py-3 text-[9px]"><span><span class="block text-slate-400">${escapeHistoryText(formatTransactionDate({ created_at: item.date } as HistoryTransaction))}</span><strong class="mt-1 block text-slate-800">${escapeHistoryText(item.note)}</strong>${item.kind === "debt" && item.given > 0 ? `<div class="mt-1 flex gap-2"><button type="button" data-edit-debt="${escapeHistoryText(item.id)}" class="text-[8px] text-sky-500">✎ Edit nominal</button><button type="button" data-delete-debt="${escapeHistoryText(item.id)}" class="text-[8px] text-rose-500">🗑 Hapus</button></div>` : ""}</span><span class="text-right font-mono font-bold text-emerald-600">${item.received ? money(item.received) : "-"}</span><span class="text-right font-mono font-bold text-rose-600">${item.given ? money(item.given) : "-"}</span><span class="text-center text-slate-300">${item.kind === "payment" ? "·" : ""}</span></div>`).join("") || '<p class="px-4 py-8 text-center text-xs text-slate-500">Belum ada riwayat untuk pelanggan ini.</p>';
}

function downloadCustomerDebtReport() {
  if (!selectedDebtHistory || !selectedDebtCustomer) return;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const debts = selectedDebtHistory.debts || [];
  const payments = selectedDebtHistory.payments || [];
  const outstanding = debts.reduce((sum, debt) => sum + Number(debt.remaining || 0), 0);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("Laporan Utang Pelanggan", 15, 18);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`Pelanggan: ${selectedDebtCustomer}`, 15, 28);
  pdf.text(`Telepon: ${selectedDebtHistory.customer.phone || "-"}`, 15, 34);
  pdf.text(`Sisa utang: Rp ${outstanding.toLocaleString("id-ID")}`, 15, 40);
  let y = 52;
  const events = [
    ...debts.map(debt => ({ date: debt.created_at, note: debt.description, given: Number(debt.amount), received: 0 })),
    ...payments.map(payment => ({ date: payment.created_at, note: "Pembayaran cicilan", given: 0, received: Number(payment.amount) }))
  ].sort((left, right) => left.date.localeCompare(right.date));
  for (const entry of events) {
    if (y > 280) { pdf.addPage(); y = 18; }
    const date = formatTransactionDate({ created_at: entry.date } as HistoryTransaction);
    pdf.text(`${date}  ${entry.note}`.slice(0, 110), 15, y);
    pdf.text(entry.received ? `Terima Rp ${entry.received.toLocaleString("id-ID")}` : `Bon Rp ${entry.given.toLocaleString("id-ID")}`, 15, y + 5);
    y += 12;
  }
  const fileName = selectedDebtCustomer.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pelanggan";
  pdf.save(`riwayat-utang-${fileName}.pdf`);
}

async function loadBookkeeping(customerToRefresh?: string) {
  if (!currentSession) return;
  try {
    const refreshedHistory = customerToRefresh
      ? invoke<DebtHistory>("get_customer_debt_history", { sessionId: currentSession.session_id, customerName: customerToRefresh, debtSide })
      : Promise.resolve(null);
    const refreshedData = await Promise.all([
      invoke<HistoryTransaction[]>("list_transactions", { sessionId: currentSession.session_id }),
      invoke<CashEntry[]>("list_cash_entries", { sessionId: currentSession.session_id }),
      invoke<CustomerDebt[]>("list_customer_debts", { sessionId: currentSession.session_id }),
      invoke<SavingsEntry[]>("list_savings_entries", { sessionId: currentSession.session_id }),
      invoke<CustomerName[]>("list_customer_names", { sessionId: currentSession.session_id, debtSide }),
      invoke<SavingsAccount[]>("list_savings_accounts", { sessionId: currentSession.session_id }),
      invoke<DebtPaymentEntry[]>("list_debt_payments", { sessionId: currentSession.session_id }),
      refreshedHistory
    ]);
    [transactions, bookkeepingEntries, customerDebts, savingsEntries, customerNames, savingsAccounts, debtPayments] = refreshedData;
    if (customerToRefresh && refreshedData[7]) {
      selectedDebtCustomer = customerToRefresh;
      selectedDebtHistory = refreshedData[7];
    }
    renderBookkeeping();
  } catch (error) {
    const list = document.getElementById("bookkeeping-flow-list");
    if (list) list.innerHTML = `<p class="px-4 py-8 text-center text-xs text-rose-600">Gagal memuat pembukuan: ${escapeHistoryText(String(error))}</p>`;
  }
}

async function openSavingsAccount(accountId: string) {
  if (!currentSession) return;
  try {
    selectedSavingsHistory = await invoke<SavingsHistory>("get_savings_account_history", { sessionId: currentSession.session_id, accountId });
    selectedSavingsAccountId = accountId;
    renderSavingsDashboard();
  } catch (error) {
    alert(`Gagal memuat buku tabungan: ${error}`);
  }
}

function closeSavingsDialog(kind: "account" | "transaction") {
  const dialog = document.getElementById(kind === "account" ? "savings-account-dialog" : "savings-transaction-dialog")!;
  dialog.classList.add("hidden");
  dialog.classList.remove("flex");
}

function openSavingsAccountDialog() {
  (document.getElementById("savings-account-form") as HTMLFormElement).reset();
  (document.getElementById("savings-opening-amount") as HTMLInputElement).value = "0";
  (document.getElementById("savings-account-date") as HTMLInputElement).value = historyDateKey(new Date());
  document.getElementById("savings-account-error")!.classList.add("hidden");
  document.getElementById("savings-account-dialog")!.classList.remove("hidden");
  document.getElementById("savings-account-dialog")!.classList.add("flex");
  (document.getElementById("savings-account-name") as HTMLInputElement).focus();
}

async function saveSavingsAccount(event: SubmitEvent) {
  event.preventDefault();
  if (!currentSession) return;
  const name = (document.getElementById("savings-account-name") as HTMLInputElement).value.trim();
  const phone = (document.getElementById("savings-account-phone") as HTMLInputElement).value.trim();
  const openingAmount = Number((document.getElementById("savings-opening-amount") as HTMLInputElement).value) || 0;
  const businessDate = (document.getElementById("savings-account-date") as HTMLInputElement).value;
  const note = (document.getElementById("savings-account-note") as HTMLInputElement).value.trim();
  const error = document.getElementById("savings-account-error") as HTMLParagraphElement;
  const button = document.querySelector<HTMLButtonElement>("#savings-account-form button[type=submit]")!;
  button.disabled = true;
  button.textContent = "Menyimpan...";
  try {
    const accountId = await invoke<string>("create_savings_account", { sessionId: currentSession.session_id, name, phone: phone || null, openingAmount, businessDate, note: note || null });
    closeSavingsDialog("account");
    await loadBookkeeping();
    await openSavingsAccount(accountId);
  } catch (saveError) {
    error.textContent = String(saveError);
    error.classList.remove("hidden");
  } finally {
    button.disabled = false;
    button.textContent = "Simpan";
  }
}

function openSavingsTransactionDialog(direction: "deposit" | "withdraw") {
  if (!selectedSavingsHistory) return;
  (document.getElementById("savings-transaction-form") as HTMLFormElement).reset();
  const isDeposit = direction === "deposit";
  document.getElementById("savings-transaction-dialog")!.dataset.direction = direction;
  document.getElementById("savings-transaction-title")!.textContent = isDeposit ? "Setor Tabungan" : "Tarik Tabungan";
  document.getElementById("savings-transaction-amount-label")!.textContent = isDeposit ? "Nominal Setoran (Rp) *" : `Nominal Penarikan (Rp) * (Maks: Rp ${Math.round(selectedSavingsHistory.balance).toLocaleString("id-ID")})`;
  setActionButtonLabel(document.getElementById("savings-transaction-submit") as HTMLButtonElement, isDeposit ? "Setor" : "Tarik");
  (document.getElementById("savings-transaction-date") as HTMLInputElement).value = historyDateKey(new Date());
  document.getElementById("savings-transaction-error")!.classList.add("hidden");
  const button = document.getElementById("savings-transaction-submit")!;
  button.classList.toggle("bg-emerald-600", isDeposit);
  button.classList.toggle("bg-rose-600", !isDeposit);
  document.getElementById("savings-transaction-dialog")!.classList.remove("hidden");
  document.getElementById("savings-transaction-dialog")!.classList.add("flex");
  (document.getElementById("savings-transaction-amount") as HTMLInputElement).focus();
}

async function saveSavingsTransaction(event: SubmitEvent) {
  event.preventDefault();
  if (!currentSession || !selectedSavingsAccountId) return;
  const dialog = document.getElementById("savings-transaction-dialog")!;
  const direction = dialog.dataset.direction as "deposit" | "withdraw";
  const amount = Number((document.getElementById("savings-transaction-amount") as HTMLInputElement).value);
  const note = (document.getElementById("savings-transaction-note") as HTMLInputElement).value.trim();
  const businessDate = (document.getElementById("savings-transaction-date") as HTMLInputElement).value;
  const error = document.getElementById("savings-transaction-error") as HTMLParagraphElement;
  const button = document.getElementById("savings-transaction-submit") as HTMLButtonElement;
  button.disabled = true;
  setActionButtonLabel(button, "Menyimpan...");
  try {
    await invoke("add_savings_transaction", { sessionId: currentSession.session_id, accountId: selectedSavingsAccountId, direction, amount, note: note || null, businessDate });
    const accountId = selectedSavingsAccountId;
    closeSavingsDialog("transaction");
    await loadBookkeeping();
    await openSavingsAccount(accountId);
  } catch (saveError) {
    error.textContent = String(saveError);
    error.classList.remove("hidden");
  } finally {
    button.disabled = false;
    setActionButtonLabel(button, direction === "deposit" ? "Setor" : "Tarik");
  }
}

async function deleteSavingsAccount() {
  if (!currentSession || !selectedSavingsAccountId || !selectedSavingsHistory) return;
  const confirmed = await confirmAction("Hapus rekening tabungan?", `Rekening ${selectedSavingsHistory.account.name} dan seluruh mutasinya akan dihapus permanen.`);
  if (!confirmed) return;
  try {
    await invoke("delete_savings_account", { sessionId: currentSession.session_id, accountId: selectedSavingsAccountId });
    selectedSavingsAccountId = null;
    selectedSavingsHistory = null;
    await loadBookkeeping();
  } catch (error) {
    alert(`Gagal menghapus rekening tabungan: ${error}`);
  }
}

function cashIncomeItems() {
  return [...document.querySelectorAll<HTMLDivElement>("#cash-income-items [data-cash-income-item]")];
}

function readCashIncomeTotals() {
  return cashIncomeItems().reduce((totals, row) => {
    totals.cost += Number(row.querySelector<HTMLInputElement>("[data-cash-income-cost]")?.value) || 0;
    totals.income += Number(row.querySelector<HTMLInputElement>("[data-cash-income-amount]")?.value) || 0;
    return totals;
  }, { cost: 0, income: 0 });
}

function updateCashIncomeTotals() {
  const { cost, income } = readCashIncomeTotals();
  const received = Number((document.getElementById("cash-income-received") as HTMLInputElement).value) || 0;
  const money = (amount: number) => `Rp ${Math.round(amount).toLocaleString("id-ID")}`;
  (document.getElementById("cash-income-total-cost") as HTMLElement).textContent = money(cost);
  (document.getElementById("cash-income-total-amount") as HTMLElement).textContent = money(income);
  const outstanding = cashIncomePaymentStatus === "unpaid" ? Math.max(0, income - received) : 0;
  const changeLabel = document.getElementById("cash-income-change-label");
  if (changeLabel) changeLabel.textContent = cashIncomePaymentStatus === "unpaid" ? "Sisa Bon:" : "Kembalian:";
  (document.getElementById("cash-income-change") as HTMLElement).textContent = money(cashIncomePaymentStatus === "unpaid" ? outstanding : Math.max(0, received - income));
  (document.getElementById("cash-income-profit") as HTMLElement).textContent = money(income - cost);
}

function addCashIncomeItem() {
  const list = document.getElementById("cash-income-items") as HTMLDivElement;
  const row = document.createElement("div");
  row.dataset.cashIncomeItem = "true";
  row.className = "grid grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)_32px] items-center gap-2 rounded-xl border border-slate-200 bg-white p-2";
  row.innerHTML = `<span class="text-xs text-slate-600">${list.children.length + 1}</span><input data-cash-income-cost type="number" min="0" step="1" aria-label="Biaya modal item ${list.children.length + 1}" class="min-w-0 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs" /><input data-cash-income-amount type="number" min="0" step="1" aria-label="Pemasukan item ${list.children.length + 1}" class="min-w-0 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs" /><button type="button" data-cash-income-remove aria-label="Hapus item" class="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100">×</button>`;
  list.append(row);
  row.querySelectorAll("input").forEach(input => input.addEventListener("input", updateCashIncomeTotals));
  updateCashIncomeTotals();
}

function setCashIncomeDate(day: "today" | "yesterday") {
  const today = historyDateKey(new Date());
  (document.getElementById("cash-income-date") as HTMLInputElement).value = day === "today" ? today : shiftHistoryDate(today, -1);
  document.querySelectorAll<HTMLButtonElement>(".cash-income-date-preset").forEach(button => {
    const active = button.dataset.cashIncomeDate === day;
    button.classList.toggle("border-emerald-200", active);
    button.classList.toggle("bg-emerald-50", active);
    button.classList.toggle("text-emerald-700", active);
    button.classList.toggle("border-slate-200", !active);
    button.classList.toggle("bg-white", !active);
    button.classList.toggle("text-slate-600", !active);
  });
}

function openCashIncomeDialog() {
  const dialog = document.getElementById("cash-income-dialog")!;
  (document.getElementById("cash-income-category") as HTMLSelectElement).value = "Transfer Uang";
  (document.getElementById("cash-income-payment-method") as HTMLSelectElement).value = "Tunai";
  (document.getElementById("cash-income-received") as HTMLInputElement).value = "";
  void setCreditPaymentStatus("cash-income", "paid");
  document.getElementById("cash-income-items")!.innerHTML = "";
  document.getElementById("cash-income-error")!.classList.add("hidden");
  setCashIncomeDate("today");
  addCashIncomeItem();
  dialog.classList.remove("hidden");
  dialog.classList.add("flex");
  document.querySelector<HTMLInputElement>("[data-cash-income-amount]")?.focus();
}

function closeCashIncomeDialog() {
  const dialog = document.getElementById("cash-income-dialog")!;
  dialog.classList.add("hidden");
  dialog.classList.remove("flex");
}

async function saveCashIncome() {
  if (!currentSession) return;
  const items = cashIncomeItems().map(row => ({
    cost: Number(row.querySelector<HTMLInputElement>("[data-cash-income-cost]")?.value) || 0,
    income: Number(row.querySelector<HTMLInputElement>("[data-cash-income-amount]")?.value) || 0
  }));
  const category = (document.getElementById("cash-income-category") as HTMLSelectElement).value;
  const paymentMethod = (document.getElementById("cash-income-payment-method") as HTMLSelectElement).value;
  const businessDate = (document.getElementById("cash-income-date") as HTMLInputElement).value;
  const received = Number((document.getElementById("cash-income-received") as HTMLInputElement).value) || 0;
  const totalCost = items.reduce((sum, item) => sum + item.cost, 0);
  const totalIncome = items.reduce((sum, item) => sum + item.income, 0);
  const creditCustomer = cashIncomePaymentStatus === "unpaid" ? selectedCreditCustomer("cash-income") : "";
  const error = document.getElementById("cash-income-error") as HTMLParagraphElement;
  if (!businessDate || totalIncome <= 0 || received < 0 || (cashIncomePaymentStatus === "paid" && received < totalIncome) || (cashIncomePaymentStatus === "unpaid" && (received >= totalIncome || !creditCustomer))) {
    error.textContent = totalIncome <= 0 ? "Isi pemasukan lebih dari Rp 0." : !businessDate ? "Pilih tanggal transaksi." : received < 0 ? "Nominal diterima tidak boleh negatif." : cashIncomePaymentStatus === "unpaid" && !creditCustomer ? "Pilih pelanggan atau isi nama pelanggan baru." : cashIncomePaymentStatus === "unpaid" ? "Nominal diterima harus kurang dari total pemasukan." : "Uang diterima belum mencukupi total pemasukan.";
    error.classList.remove("hidden");
    return;
  }
  const description = items.map((item, index) => `Item ${index + 1}: modal Rp ${item.cost}, pemasukan Rp ${item.income}`).join("; ");
  const button = document.getElementById("cash-income-save") as HTMLButtonElement;
  const buttonLabel = button.querySelector<HTMLElement>("[data-button-label]")?.textContent || button.textContent || "Simpan Pemasukan";
  button.disabled = true;
  setActionButtonLabel(button, "Menyimpan...");
  error.classList.add("hidden");
  try {
    await invoke("create_cash_entry", {
      sessionId: currentSession.session_id,
      direction: "income",
      category,
      description,
      amount: totalIncome,
      costAmount: totalCost,
      received,
      paymentMethod,
      businessDate,
      items,
      creditCustomer: creditCustomer || null
    });
    closeCashIncomeDialog();
    await loadBookkeeping();
  } catch (saveError) {
    error.textContent = `Gagal menyimpan pemasukan: ${saveError}`;
    error.classList.remove("hidden");
  } finally {
    button.disabled = false;
    setActionButtonLabel(button, buttonLabel);
  }
}

function setCashExpenseDate(day: "today" | "yesterday") {
  const today = historyDateKey(new Date());
  (document.getElementById("cash-expense-date") as HTMLInputElement).value = day === "today" ? today : shiftHistoryDate(today, -1);
  document.querySelectorAll<HTMLButtonElement>(".cash-expense-date-preset").forEach(button => {
    const active = button.dataset.cashExpenseDate === day;
    button.classList.toggle("border-emerald-200", active);
    button.classList.toggle("bg-emerald-50", active);
    button.classList.toggle("text-emerald-700", active);
    button.classList.toggle("border-slate-200", !active);
    button.classList.toggle("bg-white", !active);
    button.classList.toggle("text-slate-600", !active);
  });
}

function openCashExpenseDialog() {
  const dialog = document.getElementById("cash-expense-dialog")!;
  (document.getElementById("cash-expense-category") as HTMLSelectElement).value = "Top-Up Saldo Server Pulsa";
  (document.getElementById("cash-expense-description") as HTMLInputElement).value = "";
  (document.getElementById("cash-expense-amount") as HTMLInputElement).value = "";
  (document.getElementById("cash-expense-source") as HTMLSelectElement).value = "Kas Toko (Laci Kasir)";
  document.getElementById("cash-expense-error")!.classList.add("hidden");
  setCashExpenseDate("today");
  dialog.classList.remove("hidden");
  dialog.classList.add("flex");
  (document.getElementById("cash-expense-amount") as HTMLInputElement).focus();
}

function closeCashExpenseDialog() {
  const dialog = document.getElementById("cash-expense-dialog")!;
  dialog.classList.add("hidden");
  dialog.classList.remove("flex");
}

async function saveCashExpense() {
  if (!currentSession) return;
  const category = (document.getElementById("cash-expense-category") as HTMLSelectElement).value;
  const description = (document.getElementById("cash-expense-description") as HTMLInputElement).value.trim();
  const amount = Number((document.getElementById("cash-expense-amount") as HTMLInputElement).value);
  const source = (document.getElementById("cash-expense-source") as HTMLSelectElement).value;
  const businessDate = (document.getElementById("cash-expense-date") as HTMLInputElement).value;
  const error = document.getElementById("cash-expense-error") as HTMLParagraphElement;
  if (!Number.isFinite(amount) || amount <= 0 || !businessDate) {
    error.textContent = amount <= 0 || !Number.isFinite(amount) ? "Masukkan nominal pengeluaran lebih dari Rp 0." : "Pilih tanggal pengeluaran.";
    error.classList.remove("hidden");
    return;
  }
  const button = document.getElementById("cash-expense-save") as HTMLButtonElement;
  const buttonLabel = button.querySelector<HTMLElement>("[data-button-label]")?.textContent || button.textContent || "Simpan Pengeluaran";
  button.disabled = true;
  setActionButtonLabel(button, "Menyimpan...");
  error.classList.add("hidden");
  try {
    await invoke("create_cash_entry", {
      sessionId: currentSession.session_id,
      direction: "expense",
      category,
      description,
      amount,
      source,
      businessDate
    });
    closeCashExpenseDialog();
    await loadBookkeeping();
  } catch (saveError) {
    error.textContent = `Gagal menyimpan pengeluaran: ${saveError}`;
    error.classList.remove("hidden");
  } finally {
    button.disabled = false;
    setActionButtonLabel(button, buttonLabel);
  }
}

async function addBookkeepingAction(action: "income" | "expense" | "debt" | "savings") {
  if (!currentSession) return;
  if (action === "income") {
    openCashIncomeDialog();
    return;
  }
  if (action === "expense") {
    openCashExpenseDialog();
    return;
  }
  if (action === "debt") {
    openDebtCreateDialog(selectedDebtCustomer || "");
    return;
  }
  if (action === "savings") {
    selectedSavingsAccountId = null;
    selectedSavingsHistory = null;
    document.querySelector<HTMLButtonElement>('[data-bookkeeping-filter="savings"]')?.click();
  }
}

function exportBookkeepingPdf() {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const money = (value: number) => `Rp ${Math.round(value).toLocaleString("id-ID")}`;
  const period = (document.getElementById("bookkeeping-period") as HTMLSelectElement).selectedOptions[0].text;
  const inPeriod = (value: string) => Boolean(value) && isWithinBookkeepingPeriod(value);
  const cashEntries = bookkeepingEntries.filter(entry =>
    inPeriod(entry.business_date || entry.created_at) &&
    !["cicilan piutang", "pembayaran utang toko"].includes(entry.category.trim().toLowerCase())
  );
  const periodTransactions = transactions.filter(transaction => inPeriod(transaction.created_at));
  const periodDebts = customerDebts.filter(debt => !debt.history_archived && inPeriod(debt.business_date || debt.created_at));
  const periodDebtPayments = debtPayments.filter(payment => inPeriod(payment.business_date || payment.created_at));
  const periodSavings = savingsEntries.filter(entry => inPeriod(entry.business_date || entry.created_at));
  const posIncome = periodTransactions.reduce((sum, transaction) => sum + Number(transaction.total || 0), 0);
  const cashIncome = cashEntries.filter(entry => entry.direction === "income").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const cashExpense = cashEntries.filter(entry => entry.direction === "expense").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const posCost = periodTransactions.reduce((sum, transaction) => sum + (transaction.items || []).reduce((itemsSum, item) => {
    const cost = Number(item.cost_price);
    return Number.isFinite(cost) && cost >= 0 ? itemsSum + cost * (Number(item.qty) || 0) : itemsSum;
  }, 0), 0);
  const serviceCost = cashEntries.filter(entry => entry.direction === "income").reduce((sum, entry) => sum + Number(entry.cost_amount || 0), 0);
  const netProfit = posIncome + cashIncome - posCost - serviceCost - cashExpense;
  const savingsDeposits = periodSavings.filter(entry => entry.direction === "deposit").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const savingsWithdrawals = periodSavings.filter(entry => entry.direction === "withdraw").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const savingsBalance = savingsAccounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const receivableOutstanding = customerDebts.filter(debt => (debt.debt_side || "receivable") === "receivable" && !debt.history_archived).reduce((sum, debt) => sum + Number(debt.remaining || 0), 0);
  const payableOutstanding = customerDebts.filter(debt => debt.debt_side === "payable" && !debt.history_archived).reduce((sum, debt) => sum + Number(debt.remaining || 0), 0);
  const left = 15;
  const tableWidth = 180;
  const pageBottom = 278;
  let y = 18;
  const dateLabel = (value: string) => formatTransactionDate({ created_at: value } as HistoryTransaction);
  const ensureSpace = (height: number) => {
    if (y + height > pageBottom) { pdf.addPage(); y = 18; }
  };
  const sectionHeader = (title: string, subtitle: string) => {
    ensureSpace(25);
    pdf.setFillColor(232, 241, 247);
    pdf.roundedRect(left, y, tableWidth, 10, 1.5, 1.5, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(25, 55, 75);
    pdf.text(title, left + 3, y + 6.5);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(88, 110, 128);
    pdf.text(subtitle, left + tableWidth - 3, y + 6.5, { align: "right" });
    y += 13;
  };
  const drawTable = (headers: string[], widths: number[], rows: string[][], alignments: Array<"left" | "right"> = []) => {
    const drawHeader = () => {
      if (y + 8 > pageBottom) { pdf.addPage(); y = 18; }
      pdf.setFillColor(25, 67, 83);
      pdf.roundedRect(left, y, tableWidth, 8, 1, 1, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7);
      pdf.setTextColor(255, 255, 255);
      let x = left;
      headers.forEach((header, index) => {
        const align = alignments[index] || "left";
        pdf.text(header, align === "right" ? x + widths[index] - 2 : x + 2, y + 5.2, { align });
        x += widths[index];
      });
      y += 8;
    };
    drawHeader();
    if (!rows.length) {
      pdf.setFillColor(250, 252, 253);
      pdf.rect(left, y, tableWidth, 10, "F");
      pdf.setDrawColor(226, 232, 238);
      pdf.line(left, y + 10, left + tableWidth, y + 10);
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(7.5);
      pdf.setTextColor(120, 135, 148);
      pdf.text("Tidak ada data pada periode ini.", left + 3, y + 6.3);
      y += 10;
      return;
    }
    rows.forEach((row, rowIndex) => {
      const cellLines = row.map((cell, index) => pdf.splitTextToSize(String(cell || "-"), Math.max(8, widths[index] - 4)) as string[]);
      const rowHeight = Math.max(8, Math.max(...cellLines.map(lines => lines.length)) * 3.6 + 4);
      if (y + rowHeight > pageBottom) { pdf.addPage(); y = 18; drawHeader(); }
      pdf.setFillColor(...(rowIndex % 2 === 0 ? [250, 252, 253] as [number, number, number] : [238, 245, 248] as [number, number, number]));
      pdf.rect(left, y, tableWidth, rowHeight, "F");
      pdf.setDrawColor(220, 229, 234);
      pdf.line(left, y + rowHeight, left + tableWidth, y + rowHeight);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(42, 57, 68);
      let x = left;
      cellLines.forEach((lines, index) => {
        const align = alignments[index] || "left";
        pdf.text(lines, align === "right" ? x + widths[index] - 2 : x + 2, y + 4.2, { align, lineHeightFactor: 1.15 });
        if (index > 0) {
          pdf.setDrawColor(232, 237, 240);
          pdf.line(x, y, x, y + rowHeight);
        }
        x += widths[index];
      });
      y += rowHeight;
    });
  };

  pdf.setFillColor(18, 83, 79);
  pdf.roundedRect(left, y, tableWidth, 27, 2, 2, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text("Laporan Keuangan & Simpanan", left + 6, y + 10);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(218, 239, 235);
  pdf.text(`COOL KIDS CELL  |  Periode ${period}`, left + 6, y + 18);
  pdf.text(`Dicetak ${dateLabel(new Date().toISOString())}`, left + tableWidth - 6, y + 18, { align: "right" });
  y += 33;

  const cards = [
    { label: "TOTAL PEMASUKAN", value: money(posIncome + cashIncome), color: [15, 137, 108] as [number, number, number] },
    { label: "PENGELUARAN KAS", value: money(cashExpense), color: [202, 63, 72] as [number, number, number] },
    { label: "ESTIMASI LABA", value: money(netProfit), color: [28, 107, 157] as [number, number, number] },
    { label: "SALDO TABUNGAN", value: money(savingsBalance), color: [184, 124, 26] as [number, number, number] }
  ];
  const cardGap = 3;
  const cardWidth = (tableWidth - cardGap * 3) / 4;
  cards.forEach((card, index) => {
    const x = left + index * (cardWidth + cardGap);
    pdf.setFillColor(247, 250, 251);
    pdf.setDrawColor(222, 231, 234);
    pdf.roundedRect(x, y, cardWidth, 20, 1.5, 1.5, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(5.8);
    pdf.setTextColor(96, 116, 128);
    pdf.text(card.label, x + 2.5, y + 5);
    pdf.setFontSize(8);
    pdf.setTextColor(...card.color);
    pdf.text(card.value, x + 2.5, y + 13);
  });
  y += 25;

  sectionHeader("RINGKASAN PERIODE", "Saldo utang dan tabungan terkini");
  drawTable(["Komponen", "Nilai"], [130, 50], [
    ["Pemasukan POS", money(posIncome)], ["Pemasukan kas lain", money(cashIncome)],
    ["Pengeluaran kas", money(cashExpense)], ["Modal produk POS", money(posCost)],
    ["Modal layanan", money(serviceCost)], ["Estimasi laba bersih", money(netProfit)],
    ["Piutang pelanggan belum lunas", money(receivableOutstanding)], ["Utang toko belum lunas", money(payableOutstanding)],
    ["Saldo tabungan saat ini", money(savingsBalance)], ["Setoran tabungan periode ini", money(savingsDeposits)],
    ["Penarikan tabungan periode ini", money(savingsWithdrawals)]
  ], ["left", "right"]);

  const cashData = [
    ...periodTransactions.map(transaction => ({ date: transaction.created_at, kind: "POS", detail: `POS ${transaction.transaction_id} · ${transaction.items?.map(item => item.name).join(", ") || "Penjualan"}`, amount: Number(transaction.total || 0), direction: "income" })),
    ...cashEntries.map(entry => ({ date: entry.business_date || entry.created_at, kind: entry.direction === "expense" ? "Keluar" : "Masuk", detail: `${entry.category}${entry.description ? ` · ${entry.description}` : ""}`, amount: Number(entry.amount || 0), direction: entry.direction }))
  ].sort((a, b) => a.date.localeCompare(b.date));
  y += 4;
  sectionHeader("ARUS KAS", `${cashData.length} transaksi`);
  drawTable(["Tanggal", "Jenis", "Keterangan", "Nominal"], [29, 22, 94, 35], cashData.map(entry => [dateLabel(entry.date), entry.kind, entry.detail, `${entry.direction === "expense" ? "−" : "+"} ${money(entry.amount)}`]), ["left", "left", "left", "right"]);

  const debtData = [
    ...periodDebts.map(debt => ({ date: debt.business_date || debt.created_at, kind: (debt.debt_side || "receivable") === "payable" ? "Utang toko" : "Piutang", customer: debt.customer_name, detail: debt.description, amount: money(debt.amount), remaining: money(debt.remaining) })),
    ...periodDebtPayments.map(payment => ({ date: payment.business_date || payment.created_at, kind: payment.debt_side === "payable" ? "Bayar utang" : "Pembayaran", customer: payment.customer_name || "Nasabah", detail: payment.note || "Mutasi pembayaran", amount: `− ${money(payment.amount)}`, remaining: "−" }))
  ].sort((a, b) => a.date.localeCompare(b.date));
  y += 4;
  sectionHeader("BUKU UTANG", `${periodDebts.length} bon · ${periodDebtPayments.length} pembayaran`);
  drawTable(["Tanggal", "Jenis", "Nasabah", "Keterangan", "Bon/Bayar", "Sisa"], [24, 25, 32, 48, 26, 25], debtData.map(entry => [dateLabel(entry.date), entry.kind, entry.customer, entry.detail, entry.amount, entry.remaining]), ["left", "left", "left", "left", "right", "right"]);

  const savingsData = periodSavings.map(entry => ({ date: entry.business_date || entry.created_at, entry }))
    .sort((a, b) => a.date.localeCompare(b.date));
  y += 4;
  sectionHeader("TABUNGAN", `${savingsData.length} mutasi · saldo ${money(savingsBalance)}`);
  drawTable(["Tanggal", "Nasabah", "Jenis", "Catatan", "Nominal"], [28, 36, 22, 62, 32], savingsData.map(({ date, entry }) => [dateLabel(date), entry.name, entry.direction === "withdraw" ? "Tarik" : "Setor", entry.note || "-", `${entry.direction === "withdraw" ? "−" : "+"} ${money(Number(entry.amount || 0))}`]), ["left", "left", "left", "left", "right"]);

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(215, 225, 230);
    pdf.line(left, 286, left + tableWidth, 286);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(110, 126, 136);
    pdf.text("COOL KIDS CELL · Laporan internal", left, 291);
    pdf.text(`${page} / ${pageCount}`, left + tableWidth, 291, { align: "right" });
  }

  const slug = period.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "periode";
  pdf.save(`laporan-pembukuan-${slug}.pdf`);
}

function showView(selectedView: string) {
  if (!currentSession) return;
  if (selectedView === "inventory" && currentSession.role === "cashier") selectedView = "pos";
  if (["account", "staff", "settings"].includes(selectedView) && currentSession.role !== "owner") selectedView = "pos";
  document.querySelectorAll<HTMLElement>("#pos-view, #inventory-view, #history-view, #bookkeeping-view, #settings-view, #account-view, #staff-view").forEach(view => {
    view.classList.toggle("hidden", view.id !== `${selectedView}-view`);
  });
  document.querySelectorAll<HTMLButtonElement>(".nav-tab[data-view]").forEach(tab => {
    const isActive = tab.dataset.view === selectedView;
    tab.classList.toggle("bg-green-500", isActive);
    tab.classList.toggle("text-white", isActive);
    tab.classList.toggle("text-gray-700", !isActive);
  });
  if (selectedView === "inventory") renderInventory();
  if (selectedView === "history") void loadTransactionHistory();
  if (bookkeepingRefreshTimer) window.clearInterval(bookkeepingRefreshTimer);
  if (selectedView === "bookkeeping") {
    void loadBookkeeping();
    bookkeepingRefreshTimer = window.setInterval(() => void loadBookkeeping(), 30_000);
  }
  if (selectedView === "settings") void loadStoreSettings();
  if (selectedView === "account") renderOwnerProfile();
  if (selectedView === "staff") void loadStoreStaff();
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
      const action = item.dataset.accountAction;
      if (action === "settings") showView("settings");
      else if (action === "staff") showView("staff");
      else if (action === "account") showView("account");
      else {
        menuMessage.textContent = "Backup & Impor Data akan diaktifkan pada tahap berikutnya.";
        menuMessage.classList.remove("hidden");
        accountMenu.classList.remove("hidden");
        menuButton.setAttribute("aria-expanded", "true");
      }
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

  document.getElementById("manage-store-staff")!.addEventListener("click", () => showView("staff"));
  document.getElementById("staff-close")!.addEventListener("click", () => showView("account"));
  document.getElementById("account-logout")!.addEventListener("click", () => void logoutAccount());
  document.getElementById("copy-store-id")!.addEventListener("click", async () => {
    if (!currentSession) return;
    await navigator.clipboard?.writeText(currentSession.store_id);
    const button = document.getElementById("copy-store-id")!;
    button.textContent = "✓";
    setTimeout(() => { button.textContent = "▢"; }, 1200);
  });
}

function showAuthForm(isSetup: boolean, message = "") {
  const title = document.getElementById("auth-title") as HTMLHeadingElement;
  const description = document.getElementById("auth-description") as HTMLParagraphElement;
  const ownerFields = document.getElementById("owner-registration-fields") as HTMLDivElement;
  const nameInput = document.getElementById("auth-name") as HTMLInputElement;
  const storeNameInput = document.getElementById("auth-store-name") as HTMLInputElement;
  const passwordInput = document.getElementById("auth-password") as HTMLInputElement;
  const submit = document.getElementById("auth-submit") as HTMLButtonElement;
  const eyebrow = document.getElementById("auth-eyebrow") as HTMLParagraphElement;
  const emailInput = document.getElementById("auth-email") as HTMLInputElement;
  eyebrow.textContent = isSetup ? "Owner & Toko" : "Akses Toko";
  title.textContent = isSetup ? "Daftarkan Toko" : "Login Aplikasi KasirPro";
  description.textContent = isSetup
    ? "Buat akun Owner dan ID Toko. Akun tersimpan di database." 
    : "Masuk dengan akun Owner, Manager, atau Kasir yang terdaftar.";
  ownerFields.classList.toggle("hidden", !isSetup);
  nameInput.required = isSetup;
  storeNameInput.required = isSetup;
  emailInput.autocomplete = "username";
  passwordInput.autocomplete = isSetup ? "new-password" : "current-password";
  submit.textContent = isSetup ? "Daftarkan Owner & Toko" : "Login";
  const error = document.getElementById("auth-error") as HTMLParagraphElement;
  error.textContent = message;
  error.classList.toggle("hidden", !message);
}

function setActiveSession(session: UserSession) {
  currentSession = session;
  // Persist session to localStorage for auto-restore on app restart
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (e) {
    console.warn("Failed to save session to localStorage:", e);
  }
  const cashierLabel = document.getElementById("active-cashier") as HTMLDivElement;
  const avatar = document.getElementById("cashier-avatar") as HTMLDivElement;
  cashierLabel.textContent = session.name;
  avatar.textContent = session.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? "").join("");
  document.querySelectorAll<HTMLButtonElement>(".nav-tab[data-view='inventory']").forEach(tab => tab.classList.toggle("hidden", session.role === "cashier"));
  document.querySelectorAll<HTMLButtonElement>("[data-account-action='account'], [data-account-action='staff'], [data-account-action='settings'], [data-account-action='backup']").forEach(item => item.classList.toggle("hidden", session.role !== "owner"));
  (document.getElementById("account-menu-button") as HTMLButtonElement).querySelector("span:nth-child(2) span:nth-child(2)")!.textContent = `${session.role.toUpperCase()} • ${session.store_name}`;
  document.getElementById("auth-overlay")!.classList.add("hidden");
  showView("pos");
  void loadProducts();
  void loadStoreSettings();
  if (session.role === "owner") void loadStoreStaff();
}

function logoutAccount() {
  const sessionId = currentSession?.session_id;
  if (sessionId) {
    void invoke("logout_user", { sessionId }).catch(error => console.warn("Logout backend:", error));
  }
  // Clear persisted session from localStorage
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (e) {
    console.warn("Failed to clear session from localStorage:", e);
  }
  currentSession = null;
  products = [];
  document.querySelectorAll<HTMLElement>("#pos-view, #inventory-view, #settings-view, #account-view, #staff-view").forEach(view => {
    view.classList.toggle("hidden", view.id !== "pos-view");
  });
  renderProducts();
  renderCart();
  document.getElementById("active-cashier")!.textContent = "Akun keluar";
  showAuthForm(false);
  document.getElementById("auth-overlay")!.classList.remove("hidden");
  (document.getElementById("auth-password") as HTMLInputElement).value = "";
  (document.getElementById("auth-password") as HTMLInputElement).focus();
}

async function handleAuthSubmit(event: SubmitEvent) {
  event.preventDefault();
  const error = document.getElementById("auth-error") as HTMLParagraphElement;
  error.classList.add("hidden");
  const email = (document.getElementById("auth-email") as HTMLInputElement).value.trim();
  const password = (document.getElementById("auth-password") as HTMLInputElement).value;
  const isSetup = !document.getElementById("owner-registration-fields")!.classList.contains("hidden");

  try {
    if (isSetup) {
      const name = (document.getElementById("auth-name") as HTMLInputElement).value.trim();
      const storeName = (document.getElementById("auth-store-name") as HTMLInputElement).value.trim();
      const address = (document.getElementById("auth-store-address") as HTMLInputElement).value.trim();
      const phone = (document.getElementById("auth-store-phone") as HTMLInputElement).value.trim();
      if (!name || !storeName || !email.includes("@") || password.length < 8) {
        throw new Error("Lengkapi nama Owner, nama toko, email valid, dan password minimal 8 karakter.");
      }
      const session = await invoke<UserSession>("register_owner", { name, email, password, storeName, address, phone });
      setActiveSession(session);
    } else {
      const session = await invoke<UserSession>("login_user", { email, password });
      setActiveSession(session);
    }
    (document.getElementById("auth-password") as HTMLInputElement).value = "";
  } catch (authError) {
    error.textContent = authError instanceof Error ? authError.message : String(authError);
    error.classList.remove("hidden");
  }
}

function renderOwnerProfile() {
  if (!currentSession) return;
  (document.getElementById("owner-initials") as HTMLDivElement).textContent = currentSession.name.split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase();
  (document.getElementById("owner-profile-name") as HTMLParagraphElement).textContent = currentSession.name;
  (document.getElementById("owner-profile-email") as HTMLParagraphElement).textContent = currentSession.email;
  (document.getElementById("owner-store-id") as HTMLElement).textContent = currentSession.store_id;
  (document.getElementById("staff-store-id") as HTMLElement).textContent = currentSession.store_id;
}

async function loadStoreStaff() {
  if (currentSession?.role !== "owner") return;
  try {
    const staff = await invoke<StaffMember[]>("list_store_staff", { sessionId: currentSession.session_id });
    renderStoreStaff(staff);
  } catch (error) {
    const status = document.getElementById("staff-form-status") as HTMLParagraphElement;
    status.textContent = `Gagal memuat staf: ${error}`;
  }
}

function renderStoreStaff(staff: StaffMember[]) {
  (document.getElementById("staff-count") as HTMLSpanElement).textContent = String(staff.length + 1);
  const list = document.getElementById("staff-list") as HTMLDivElement;
  const ownerCard = currentSession ? `<article class="rounded-xl border border-slate-200 bg-white p-4"><div class="flex items-center justify-between"><strong class="text-sm">${escapeHtml(currentSession.name)}</strong><span class="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700">♛ OWNER</span></div><p class="mt-1 font-mono text-xs text-slate-500">${escapeHtml(currentSession.email)}</p><p class="mt-2 text-[10px] text-slate-400">Akun utama toko</p></article>` : "";
  list.innerHTML = ownerCard + staff.map(member => `
    <article class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center justify-between gap-3"><div><strong class="text-sm text-slate-800">${escapeHtml(member.name)}</strong><span class="ml-2 rounded-full ${member.role === "manager" ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"} px-2 py-1 text-[10px] font-bold">${member.role.toUpperCase()}</span></div><button type="button" class="remove-staff text-slate-400 hover:text-red-600" data-user-id="${escapeHtml(member.user_id)}" data-name="${escapeHtml(member.name)}" aria-label="Hapus ${escapeHtml(member.name)}">▤</button></div>
      <p class="mt-1 font-mono text-xs text-slate-500">${escapeHtml(member.email)}</p><p class="mt-2 text-[10px] text-slate-400">Store ID sama dengan Owner</p>
    </article>
  `).join("");
}

async function submitStaffForm(event: SubmitEvent) {
  event.preventDefault();
  if (!currentSession || currentSession.role !== "owner") return;
  const status = document.getElementById("staff-form-status") as HTMLParagraphElement;
  const name = (document.getElementById("staff-name") as HTMLInputElement).value.trim();
  const email = (document.getElementById("staff-email") as HTMLInputElement).value.trim();
  const password = (document.getElementById("staff-password") as HTMLInputElement).value;
  const role = (document.querySelector<HTMLInputElement>("input[name='staff-role']:checked")?.value || "cashier") as "cashier" | "manager";
  try {
    await invoke<StaffMember>("create_store_staff", { sessionId: currentSession.session_id, name, email, password, role });
    (document.getElementById("staff-form") as HTMLFormElement).reset();
    status.textContent = `Akun ${role} tersimpan di database toko.`;
    await loadStoreStaff();
  } catch (error) {
    status.textContent = `Gagal membuat akun: ${error}`;
  }
}

async function removeStoreStaff(userId: string, name: string) {
  if (!currentSession || !confirm(`Hapus akun staf ${name}?`)) return;
  try {
    await invoke("delete_store_staff", { sessionId: currentSession.session_id, userId });
    await loadStoreStaff();
  } catch (error) {
    alert(`Gagal menghapus staf: ${error}`);
  }
}

async function loadStoreSettings() {
  const status = document.getElementById("settings-status") as HTMLParagraphElement;
  try {
    if (!currentSession) throw new Error("Login diperlukan");
    storeSettings = await invoke<StoreSettings>("get_store_settings", { sessionId: currentSession.session_id });
    (document.getElementById("store-name") as HTMLInputElement).value = storeSettings.store_name;
    (document.getElementById("store-address") as HTMLTextAreaElement).value = storeSettings.address;
    (document.getElementById("store-phone") as HTMLInputElement).value = storeSettings.phone;
    (document.getElementById("store-cashier") as HTMLInputElement).value = storeSettings.cashier_name;
    (document.getElementById("receipt-footer") as HTMLTextAreaElement).value = storeSettings.receipt_footer;
    (document.getElementById("tax-enabled") as HTMLInputElement).checked = storeSettings.tax_enabled;
    (document.getElementById("tax-rate") as HTMLInputElement).value = String(storeSettings.tax_rate || 11);
    (document.getElementById("tax-rate-wrap") as HTMLSpanElement).classList.toggle("hidden", !storeSettings.tax_enabled);
    (document.getElementById("store-logo-file") as HTMLInputElement).value = "";
    renderStoreLogo(storeSettings.logo_data_url);
    (document.getElementById("nav-store-name") as HTMLDivElement).textContent = storeSettings.store_name;
    const navLogo = document.getElementById("nav-store-logo") as HTMLImageElement;
    navLogo.src = storeSettings.logo_data_url || "";
    navLogo.classList.toggle("hidden", !storeSettings.logo_data_url);
    setSettingsTimezone(storeSettings.timezone || "Asia/Jakarta");
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
    receipt_footer: (document.getElementById("receipt-footer") as HTMLInputElement).value.trim(),
    logo_data_url: storeSettings.logo_data_url || "",
    tax_enabled: (document.getElementById("tax-enabled") as HTMLInputElement).checked,
    tax_rate: parseFloat((document.getElementById("tax-rate") as HTMLInputElement).value) || 0,
    timezone: storeSettings.timezone || "Asia/Jakarta"
  };
  try {
    if (!currentSession) throw new Error("Login diperlukan");
    storeSettings = await invoke<StoreSettings>("save_store_settings", { sessionId: currentSession.session_id, settings });
    const navName = document.getElementById("nav-store-name") as HTMLDivElement;
    navName.textContent = storeSettings.store_name;
    const navLogo = document.getElementById("nav-store-logo") as HTMLImageElement;
    navLogo.src = storeSettings.logo_data_url || "";
    navLogo.classList.toggle("hidden", !storeSettings.logo_data_url);
    updateTotals();
    status.textContent = "Pengaturan toko berhasil disimpan.";
  } catch (error) {
    console.error("Gagal menyimpan pengaturan toko:", error);
    status.textContent = `Gagal menyimpan pengaturan: ${error}`;
  }
}

function renderStoreLogo(dataUrl: string) {
  const image = document.getElementById("store-logo-preview") as HTMLImageElement;
  const placeholder = document.getElementById("store-logo-placeholder") as HTMLSpanElement;
  image.src = dataUrl || "";
  image.classList.toggle("hidden", !dataUrl);
  placeholder.classList.toggle("hidden", !!dataUrl);
}

function setSettingsTimezone(timezone: string) {
  const allowed = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"];
  storeSettings.timezone = allowed.includes(timezone) ? timezone : "Asia/Jakarta";
  const labels: Record<string, string> = { "Asia/Jakarta": "WIB", "Asia/Makassar": "WITA", "Asia/Jayapura": "WIT" };
  const label = labels[storeSettings.timezone];
  (document.getElementById("timezone-badge") as HTMLSpanElement).textContent = label;
  (document.getElementById("clock-zone-label") as HTMLSpanElement).textContent = label;
  document.querySelectorAll<HTMLButtonElement>(".timezone-option").forEach(button => {
    const active = button.dataset.timezone === storeSettings.timezone;
    button.classList.toggle("border-emerald-400", active);
    button.classList.toggle("bg-emerald-50", active);
    button.classList.toggle("shadow-sm", active);
    button.setAttribute("aria-pressed", String(active));
  });
  updateStoreClock();
}

function updateStoreClock() {
  const clock = document.getElementById("store-live-clock");
  if (!clock) return;
  clock.textContent = new Intl.DateTimeFormat("id-ID", {
    timeZone: storeSettings.timezone || "Asia/Jakarta",
    weekday: "long", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZoneName: "short"
  }).format(new Date());
}

function formatStoreTimestamp(date: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: storeSettings.timezone || "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(date);
}

async function refreshDatabaseStatus() {
  const label = document.getElementById("database-status-label") as HTMLSpanElement;
  const dot = document.getElementById("database-status-dot") as HTMLSpanElement;
  try {
    await invoke<string>("test_db_connection");
    label.textContent = "Database terhubung";
    label.title = "SurrealDB terhubung";
    dot.classList.remove("bg-amber-400", "bg-rose-500");
    dot.classList.add("bg-emerald-500");
  } catch (error) {
    label.textContent = "Database tidak terhubung";
    label.title = String(error);
    dot.classList.remove("bg-amber-400", "bg-emerald-500");
    dot.classList.add("bg-rose-500");
  }
}

async function loadStoreLogo(file: File) {
  const status = document.getElementById("settings-status") as HTMLParagraphElement;
  if (!file.type.match(/^image\/(png|jpeg|svg\+xml)$/)) {
    status.textContent = "Format logo harus PNG, JPG, atau SVG.";
    return;
  }
  if (file.size > 1_500_000) {
    status.textContent = "Ukuran logo maksimal 1,5 MB.";
    return;
  }
  const sourceUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("File logo tidak dapat dibaca"));
    reader.readAsDataURL(file);
  });
  const image = new Image();
  image.src = sourceUrl;
  await image.decode();
  const scale = Math.min(1, 384 / image.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Logo tidak dapat dikonversi");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  storeSettings.logo_data_url = canvas.toDataURL("image/png");
  renderStoreLogo(storeSettings.logo_data_url);
  status.textContent = "Logo siap disimpan bersama profil toko.";
}

// Add to cart
function addToCart(productId: string) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  const existingItem = cart.find(item => item.code === product.code);
  if (existingItem) {
    existingItem.qty += 1;
  } else {
    cart.push({
      code: product.code,
      name: product.name,
      price: product.price,
      cost_price: product.cost_price,
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
function getCartTotal() {
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const tax = storeSettings.tax_enabled ? Math.round(subtotal * storeSettings.tax_rate / 100) : 0;
  return subtotal + tax;
}

function updateTotals() {
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const tax = storeSettings.tax_enabled ? Math.round(subtotal * storeSettings.tax_rate / 100) : 0;
  const total = subtotal + tax;

  subtotalSpan.textContent = `Rp ${subtotal.toLocaleString("id-ID")}`;
  const taxRow = document.getElementById("tax-summary-row") as HTMLDivElement;
  taxRow.classList.toggle("hidden", !storeSettings.tax_enabled);
  (document.getElementById("tax-summary-label") as HTMLSpanElement).textContent = `PPN (${storeSettings.tax_rate}%):`;
  (document.getElementById("tax-summary-amount") as HTMLSpanElement).textContent = `Rp ${tax.toLocaleString("id-ID")}`;
  totalSpan.textContent = `Rp ${total.toLocaleString("id-ID")}`;

  // Update change
  const payment = parseFloat(paymentInput.value) || 0;
  const difference = payment - total;
  const changeLabel = document.getElementById("change-label");
  if (changeLabel) changeLabel.textContent = posPaymentStatus === "unpaid" ? "Sisa Bon" : "Kembalian";
  changeSpan.textContent = `Rp ${Math.abs(posPaymentStatus === "unpaid" ? Math.min(0, difference) : Math.max(0, difference)).toLocaleString("id-ID")}`;
}

async function loadCreditCustomerOptions(select: HTMLSelectElement) {
  if (!currentSession) throw new Error("Login diperlukan untuk memilih pelanggan bon.");
  const names = await invoke<CustomerName[]>("list_customer_names", { sessionId: currentSession.session_id, debtSide: "receivable" });
  const currentValue = select.value;
  select.innerHTML = '<option value="">Pilih pelanggan...</option>' + names
    .filter(customer => !customer.is_deleted && (!customer.party_type || customer.party_type === "receivable"))
    .map(customer => `<option value="${escapeHistoryText(customer.customer_name)}">${escapeHistoryText(customer.customer_name)}</option>`)
    .join("") + '<option value="__new__">+ Tambah pelanggan baru</option>';
  if ([...select.options].some(option => option.value === currentValue)) select.value = currentValue;
}

async function setCreditPaymentStatus(scope: "pos" | "cash-income", status: "paid" | "unpaid") {
  if (scope === "pos") posPaymentStatus = status;
  else cashIncomePaymentStatus = status;
  document.querySelectorAll<HTMLButtonElement>(`[data-credit-status="${scope}"]`).forEach(button => {
    const active = button.dataset.paymentStatus === status;
    const unpaid = button.dataset.paymentStatus === "unpaid";
    button.classList.toggle("bg-emerald-600", active && !unpaid);
    button.classList.toggle("bg-amber-500", active && unpaid);
    button.classList.toggle("text-white", active);
    button.classList.toggle("bg-white", !active);
    button.classList.toggle("text-slate-600", !active);
    button.setAttribute("aria-pressed", String(active));
  });
  const customerWrap = document.getElementById(`${scope}-credit-customer-wrap`);
  customerWrap?.classList.toggle("hidden", status !== "unpaid");
  document.getElementById(scope === "pos" ? "pos-credit-error" : "cash-income-error")?.classList.add("hidden");
  if (status === "unpaid") {
    try {
      await loadCreditCustomerOptions(document.getElementById(`${scope}-credit-customer`) as HTMLSelectElement);
    } catch (error) {
      const errorElement = document.getElementById(scope === "pos" ? "pos-credit-error" : "cash-income-error");
      if (errorElement) {
        errorElement.textContent = String(error);
        errorElement.classList.remove("hidden");
      }
    }
  } else {
    const select = document.getElementById(`${scope}-credit-customer`) as HTMLSelectElement | null;
    const newCustomer = document.getElementById(`${scope}-credit-new-customer`) as HTMLInputElement | null;
    if (select) select.value = "";
    if (newCustomer) newCustomer.value = "";
    document.getElementById(`${scope}-credit-new-customer-wrap`)?.classList.add("hidden");
  }
  if (scope === "pos") updateTotals();
  else updateCashIncomeTotals();
}

function selectedCreditCustomer(scope: "pos" | "cash-income") {
  const select = document.getElementById(`${scope}-credit-customer`) as HTMLSelectElement;
  return select.value === "__new__"
    ? (document.getElementById(`${scope}-credit-new-customer`) as HTMLInputElement).value.trim()
    : select.value.trim();
}

function updateCreditNewCustomerVisibility(scope: "pos" | "cash-income") {
  const select = document.getElementById(`${scope}-credit-customer`) as HTMLSelectElement;
  document.getElementById(`${scope}-credit-new-customer-wrap`)?.classList.toggle("hidden", select.value !== "__new__");
  if (select.value === "__new__") (document.getElementById(`${scope}-credit-new-customer`) as HTMLInputElement).focus();
}

// Quick payment
function setQuickPayment(amount: number) {
  if (amount === 0) {
    posPaymentStatus = "paid";
    document.querySelector<HTMLButtonElement>('[data-credit-status="pos"][data-payment-status="paid"]')?.click();
  }
  paymentInput.value = (amount === 0 ? getCartTotal() : amount).toString();
  updateTotals();
}

function buildReceiptText(receipt: ReceiptData) {
  const width = 32;
  const separator = "-".repeat(width);
  const money = (value: number) => `Rp ${Math.round(value).toLocaleString("id-ID")}`;
  const rightAligned = (label: string, value: string) => `${label}${value}`.padStart(width);
  const lines = [
    receipt.store_name.toUpperCase().slice(0, width).padStart(Math.floor((width + receipt.store_name.length) / 2)).slice(0, width),
    receipt.store_address,
    receipt.store_phone,
    separator,
    `No: ${receipt.transaction_id}`,
    `Kasir: ${receipt.cashier_name}`,
    `Waktu: ${receipt.timestamp}`,
    separator
  ];
  for (const item of receipt.items) {
    lines.push(item.name.slice(0, width));
    lines.push(`${item.qty} x ${money(item.price)}  ${money(item.price * item.qty)}`.slice(0, width));
  }
  lines.push(
    separator,
    rightAligned("Subtotal: ", money(receipt.subtotal)),
    ...(receipt.tax > 0 ? [rightAligned("Pajak: ", money(receipt.tax))] : []),
    rightAligned("TOTAL: ", money(receipt.total)),
    rightAligned("Bayar: ", money(receipt.payment)),
    rightAligned("Kembali: ", money(receipt.change)),
    separator,
    `Metode: ${receipt.payment_method}`,
    separator,
    receipt.receipt_footer || "Terima kasih telah berbelanja"
  );
  return lines.join("\n");
}

function showReceiptDialog(receipt: ReceiptData) {
  currentReceipt = receipt;
  (document.getElementById("receipt-invoice") as HTMLParagraphElement).textContent = `Invoice: #${receipt.transaction_id}`;
  (document.getElementById("receipt-preview") as HTMLPreElement).textContent = buildReceiptText(receipt);
  (document.getElementById("receipt-status") as HTMLParagraphElement).textContent = "Transaksi tersimpan. Pilih tindakan untuk struk ini.";
  document.getElementById("receipt-dialog")!.classList.remove("hidden");
  document.getElementById("receipt-dialog")!.classList.add("flex");
  document.getElementById("receipt-print-button")!.focus();
}

function closeReceiptDialog() {
  const dialog = document.getElementById("receipt-dialog")!;
  dialog.classList.add("hidden");
  dialog.classList.remove("flex");
  currentReceipt = null;
}

async function printCurrentReceipt() {
  if (!currentReceipt) return;
  const button = document.getElementById("receipt-print-button") as HTMLButtonElement;
  const status = document.getElementById("receipt-status") as HTMLParagraphElement;
  button.disabled = true;
  status.textContent = "Mengirim struk ke printer...";
  try {
    const result = await invoke<string>("print_receipt_command", { data: currentReceipt });
    status.textContent = result;
  } catch (error) {
    status.textContent = `Gagal mencetak: ${error}`;
  } finally {
    button.disabled = false;
  }
}

function downloadReceiptPdf() {
  if (!currentReceipt) return;
  const status = document.getElementById("receipt-status") as HTMLParagraphElement;
  try {
    const lines = buildReceiptText(currentReceipt).split("\n").flatMap(line => {
      if (!line) return [""];
      const wrapped: string[] = [];
      for (let offset = 0; offset < line.length; offset += 32) wrapped.push(line.slice(offset, offset + 32));
      return wrapped;
    });
    const lineHeight = 4.2;
    const pageHeight = Math.max(50, 8 + lines.length * lineHeight);
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [58, pageHeight], compress: true });
    pdf.setProperties({ title: `Struk ${currentReceipt.transaction_id}` });
    pdf.setFont("courier", "normal");
    pdf.setFontSize(7);
    lines.forEach((line, index) => pdf.text(line, 3, 5 + index * lineHeight));
    const transactionId = currentReceipt.transaction_id.replace(/[^a-zA-Z0-9_-]/g, "");
    pdf.save(`struk-${transactionId}.pdf`);
    status.textContent = "PDF struk berhasil diunduh.";
  } catch (error) {
    status.textContent = `Gagal membuat PDF: ${error}`;
  }
}

async function shareCurrentReceipt() {
  if (!currentReceipt) return;
  const text = buildReceiptText(currentReceipt);
  try {
    if (navigator.share) {
      await navigator.share({ title: `Struk ${currentReceipt.transaction_id}`, text });
    } else {
      await navigator.clipboard.writeText(text);
      (document.getElementById("receipt-status") as HTMLParagraphElement).textContent = "Berbagi tidak didukung. Teks struk sudah disalin.";
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return;
    (document.getElementById("receipt-status") as HTMLParagraphElement).textContent = `Gagal membagikan struk: ${error}`;
  }
}

// Pay and print
async function payAndPrint() {
  if (!currentSession) {
    alert("Login diperlukan untuk memproses transaksi.");
    return;
  }
  if (cart.length === 0) {
    alert("Keranjang kosong!");
    return;
  }

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  try {
    if (!currentSession) throw new Error("Login diperlukan");
    storeSettings = await invoke<StoreSettings>("get_store_settings", { sessionId: currentSession.session_id });
    updateTotals();
    const tax = storeSettings.tax_enabled ? Math.round(subtotal * storeSettings.tax_rate / 100) : 0;
    const total = subtotal + tax;
    const payment = parseFloat(paymentInput.value) || 0;
    const creditCustomer = posPaymentStatus === "unpaid" ? selectedCreditCustomer("pos") : "";
    if (payment < 0) {
      alert("Nominal diterima tidak boleh negatif.");
      return;
    }
    if ((posPaymentStatus === "paid" && payment < total) || (posPaymentStatus === "unpaid" && (payment >= total || !creditCustomer))) {
      if (posPaymentStatus === "unpaid" && !creditCustomer) {
        document.getElementById("pos-credit-error")!.textContent = "Pilih pelanggan atau isi nama pelanggan baru.";
        document.getElementById("pos-credit-error")!.classList.remove("hidden");
        return;
      }
      if (posPaymentStatus === "unpaid" && payment >= total) {
        alert("Untuk status Belum Lunas, uang diterima harus kurang dari total transaksi. Pilih Lunas jika pembayaran sudah penuh.");
        return;
      }
      alert(`Pembayaran kurang! Total: Rp ${total.toLocaleString("id-ID")}`);
      return;
    }
    const change = Math.max(0, payment - total);
    const timestamp = formatStoreTimestamp(new Date());
    const transactionId = await invoke<string>("create_transaction", {
      sessionId: currentSession.session_id,
      items: cart,
      total,
      subtotal,
      tax,
      payment,
      change,
      cashierName: currentSession.name,
      creditCustomer: creditCustomer || null,
      businessDate: historyDateKey(new Date())
    });

    showReceiptDialog({
      store_name: storeSettings.store_name,
      store_address: storeSettings.address,
      store_phone: storeSettings.phone,
      logo_data_url: storeSettings.logo_data_url,
      receipt_footer: storeSettings.receipt_footer,
      transaction_id: transactionId,
      cashier_name: currentSession.name,
      items: cart.map(item => ({ ...item })),
      subtotal,
      tax,
      total,
      payment,
      change,
      payment_method: "Tunai",
      timestamp
    });

    // Clear cart
    cart = [];
    paymentInput.value = "";
    void setCreditPaymentStatus("pos", "paid");
    renderCart();
    await Promise.all([loadProducts(), loadBookkeeping()]);

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
    posPaymentStatus = "paid";
    document.getElementById("pos-credit-customer-wrap")!.classList.add("hidden");
    document.getElementById("pos-credit-customer")!.innerHTML = '<option value="">Pilih pelanggan...</option><option value="__new__">+ Tambah pelanggan baru</option>';
    (document.getElementById("pos-credit-new-customer") as HTMLInputElement).value = "";
    document.getElementById("pos-credit-new-customer-wrap")!.classList.add("hidden");
    document.getElementById("pos-credit-error")!.classList.add("hidden");
    document.querySelector<HTMLButtonElement>('[data-credit-status="pos"][data-payment-status="paid"]')?.click();
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
  if (!currentSession) {
    alert("Login diperlukan untuk mengelola produk.");
    return;
  }
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
      sessionId: currentSession?.session_id,
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
    if (!currentSession) throw new Error("Login diperlukan");
    storeSettings = await invoke<StoreSettings>("get_store_settings", { sessionId: currentSession.session_id });
    const subtotal = 25000;
    const tax = storeSettings.tax_enabled ? Math.round(subtotal * storeSettings.tax_rate / 100) : 0;
    const total = subtotal + tax;
    const payment = Math.ceil(total / 10000) * 10000;
    await invoke<string>("print_receipt_command", {
      data: {
        store_name: storeSettings.store_name,
        store_address: storeSettings.address,
        store_phone: storeSettings.phone,
        logo_data_url: storeSettings.logo_data_url,
        receipt_footer: storeSettings.receipt_footer,
        transaction_id: "TEST-" + Date.now(),
        cashier_name: currentSession.name,
        items: [
          { name: "Test Produk 1", price: 10000, qty: 2 },
          { name: "Test Produk 2", price: 5000, qty: 1 }
        ],
        subtotal,
        tax,
        total,
        payment,
        change: payment - total,
        payment_method: "Tunai",
        timestamp: formatStoreTimestamp(new Date())
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
  void refreshDatabaseStatus();
  
  // Try to restore session from localStorage
  void (async () => {
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        const session = JSON.parse(stored) as UserSession;
        // Validate session with backend
        try {
          await invoke("validate_session", { sessionId: session.session_id });
          setActiveSession(session);
          return; // Session restored, skip bootstrap check
        } catch (e) {
          // Session invalid/expired, clear and fall through to login
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }
    } catch (e) {
      console.warn("Failed to restore session:", e);
    }
    
    // No valid session, check bootstrap status
    try {
      const needsOwnerSetup = await invoke<boolean>("auth_bootstrap_status");
      showAuthForm(needsOwnerSetup);
    } catch (error) {
      showAuthForm(false, `Database belum dapat diakses: ${error}`);
    }
  })();
  document.getElementById("auth-form")!.addEventListener("submit", event => {
    void handleAuthSubmit(event as SubmitEvent);
  });
  document.getElementById("logout-account-btn")!.addEventListener("click", logoutAccount);
  document.getElementById("staff-form")!.addEventListener("submit", event => void submitStaffForm(event as SubmitEvent));
  document.getElementById("staff-list")!.addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".remove-staff");
    if (button) void removeStoreStaff(button.dataset.userId!, button.dataset.name!);
  });
  settingsForm.addEventListener("submit", event => {
    void saveStoreSettings(event as SubmitEvent);
  });
  document.getElementById("store-logo-file")!.addEventListener("change", event => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file) void loadStoreLogo(file).catch(error => {
      (document.getElementById("settings-status") as HTMLParagraphElement).textContent = String(error);
    });
  });
  document.getElementById("remove-store-logo")!.addEventListener("click", () => {
    storeSettings.logo_data_url = "";
    renderStoreLogo("");
    (document.getElementById("store-logo-file") as HTMLInputElement).value = "";
    (document.getElementById("settings-status") as HTMLParagraphElement).textContent = "Logo akan dihapus setelah profil toko disimpan.";
  });
  document.getElementById("tax-enabled")!.addEventListener("change", event => {
    storeSettings.tax_enabled = (event.currentTarget as HTMLInputElement).checked;
    document.getElementById("tax-rate-wrap")!.classList.toggle("hidden", !storeSettings.tax_enabled);
    updateTotals();
  });
  document.getElementById("tax-rate")!.addEventListener("input", event => {
    storeSettings.tax_rate = parseFloat((event.currentTarget as HTMLInputElement).value) || 0;
    updateTotals();
  });
  document.querySelectorAll<HTMLButtonElement>(".timezone-option").forEach(button => {
    button.addEventListener("click", () => setSettingsTimezone(button.dataset.timezone!));
  });
  document.getElementById("cancel-settings-btn")!.addEventListener("click", () => showView("account"));
  document.getElementById("close-settings-view")!.addEventListener("click", () => showView("account"));
  if (liveClockTimer) window.clearInterval(liveClockTimer);
  liveClockTimer = window.setInterval(updateStoreClock, 1000);
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
  document.getElementById("product-sort")!.addEventListener("change", renderProducts);
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

  document.getElementById("receipt-print-button")!.addEventListener("click", () => void printCurrentReceipt());
  document.getElementById("receipt-pdf-button")!.addEventListener("click", downloadReceiptPdf);
  document.getElementById("receipt-share-button")!.addEventListener("click", () => void shareCurrentReceipt());
  document.getElementById("receipt-copy-button")!.addEventListener("click", async () => {
    if (!currentReceipt) return;
    try {
      await navigator.clipboard.writeText(buildReceiptText(currentReceipt));
      (document.getElementById("receipt-status") as HTMLParagraphElement).textContent = "Teks struk berhasil disalin.";
    } catch (error) {
      (document.getElementById("receipt-status") as HTMLParagraphElement).textContent = `Gagal menyalin teks struk: ${error}`;
    }
  });
  document.getElementById("receipt-close-icon")!.addEventListener("click", closeReceiptDialog);
  document.getElementById("receipt-close-button")!.addEventListener("click", closeReceiptDialog);
  document.getElementById("receipt-new-transaction-button")!.addEventListener("click", () => {
    closeReceiptDialog();
    searchInput.focus();
  });
  document.getElementById("receipt-dialog")!.addEventListener("click", event => {
    if (event.target === document.getElementById("receipt-dialog")) closeReceiptDialog();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !document.getElementById("receipt-dialog")!.classList.contains("hidden")) {
      closeReceiptDialog();
    }
  });

  const historyRange = document.getElementById("history-range") as HTMLSelectElement;
  historyRange.addEventListener("change", () => {
    document.getElementById("history-custom-range")!.classList.toggle("hidden", historyRange.value !== "custom");
    renderTransactionHistory();
  });
  document.getElementById("history-start-date")!.addEventListener("change", renderTransactionHistory);
  document.getElementById("history-end-date")!.addEventListener("change", renderTransactionHistory);
  document.getElementById("history-list")!.addEventListener("click", event => {
    const deleteButton = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-delete-history-transaction]");
    if (deleteButton) {
      void deleteHistoryTransaction(deleteButton.dataset.deleteHistoryTransaction!);
      return;
    }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-history-index]");
    if (!button) return;
    const transaction = visibleTransactions[Number(button.dataset.historyIndex)];
    if (transaction) renderTransactionDetail(transaction);
  });
  document.getElementById("history-detail")!.addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-reprint-transaction]");
    if (!button) return;
    const transaction = transactions.find(item => item.transaction_id === button.dataset.reprintTransaction);
    if (transaction) void openTransactionReceipt(transaction);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-bookkeeping-action]").forEach(button => {
    button.addEventListener("click", () => void addBookkeepingAction(button.dataset.bookkeepingAction as "income" | "expense" | "debt" | "savings"));
  });
  document.getElementById("cash-income-add-item")!.addEventListener("click", addCashIncomeItem);
  document.getElementById("cash-income-items")!.addEventListener("click", event => {
    const removeButton = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-cash-income-remove]");
    if (!removeButton) return;
    removeButton.closest("[data-cash-income-item]")?.remove();
    cashIncomeItems().forEach((row, index) => {
      const number = row.querySelector("span");
      if (number) number.textContent = String(index + 1);
    });
    updateCashIncomeTotals();
  });
  document.getElementById("cash-income-received")!.addEventListener("input", updateCashIncomeTotals);
  document.getElementById("cash-income-exact")!.addEventListener("click", () => {
    (document.getElementById("cash-income-received") as HTMLInputElement).value = String(readCashIncomeTotals().income);
    updateCashIncomeTotals();
  });
  document.querySelectorAll<HTMLButtonElement>(".cash-income-date-preset").forEach(button => {
    button.addEventListener("click", () => setCashIncomeDate(button.dataset.cashIncomeDate as "today" | "yesterday"));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-debt-date-target]").forEach(button => {
    button.addEventListener("click", () => setDebtDatePreset(button.dataset.debtDateTarget!, button.dataset.debtDatePreset as "today" | "yesterday"));
  });
  document.querySelectorAll<HTMLInputElement>("#debt-created-date, #debt-payment-date").forEach(input => {
    input.addEventListener("change", () => {
      input.closest<HTMLElement>("[data-debt-date-group]")?.querySelectorAll<HTMLButtonElement>("[data-debt-date-preset]").forEach(button => {
        button.classList.remove("border-emerald-200", "bg-emerald-50", "text-emerald-700");
        button.classList.add("border-slate-200", "bg-white", "text-slate-600");
      });
    });
  });
  document.getElementById("cash-income-date")!.addEventListener("change", () => {
    document.querySelectorAll<HTMLButtonElement>(".cash-income-date-preset").forEach(button => {
      button.classList.remove("border-emerald-200", "bg-emerald-50", "text-emerald-700");
      button.classList.add("border-slate-200", "bg-white", "text-slate-600");
    });
  });
  document.getElementById("cash-income-close-icon")!.addEventListener("click", closeCashIncomeDialog);
  document.getElementById("cash-income-cancel")!.addEventListener("click", closeCashIncomeDialog);
  document.getElementById("cash-income-save")!.addEventListener("click", () => void saveCashIncome());
  document.querySelectorAll<HTMLButtonElement>("[data-credit-status]").forEach(button => {
    button.addEventListener("click", () => void setCreditPaymentStatus(button.dataset.creditStatus as "pos" | "cash-income", button.dataset.paymentStatus as "paid" | "unpaid"));
  });
  document.getElementById("pos-credit-customer")!.addEventListener("change", () => {
    updateCreditNewCustomerVisibility("pos");
    document.getElementById("pos-credit-error")!.classList.add("hidden");
  });
  document.getElementById("cash-income-credit-customer")!.addEventListener("change", () => {
    updateCreditNewCustomerVisibility("cash-income");
    document.getElementById("cash-income-error")!.classList.add("hidden");
  });
  paymentInput.addEventListener("input", updateTotals);
  document.getElementById("cash-income-dialog")!.addEventListener("click", event => {
    if (event.target === document.getElementById("cash-income-dialog")) closeCashIncomeDialog();
  });
  document.querySelectorAll<HTMLButtonElement>(".cash-expense-date-preset").forEach(button => {
    button.addEventListener("click", () => setCashExpenseDate(button.dataset.cashExpenseDate as "today" | "yesterday"));
  });
  document.getElementById("cash-expense-date")!.addEventListener("change", () => {
    document.querySelectorAll<HTMLButtonElement>(".cash-expense-date-preset").forEach(button => {
      button.classList.remove("border-emerald-200", "bg-emerald-50", "text-emerald-700");
      button.classList.add("border-slate-200", "bg-white", "text-slate-600");
    });
  });
  document.getElementById("cash-expense-close-icon")!.addEventListener("click", closeCashExpenseDialog);
  document.getElementById("cash-expense-cancel")!.addEventListener("click", closeCashExpenseDialog);
  document.getElementById("cash-expense-save")!.addEventListener("click", () => void saveCashExpense());
  document.getElementById("cash-expense-dialog")!.addEventListener("click", event => {
    if (event.target === document.getElementById("cash-expense-dialog")) closeCashExpenseDialog();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-bookkeeping-filter]").forEach(button => {
    button.addEventListener("click", () => {
      const enteringDebtView = button.dataset.bookkeepingFilter === "debt" && bookkeepingFilter !== "debt";
      const enteringSavingsView = button.dataset.bookkeepingFilter === "savings" && bookkeepingFilter !== "savings";
      bookkeepingFilter = button.dataset.bookkeepingFilter || "all";
      if (enteringDebtView) showDebtListView();
      if (enteringSavingsView) {
        selectedSavingsAccountId = null;
        selectedSavingsHistory = null;
      }
      document.querySelectorAll<HTMLButtonElement>("[data-bookkeeping-filter]").forEach(filter => {
        const active = filter.dataset.bookkeepingFilter === bookkeepingFilter;
        filter.classList.toggle("bg-emerald-500", active);
        filter.classList.toggle("text-white", active);
        filter.classList.toggle("bg-slate-50", !active);
        filter.classList.toggle("text-slate-500", !active);
      });
      renderBookkeeping();
      if (enteringSavingsView) void loadBookkeeping();
    });
  });
  const bookkeepingPeriod = document.getElementById("bookkeeping-period") as HTMLSelectElement;
  bookkeepingPeriod.addEventListener("change", () => {
    const customRange = document.getElementById("bookkeeping-custom-range")!;
    customRange.classList.toggle("hidden", bookkeepingPeriod.value !== "custom");
    customRange.classList.toggle("flex", bookkeepingPeriod.value === "custom");
    renderBookkeeping();
  });
  document.getElementById("bookkeeping-start-date")!.addEventListener("change", renderBookkeeping);
  document.getElementById("bookkeeping-end-date")!.addEventListener("change", renderBookkeeping);
  document.getElementById("bookkeeping-refresh")!.addEventListener("click", () => void loadBookkeeping());
  document.getElementById("savings-add-account")!.addEventListener("click", openSavingsAccountDialog);
  document.getElementById("savings-search")!.addEventListener("input", renderSavingsDashboard);
  document.getElementById("savings-account-list")!.addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-savings-account]");
    if (button) void openSavingsAccount(button.dataset.savingsAccount!);
  });
  document.querySelectorAll<HTMLButtonElement>(".savings-account-filter").forEach(button => {
    button.addEventListener("click", () => {
      savingsAccountFilter = button.dataset.savingsAccountFilter as "all" | "balance" | "zero";
      document.querySelectorAll<HTMLButtonElement>(".savings-account-filter").forEach(filter => {
        const active = filter === button;
        filter.classList.toggle("bg-emerald-600", active);
        filter.classList.toggle("text-white", active);
        filter.classList.toggle("text-slate-500", !active);
      });
      renderSavingsDashboard();
    });
  });
  document.getElementById("savings-delete-account")!.addEventListener("click", () => void deleteSavingsAccount());
  document.getElementById("savings-deposit")!.addEventListener("click", () => openSavingsTransactionDialog("deposit"));
  document.getElementById("savings-withdraw")!.addEventListener("click", () => openSavingsTransactionDialog("withdraw"));
  document.getElementById("savings-account-form")!.addEventListener("submit", event => void saveSavingsAccount(event as SubmitEvent));
  document.getElementById("savings-transaction-form")!.addEventListener("submit", event => void saveSavingsTransaction(event as SubmitEvent));
  document.querySelectorAll<HTMLButtonElement>("[data-close-savings-dialog]").forEach(button => {
    button.addEventListener("click", () => closeSavingsDialog(button.dataset.closeSavingsDialog as "account" | "transaction"));
  });
  document.querySelectorAll<HTMLDivElement>("#savings-account-dialog, #savings-transaction-dialog").forEach(dialog => {
    dialog.addEventListener("click", event => {
      if (event.target === dialog) closeSavingsDialog(dialog.id === "savings-account-dialog" ? "account" : "transaction");
    });
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      if (!document.getElementById("savings-account-dialog")!.classList.contains("hidden")) closeSavingsDialog("account");
      if (!document.getElementById("savings-transaction-dialog")!.classList.contains("hidden")) closeSavingsDialog("transaction");
    }
  });
  document.getElementById("bookkeeping-flow-list")!.addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-delete-cash-entry]");
    if (button) void deleteCashEntry(button);
  });
  document.getElementById("bookkeeping-export-pdf")!.addEventListener("click", exportBookkeepingPdf);
  document.getElementById("bookkeeping-open-pos")!.addEventListener("click", () => showView("pos"));
  document.getElementById("bookkeeping-open-debts")!.addEventListener("click", () => {
    document.querySelector<HTMLButtonElement>('[data-bookkeeping-filter="debt"]')?.click();
    document.getElementById("bookkeeping-debt-list")!.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  document.getElementById("bookkeeping-show-flow")!.addEventListener("click", () => {
    bookkeepingFilter = "all";
    document.querySelector<HTMLButtonElement>('[data-bookkeeping-filter="all"]')?.click();
    document.getElementById("bookkeeping-flow-list")!.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  document.getElementById("bookkeeping-debt-list")!.addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-debt-id]");
    if (!button || !currentSession) return;
    const amount = Number(prompt("Nominal cicilan (Rp):"));
    if (!Number.isFinite(amount) || amount <= 0) return;
    void invoke("add_debt_payment", { sessionId: currentSession.session_id, debtId: button.dataset.debtId, amount })
      .then(() => loadBookkeeping())
      .catch(error => alert(`Gagal mencatat cicilan: ${error}`));
  });
  document.getElementById("debt-search")!.addEventListener("input", renderDebtList);
  document.querySelectorAll<HTMLButtonElement>("[data-debt-side]").forEach(button => {
    button.addEventListener("click", () => {
      const nextSide = button.dataset.debtSide as "receivable" | "payable";
      if (nextSide === debtSide) return;
      debtSide = nextSide;
      showDebtListView();
      void loadBookkeeping();
    });
  });
  document.querySelectorAll<HTMLButtonElement>(".debt-status-filter").forEach(button => {
    button.addEventListener("click", () => {
      debtStatusFilter = button.dataset.debtStatus || "all";
      document.querySelectorAll<HTMLButtonElement>(".debt-status-filter").forEach(filter => {
        const active = filter.dataset.debtStatus === debtStatusFilter;
        filter.classList.toggle("bg-slate-100", active);
        filter.classList.toggle("text-slate-900", active);
        filter.classList.toggle("text-slate-500", !active);
      });
      renderDebtList();
    });
  });
  document.getElementById("debt-customer-list")!.addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-debt-customer]");
    if (button) void openCustomerDebtDetail(button.dataset.debtCustomer!);
  });
  document.getElementById("debt-add-button")!.addEventListener("click", () => openDebtCreateDialog());
  document.getElementById("debt-back-button")!.addEventListener("click", showDebtListView);
  document.getElementById("debt-print-button")!.addEventListener("click", downloadCustomerDebtReport);
  document.getElementById("debt-history-list")!.addEventListener("click", event => {
    const editButton = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-edit-debt]");
    if (editButton && currentSession && selectedDebtCustomer) {
      const debt = selectedDebtHistory?.debts.find(item => item.debt_id === editButton.dataset.editDebt);
      if (!debt) return;
      const amount = Number(prompt("Nominal bon baru (Rp):", String(debt.amount)));
      if (!Number.isFinite(amount) || amount <= 0) return;
      void invoke("edit_customer_debt_amount", { sessionId: currentSession.session_id, debtId: debt.debt_id, amount })
        .then(async () => { await loadBookkeeping(); await openCustomerDebtDetail(selectedDebtCustomer!); })
        .catch(error => alert(`Gagal mengubah nominal bon: ${error}`));
      return;
    }
    const deleteButton = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-delete-debt]");
    if (!deleteButton || !currentSession || !selectedDebtCustomer) return;
    const debtId = deleteButton.dataset.deleteDebt;
    if (!debtId || !confirm(`Hapus bon ini untuk ${selectedDebtCustomer}? Nama pelanggan tetap disimpan.`)) return;
    void invoke("delete_customer_debt", { sessionId: currentSession.session_id, debtId })
      .then(async () => { await loadBookkeeping(); await openCustomerDebtDetail(selectedDebtCustomer!); })
      .catch(error => alert(`Gagal menghapus bon: ${error}`));
  });
  document.getElementById("debt-add-bon-button")!.addEventListener("click", () => openDebtCreateDialog(selectedDebtCustomer || ""));
  document.getElementById("debt-add-payment-button")!.addEventListener("click", () => openDebtPaymentDialog());
  document.getElementById("debt-settle-all-button")!.addEventListener("click", () => openDebtPaymentDialog(true));
  document.getElementById("debt-delete-customer-button")!.addEventListener("click", () => void deleteSelectedCustomerName());
  document.getElementById("debt-create-close")!.addEventListener("click", closeDebtCreateDialog);
  document.getElementById("debt-create-cancel")!.addEventListener("click", closeDebtCreateDialog);
  document.getElementById("debt-create-form")!.addEventListener("submit", event => void saveNewCustomerDebt(event as SubmitEvent));
  document.getElementById("debt-payment-close")!.addEventListener("click", closeDebtPaymentDialog);
  document.getElementById("debt-payment-cancel")!.addEventListener("click", closeDebtPaymentDialog);
  document.getElementById("debt-payment-form")!.addEventListener("submit", event => void saveDebtPayment(event as SubmitEvent));
  document.getElementById("debt-reminder-button")!.addEventListener("click", () => {
    if (!selectedDebtCustomer || !currentSession) return;
    const dueDate = prompt("Tanggal jatuh tempo (YYYY-MM-DD):", selectedDebtHistory?.debts.find(debt => Number(debt.remaining) > 0)?.due_date || historyDateKey(new Date()));
    if (!dueDate) return;
    void invoke("set_customer_debt_due_date", { sessionId: currentSession.session_id, customerName: selectedDebtCustomer, dueDate })
      .then(async () => { await loadBookkeeping(); await openCustomerDebtDetail(selectedDebtCustomer!); })
      .catch(error => alert(`Gagal mengatur jatuh tempo: ${error}`));
  });
  document.getElementById("debt-share-button")!.addEventListener("click", () => {
    if (!selectedDebtHistory) return;
    const remaining = selectedDebtHistory.debts.reduce((sum, debt) => sum + Number(debt.remaining || 0), 0);
    const text = `Rincian utang ${selectedDebtCustomer}: sisa ${remaining.toLocaleString("id-ID")}`;
    if (navigator.clipboard) void navigator.clipboard.writeText(text).then(() => alert("Ringkasan utang disalin."), error => alert(`Gagal menyalin: ${error}`));
    else alert(text);
  });
  document.getElementById("debt-whatsapp-button")!.addEventListener("click", () => {
    if (!selectedDebtHistory) return;
    const phone = selectedDebtHistory.customer.phone?.replace(/\D/g, "");
    const balance = selectedDebtHistory.debts.reduce((sum, debt) => sum + Number(debt.remaining || 0), 0);
    const message = `Halo ${selectedDebtCustomer}, mengingatkan sisa bon sebesar Rp ${balance.toLocaleString("id-ID")} di COOL KIDS CELL. Terima kasih.`;
    if (phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    else if (navigator.clipboard) void navigator.clipboard.writeText(message).then(() => alert("Nomor WhatsApp belum tersimpan. Pesan tagihan disalin."), error => alert(`Nomor WhatsApp belum tersimpan. ${error}`));
    else alert(message);
  });

  payPrintBtn.addEventListener("click", payAndPrint);
  clearCartBtn.addEventListener("click", clearCart);
});