import { StickerLayout } from 'qrlayout-core';
import type { EntitySchema } from '../types';
import { PREBUILT_TEMPLATES } from './templates-data';
import { supabaseService } from '../supabase';
import { getMasterData, getPlantByCode } from './master-data';
import { esc } from '../escape';
import { canCurrentUser } from './permissions';

export interface ProductVariable {
    key: string;
    label: string;
    defaultValue?: string;
}

export interface SerializedUnit {
    id: string;
    serialNumber: string;
    productId: string;
    sku: string; // Product Code (Unique)
    productTitle: string; // Product Name
    category: string; // Product Category
    plant?: 'KSPL' | 'KGPL' | 'KBPL' | string;
    group?: string; // Product Group
    color?: string; // Color Code
    warranty?: string; // Warranty in Years
    price: string;
    dp?: string;
    mrp?: string;
    variables: Record<string, string>;
    createdAt: string;
    status: 'In Stock' | 'Quality Passed' | 'Dispatched' | 'Returned';
    lastPrintedAt: string | null;
    printCount: number;
    batchNumber?: string;
}

export interface ProductRecord {
    id: string;
    sku: string; // Product Code (Unique SKU - First)
    title: string; // Product Name
    category: string; // Product Category
    plant?: 'KSPL' | 'KGPL' | 'KBPL' | string; // Manufacturing Plant
    group?: string; // Product Group
    color?: string; // Color code (W, CP, CG, RG, GM, MB, etc.)
    warranty?: string; // Warranty: 1, 2, 3, 4, 5, 10 Years
    brand?: string; // legacy support
    dp: number | string; // Distributor Price (DP in INR)
    mrp: number | string; // Maximum Retail Price (MRP in INR)
    price?: string; // Standard display price
    origPrice?: string; // Original Price / MRP
    description: string;
    serialPrefix: string;
    nextSerialSequence: number;
    serialPadding: number;
    variables: ProductVariable[];
    defaultVariables: Record<string, string>;
    createdAt: string;
}

export interface ProductManagerOptions {
    container: HTMLElement;
    onPrintProductSerials: (layout: StickerLayout, schema: EntitySchema, records: Record<string, any>[]) => void;
    onOpenInDesigner?: (layout: StickerLayout, schema: EntitySchema) => void;
}

export const COLOR_CODES = [
    { code: 'W', label: 'W - White' },
    { code: 'CP', label: 'CP - Chrome Plated' },
    { code: 'CG', label: 'CG - Champagne Gold' },
    { code: 'RG', label: 'RG - Rose Gold' },
    { code: 'GM', label: 'GM - Gun Metal' },
    { code: 'MB', label: 'MB - Matte Black' },
    { code: 'MBRG', label: 'MBRG - Matte Black Rose Gold' },
    { code: 'CRG', label: 'CRG - Copper Rose Gold' },
    { code: 'CGL', label: 'CGL - Champagne Gold Light' },
    { code: 'MW', label: 'MW - Matte White' },
    { code: 'GB', label: 'GB - Gloss Black' },
    { code: 'GW', label: 'GW - Gloss White' },
    { code: 'DGY', label: 'DGY - Dark Grey' },
    { code: 'LGY', label: 'LGY - Light Grey' },
    { code: 'DGR', label: 'DGR - Dark Green' },
    { code: 'LGR', label: 'LGR - Light Green' },
    { code: 'MCF', label: 'MCF - Multi Color Finish' }
];

export const WARRANTY_OPTIONS = [
    { value: '1 Year', label: '1 Year' },
    { value: '2 Years', label: '2 Years' },
    { value: '3 Years', label: '3 Years' },
    { value: '4 Years', label: '4 Years' },
    { value: '5 Years', label: '5 Years' },
    { value: '10 Years', label: '10 Years' }
];

const STORAGE_KEY_PRODUCTS = 'qrlayout_db_products_v2';
const STORAGE_KEY_SERIALS = 'qrlayout_db_serials_v2';

/**
 * Standard Indian Rupee (INR) Formatter
 * Formats numbers into ₹XX,XXX.XX standard currency format
 */
export function formatINR(val: number | string | undefined | null): string {
    if (val === undefined || val === null || val === '') return '₹0.00';
    
    const num = typeof val === 'number' 
        ? val 
        : parseFloat(String(val).replace(/[^0-9.-]+/g, ''));
        
    if (isNaN(num)) return '₹0.00';

    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
}

/**
 * Parses any currency string or numeric input into a clean float
 */
export function parseINRValue(val: any): number {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const clean = String(val).replace(/[^0-9.-]+/g, '');
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
}

export class ProductManagerView {
    private container: HTMLElement;
    private onPrintProductSerials: (layout: StickerLayout, schema: EntitySchema, records: Record<string, any>[]) => void;
    private onOpenInDesigner?: (layout: StickerLayout, schema: EntitySchema) => void;

    private products: ProductRecord[] = [];
    private serials: SerializedUnit[] = [];
    private currentMode: 'list' | 'add' | 'edit' = 'list';
    private editingProductId: string | null = null;
    private selectedProductId: string | null = null;
    private selectedSerialIds: Set<string> = new Set();
    private searchQuery: string = '';
    private categoryFilter: string = 'All';
    private plantFilter: string = 'All';
    private colorFilter: string = 'All';
    private statusFilter: string = 'All';

    constructor(options: ProductManagerOptions) {
        this.container = options.container;
        this.onPrintProductSerials = options.onPrintProductSerials;
        this.onOpenInDesigner = options.onOpenInDesigner;

        this.loadFromStorage();
        this.render();
        void this.syncWithDatabase();
    }

    private loadFromStorage() {
        try {
            const prodJson = localStorage.getItem(STORAGE_KEY_PRODUCTS);
            if (prodJson) {
                this.products = JSON.parse(prodJson);
                // Ensure plant, color, and warranty exist
                this.products.forEach((p, idx) => {
                    if (!p.plant) p.plant = (idx % 3 === 0 ? 'KSPL' : (idx % 3 === 1 ? 'KGPL' : 'KBPL'));
                    if (!p.color) p.color = 'CP';
                    if (!p.warranty) p.warranty = '5 Years';
                });
            } else {
                this.products = [];
            }

            const serialsJson = localStorage.getItem(STORAGE_KEY_SERIALS);
            if (serialsJson) {
                this.serials = JSON.parse(serialsJson);
            } else {
                this.serials = [];
            }
        } catch (e) {
            console.error('Failed loading product cache from storage', e);
            this.products = [];
            this.serials = [];
        }
    }

    public async syncWithDatabase(): Promise<void> {
        try {
            const [dbProducts, dbSerials] = await Promise.all([
                supabaseService.fetchProducts(),
                supabaseService.fetchSerials()
            ]);
            let changed = false;
            if (dbProducts !== null) {
                this.products = dbProducts;
                this.saveProductsToStorage();
                changed = true;
            }
            if (dbSerials !== null) {
                this.serials = dbSerials;
                this.saveSerialsToStorage();
                changed = true;
            }
            if (changed) {
                this.render();
            }
        } catch (err) {
            console.warn('ProductManager database sync notice:', err);
        }
    }

    private saveProductsToStorage() {
        try {
            localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(this.products));
        } catch (e) {
            console.error('Error saving products', e);
        }
    }

    private saveSerialsToStorage() {
        try {
            localStorage.setItem(STORAGE_KEY_SERIALS, JSON.stringify(this.serials));
        } catch (e) {
            console.error('Error saving serials', e);
        }
    }

    public render() {
        if (this.currentMode === 'add' || this.currentMode === 'edit') {
            this.renderAddEditPage();
            return;
        }

        this.renderListPage();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 1. MAIN LIST VIEW (MATCHING FIRST SCREENSHOT + NEW FIELDS)
    // ──────────────────────────────────────────────────────────────────────────
    private renderListPage() {
        const categories = ['All', ...Array.from(new Set(this.products.map(p => p.category)))];

        this.container.innerHTML = `
        <div class="product-master-root">
            <!-- TOP PAGE HEADER BAR -->
            <div class="product-page-header-row">
                <div class="product-page-title-group">
                    <h1 class="product-page-main-heading">Products</h1>
                    <p class="product-page-main-subheading">Manage your product master data.</p>
                </div>

                <div class="product-header-actions-group">
                    <button class="btn btn-outline product-header-btn" id="btn-download-report" title="Download Master Product Report">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        <span>Download Report</span>
                    </button>

                    <button class="btn btn-outline product-header-btn" id="btn-download-template" title="Download CSV Template for Bulk Upload">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                        <span>Download Template</span>
                    </button>

                    <button class="btn btn-outline product-header-btn" id="btn-bulk-upload-csv" title="Upload Products in Bulk via CSV">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        <span>Bulk Upload</span>
                    </button>

                    ${canCurrentUser('products', 'create') ? `
                    <button class="btn btn-primary product-header-btn btn-add-primary" id="btn-add-new-product">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
                        <span>Add Product</span>
                    </button>
                    ` : ''}
                </div>
            </div>

            <!-- MAIN WORKSPACE CARD CONTAINER -->
            <div class="product-card-container">
                <div class="product-card-header">
                    <div>
                        <h2 class="product-card-title">All Products</h2>
                        <p class="product-card-sub">A complete list of your products. Inventory is managed on the Inventory page.</p>
                    </div>
                </div>

                <!-- SEARCH & FILTER BAR -->
                <div class="product-table-toolbar">
                    <div class="product-search-box-clean">
                        <svg class="search-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                        <input type="text" id="product-search-input" placeholder="Search by product code..." value="${this.searchQuery}" />
                        ${this.searchQuery ? `<button class="btn-clear-search" id="btn-clear-search">✕</button>` : ''}
                    </div>

                    <div class="product-filter-group">
                        <select id="product-plant-filter" class="product-cat-select" title="Filter by Plant">
                            <option value="All" ${this.plantFilter === 'All' ? 'selected' : ''}>All Plants (KSPL / KGPL / KBPL)</option>
                            <option value="KSPL" ${this.plantFilter === 'KSPL' ? 'selected' : ''}>KSPL</option>
                            <option value="KGPL" ${this.plantFilter === 'KGPL' ? 'selected' : ''}>KGPL</option>
                            <option value="KBPL" ${this.plantFilter === 'KBPL' ? 'selected' : ''}>KBPL</option>
                        </select>

                        <select id="product-category-filter" class="product-cat-select">
                            ${categories.map(c => `<option value="${c}" ${this.categoryFilter === c ? 'selected' : ''}>${c === 'All' ? 'All Categories' : c}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <!-- TABLE SECTION (PRODUCT CODE FIRST) -->
                <div class="product-table-wrapper">
                    <table class="product-clean-table">
                        <thead>
                            <tr>
                                <th style="width: 15%;">Product Code</th>
                                <th style="width: 25%;">Product Name</th>
                                <th style="width: 10%;">Category</th>
                                <th style="width: 8%;">Plant</th>
                                <th style="width: 8%;">Color</th>
                                <th style="width: 8%;">Warranty</th>
                                <th style="width: 11%; text-align: right;">DP</th>
                                <th style="width: 11%; text-align: right;">MRP</th>
                                <th style="width: 100px; text-align: center;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.renderProductRows()}
                        </tbody>
                    </table>
                </div>

                <!-- TABLE FOOTER INFO -->
                <div class="product-table-footer-info">
                    <span>Showing ${this.getFilteredProducts().length} of ${this.products.length} products</span>
                    <span class="currency-indicator-pill">Standard Currency: <strong>INR (₹)</strong></span>
                </div>
            </div>

            <!-- SERIAL NUMBER DRAWER IF SELECTED -->
            ${this.renderSerialsDrawer()}

            <!-- MODAL CONTAINERS -->
            <div id="bulk-upload-modal-container"></div>
            <div id="serial-batch-modal-container"></div>
        </div>
        `;

        this.bindListEvents();
    }

    private getFilteredProducts(): ProductRecord[] {
        return this.products.filter(p => {
            const matchCat = this.categoryFilter === 'All' || p.category.toLowerCase() === this.categoryFilter.toLowerCase();
            const matchPlant = this.plantFilter === 'All' || (p.plant && p.plant.toUpperCase() === this.plantFilter.toUpperCase());
            const q = this.searchQuery.toLowerCase().trim();
            const matchSearch = !q ||
                p.sku.toLowerCase().includes(q) ||
                p.title.toLowerCase().includes(q) ||
                p.category.toLowerCase().includes(q) ||
                (p.plant && p.plant.toLowerCase().includes(q)) ||
                (p.group && p.group.toLowerCase().includes(q)) ||
                (p.color && p.color.toLowerCase().includes(q)) ||
                (p.warranty && p.warranty.toLowerCase().includes(q)) ||
                (p.description && p.description.toLowerCase().includes(q));
            return matchCat && matchPlant && matchSearch;
        });
    }

    private renderProductRows(): string {
        const filtered = this.getFilteredProducts();

        if (filtered.length === 0) {
            return `
            <tr>
                <td colspan="9" class="empty-product-state">
                    <div class="empty-product-state-wrap">
                        <div class="empty-icon">🔍</div>
                        <div class="empty-title">No products found</div>
                        <div class="empty-sub">Try searching with a different product code, plant, color, or category, or add a new product.</div>
                    </div>
                </td>
            </tr>`;
        }

        return filtered.map(p => {
            const isSelected = this.selectedProductId === p.id;
            const serialCount = this.serials.filter(s => s.productId === p.id).length;
            const dpFormatted = formatINR(p.dp);
            const mrpFormatted = formatINR(p.mrp || p.price);
            const plantCode = p.plant || 'KSPL';
            const colorCode = p.color || 'CP';
            const warrantyVal = p.warranty || '5 Years';

            return `
            <tr class="product-table-row ${isSelected ? 'row-active' : ''}" data-id="${p.id}">
                <td class="td-product-code">
                    <span class="product-code-text font-mono">${esc(p.sku)}</span>
                </td>
                <td class="td-product-name">
                    <div class="product-name-text">${esc(p.title)}</div>
                    ${p.description ? `<div class="product-sub-desc">${esc(p.description)}</div>` : ''}
                </td>
                <td class="td-category">
                    <span class="product-category-text">${esc(p.category.toLowerCase())}</span>
                </td>
                <td class="td-plant">
                    <span class="plant-badge plant-${plantCode.toLowerCase()}">${plantCode}</span>
                </td>
                <td class="td-color">
                    <span class="color-badge" title="Color: ${colorCode}">${colorCode}</span>
                </td>
                <td class="td-warranty">
                    <span class="warranty-badge" title="Warranty">${warrantyVal}</span>
                </td>
                <td class="td-dp" style="text-align: right;">
                    <span class="price-val font-tabular">${dpFormatted}</span>
                </td>
                <td class="td-mrp" style="text-align: right;">
                    <span class="price-val font-tabular">${mrpFormatted}</span>
                </td>
                <td class="td-actions" style="text-align: center;">
                    <div class="product-row-actions">
                        <button class="btn btn-icon btn-outline btn-quick-print-prod" data-id="${p.id}" title="Print QR Sticker Labels">
                            🖨️
                        </button>
                        <button class="btn btn-icon btn-outline btn-view-serials" data-id="${p.id}" title="View & Track Serials (${serialCount} units)">
                            🔢
                        </button>
                        <button class="btn btn-icon btn-outline btn-edit-product" data-id="${p.id}" title="Edit Product Data">
                            ✏️
                        </button>
                        <button class="btn btn-icon btn-outline btn-delete-product" data-id="${p.id}" title="Delete Product">
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>
            `;
        }).join('');
    }

    private renderSerialsDrawer(): string {
        if (!this.selectedProductId) return '';

        const product = this.products.find(p => p.id === this.selectedProductId);
        if (!product) return '';

        const productSerials = this.serials.filter(s => {
            if (s.productId !== product.id) return false;
            if (this.statusFilter !== 'All' && s.status !== this.statusFilter) return false;
            return true;
        });

        const selectedInDrawerCount = productSerials.filter(s => this.selectedSerialIds.has(s.id)).length;
        const allSelected = productSerials.length > 0 && selectedInDrawerCount === productSerials.length;

        return `
        <div class="manager-card-panel serial-drawer-panel" style="margin-top: 24px;">
            <div class="panel-header-row">
                <div>
                    <div class="drawer-back-row">
                        <button class="btn btn-icon btn-outline btn-close-drawer" title="Close Serial View">✕</button>
                        <h3 class="panel-heading">Tracking Serials: ${esc(product.title)}</h3>
                    </div>
                    <p class="panel-subheading">Product Code: ${product.sku} | Plant: ${product.plant || 'KSPL'} | Color: ${product.color || 'CP'} | Warranty: ${product.warranty || '5 Years'} | DP: ${formatINR(product.dp)} | MRP: ${formatINR(product.mrp)}</p>
                </div>
                <div class="panel-actions-group">
                    <button class="btn btn-primary btn-sm" id="btn-open-batch-gen-modal">
                        ⚡ Generate Serials
                    </button>
                </div>
            </div>

            <!-- SERIAL BATCH ACTIONS BAR -->
            <div class="serial-toolbar-row">
                <div class="checkbox-label-group">
                    <input type="checkbox" id="check-select-all-serials" ${allSelected ? 'checked' : ''} />
                    <label for="check-select-all-serials">Select All (${productSerials.length})</label>
                </div>
                <div class="filter-dropdown-wrapper">
                    <select id="serial-status-filter">
                        <option value="All" ${this.statusFilter === 'All' ? 'selected' : ''}>Status: All</option>
                        <option value="In Stock" ${this.statusFilter === 'In Stock' ? 'selected' : ''}>In Stock</option>
                        <option value="Quality Passed" ${this.statusFilter === 'Quality Passed' ? 'selected' : ''}>Quality Passed</option>
                        <option value="Dispatched" ${this.statusFilter === 'Dispatched' ? 'selected' : ''}>Dispatched</option>
                    </select>
                </div>
                <button class="btn btn-success btn-sm" id="btn-print-selected-serials" ${selectedInDrawerCount === 0 ? 'disabled' : ''}>
                    🖨️ Print Selected (${selectedInDrawerCount})
                </button>
            </div>

            <!-- SERIAL NUMBER LIST -->
            <div class="serials-list-scroll">
                ${productSerials.length === 0 ? `<div class="empty-drawer-msg">No serial numbers generated yet for ${product.sku}. Click <strong>Generate Serials</strong> to create a batch!</div>` : ''}
                ${productSerials.map(s => {
                    const isChecked = this.selectedSerialIds.has(s.id);
                    return `
                    <div class="serial-item-card ${isChecked ? 'item-selected' : ''}" data-id="${s.id}">
                        <div class="serial-card-left">
                            <input type="checkbox" class="serial-check-box" data-id="${s.id}" ${isChecked ? 'checked' : ''} />
                            <div>
                                <div class="serial-code-text">🏷️ ${esc(s.serialNumber)}</div>
                                <div class="serial-meta-sub">
                                    <span>Created: ${new Date(s.createdAt).toLocaleDateString()}</span>
                                    <span>•</span>
                                    <span>Plant: ${s.plant || product.plant || 'KSPL'}</span>
                                    <span>•</span>
                                    <span>Color: ${s.color || product.color || 'CP'}</span>
                                    <span>•</span>
                                    <span class="status-badge status-${s.status.toLowerCase().replace(/\s+/g, '-')}">${s.status}</span>
                                    ${s.lastPrintedAt ? `<span class="printed-badge">Printed ${s.printCount}x</span>` : `<span class="not-printed-badge">Unprinted</span>`}
                                </div>
                            </div>
                        </div>

                        <div class="serial-card-right">
                            <div class="serial-var-tags">
                                <span class="serial-var-tag"><strong>DP:</strong> ${formatINR(product.dp)}</span>
                                <span class="serial-var-tag"><strong>MRP:</strong> ${formatINR(product.mrp)}</span>
                                ${Object.entries(s.variables).map(([k, v]) => `
                                    <span class="serial-var-tag"><strong>${k}:</strong> ${v}</span>
                                `).join('')}
                            </div>
                            <button class="btn btn-icon btn-sm btn-outline btn-delete-single-serial" data-id="${s.id}" title="Delete this serial unit">
                                🗑️
                            </button>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        </div>
        `;
    }

    private bindListEvents() {
        // Search & Filter
        const searchInput = this.container.querySelector<HTMLInputElement>('#product-search-input');
        searchInput?.addEventListener('input', (e) => {
            this.searchQuery = (e.target as HTMLInputElement).value;
            this.updateTableOnly();
        });

        this.container.querySelector('#btn-clear-search')?.addEventListener('click', () => {
            this.searchQuery = '';
            this.updateTableOnly();
        });

        this.container.querySelector<HTMLSelectElement>('#product-category-filter')?.addEventListener('change', (e) => {
            this.categoryFilter = (e.target as HTMLSelectElement).value;
            this.updateTableOnly();
        });

        this.container.querySelector<HTMLSelectElement>('#product-plant-filter')?.addEventListener('change', (e) => {
            this.plantFilter = (e.target as HTMLSelectElement).value;
            this.updateTableOnly();
        });

        // Top Header Actions
        this.container.querySelector('#btn-add-new-product')?.addEventListener('click', () => {
            this.currentMode = 'add';
            this.editingProductId = null;
            this.render();
        });

        this.container.querySelector('#btn-download-template')?.addEventListener('click', () => {
            this.downloadSampleCSVTemplate();
        });

        this.container.querySelector('#btn-bulk-upload-csv')?.addEventListener('click', () => {
            this.openBulkUploadModal();
        });

        this.container.querySelector('#btn-download-report')?.addEventListener('click', () => {
            this.downloadProductReport();
        });

        // Row Actions
        this.container.querySelectorAll<HTMLButtonElement>('.btn-view-serials').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLButtonElement).dataset.id;
                if (id) {
                    this.selectedProductId = this.selectedProductId === id ? null : id;
                    this.selectedSerialIds.clear();
                    this.render();
                }
            });
        });

        this.container.querySelectorAll<HTMLButtonElement>('.btn-edit-product').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLButtonElement).dataset.id;
                if (id) {
                    this.currentMode = 'edit';
                    this.editingProductId = id;
                    this.render();
                }
            });
        });

        this.container.querySelectorAll<HTMLButtonElement>('.btn-delete-product').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLButtonElement).dataset.id;
                const prod = this.products.find(p => p.id === id);
                if (id && prod && confirm(`Are you sure you want to delete product "${prod.title}" (${prod.sku})?`)) {
                    this.products = this.products.filter(p => p.id !== id);
                    this.serials = this.serials.filter(s => s.productId !== id);
                    if (this.selectedProductId === id) this.selectedProductId = null;
                    this.saveProductsToStorage();
                    this.saveSerialsToStorage();
                    void supabaseService.deleteProduct(id);
                    this.render();
                }
            });
        });

        this.container.querySelectorAll<HTMLButtonElement>('.btn-quick-print-prod').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLButtonElement).dataset.id;
                const prod = this.products.find(p => p.id === id);
                if (prod) this.triggerProductBatchPrint(prod);
            });
        });

        // Drawer Close
        this.container.querySelector('.btn-close-drawer')?.addEventListener('click', () => {
            this.selectedProductId = null;
            this.render();
        });

        // Batch Generate Modal
        this.container.querySelector('#btn-open-batch-gen-modal')?.addEventListener('click', () => {
            if (this.selectedProductId) {
                const product = this.products.find(p => p.id === this.selectedProductId);
                if (product) this.openBatchSerialModal(product);
            }
        });

        // Drawer Status filter
        this.container.querySelector<HTMLSelectElement>('#serial-status-filter')?.addEventListener('change', (e) => {
            this.statusFilter = (e.target as HTMLSelectElement).value;
            this.render();
        });

        // Select all serials checkbox
        this.container.querySelector<HTMLInputElement>('#check-select-all-serials')?.addEventListener('change', (e) => {
            const checked = (e.target as HTMLInputElement).checked;
            if (this.selectedProductId) {
                const productSerials = this.serials.filter(s => s.productId === this.selectedProductId);
                if (checked) {
                    productSerials.forEach(s => this.selectedSerialIds.add(s.id));
                } else {
                    this.selectedSerialIds.clear();
                }
                this.render();
            }
        });

        // Single serial check
        this.container.querySelectorAll<HTMLInputElement>('.serial-check-box').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = (e.currentTarget as HTMLInputElement).dataset.id;
                if (id) {
                    if ((e.currentTarget as HTMLInputElement).checked) {
                        this.selectedSerialIds.add(id);
                    } else {
                        this.selectedSerialIds.delete(id);
                    }
                    this.render();
                }
            });
        });

        // Delete single serial
        this.container.querySelectorAll<HTMLButtonElement>('.btn-delete-single-serial').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLButtonElement).dataset.id;
                if (id) {
                    this.serials = this.serials.filter(s => s.id !== id);
                    this.selectedSerialIds.delete(id);
                    this.saveSerialsToStorage();
                    void supabaseService.deleteSerial(id);
                    this.render();
                }
            });
        });

        // Print Selected Serials Button
        this.container.querySelector('#btn-print-selected-serials')?.addEventListener('click', () => {
            if (this.selectedProductId) {
                const product = this.products.find(p => p.id === this.selectedProductId);
                if (product) {
                    const selectedUnits = this.serials.filter(s => this.selectedSerialIds.has(s.id));
                    if (selectedUnits.length > 0) {
                        this.triggerSerializedUnitsPrint(product, selectedUnits);
                    }
                }
            }
        });
    }

    private updateTableOnly() {
        const tbody = this.container.querySelector('.product-clean-table tbody');
        if (tbody) {
            tbody.innerHTML = this.renderProductRows();
            this.bindListEvents();
        }
        const countInfo = this.container.querySelector('.product-table-footer-info span:first-child');
        if (countInfo) {
            countInfo.textContent = `Showing ${this.getFilteredProducts().length} of ${this.products.length} products`;
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. DEDICATED ADD / EDIT NEW PRODUCT PAGE (EXACT REQUESTED FIELD ORDER)
    // ──────────────────────────────────────────────────────────────────────────
    private renderAddEditPage() {
        const isEdit = this.currentMode === 'edit' && !!this.editingProductId;
        const existing = isEdit ? this.products.find(p => p.id === this.editingProductId) : undefined;

        const globalVars = getMasterData('variable').map(o => ({ key: o.code, label: o.label, defaultValue: o.defaultValue }));
        const initialVars = existing ? existing.variables : (globalVars.length ? globalVars : [
            { key: 'batchNo', label: 'Batch / Lot #', defaultValue: 'BATCH-01' },
            { key: 'mfgDate', label: 'Mfg Date', defaultValue: new Date().toISOString().split('T')[0] }
        ]);

        const existingCategory = existing?.category || '';
        const existingPlant = existing?.plant || '';
        const existingGroup = existing?.group || '';
        const existingColor = existing?.color || '';
        const existingWarranty = existing?.warranty || '';

        const plants = getMasterData('plant');
        const categories = getMasterData('category');
        const groups = getMasterData('group');
        const colors = getMasterData('color');
        const warranties = getMasterData('warranty');

        this.container.innerHTML = `
        <div class="product-master-root add-product-view-root">
            <!-- BACK BREADCRUMB / TOP ACTION BAR -->
            <div class="add-product-top-bar">
                <button class="btn btn-outline btn-sm btn-back-products" id="btn-back-to-products-top">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                    <span>Back to Products</span>
                </button>
            </div>

            <!-- PAGE TITLE -->
            <div class="add-product-header-section">
                <h1 class="add-product-main-title">${isEdit ? 'Edit Product' : 'Add New Product'}</h1>
                <p class="add-product-main-sub">Enter the details of the new product.</p>
            </div>

            <!-- MAIN FORM CARD CONTAINER -->
            <div class="add-product-form-card">
                <div class="add-product-card-header">
                    <h2 class="add-product-card-title">Product Information</h2>
                    <p class="add-product-card-sub">Fill out the form to add a new product. Inventory is managed separately.</p>
                </div>

                <form id="form-add-product-master" class="add-product-form-content">
                    <!-- ROW 1: PRODUCT CODE FIRST (SKU UNIQUE), THEN PRODUCT NAME -->
                    <div class="form-grid-2col">
                        <div class="form-field-group">
                            <label class="form-field-label">Product Code * <span style="font-weight:400; color:var(--ink-muted); font-size:0.75rem;">(Unique SKU / Identifier)</span></label>
                            <input type="text" name="sku" class="form-control-input font-mono" required placeholder="e.g. KA570027-RG / AR-V3" value="${existing ? existing.sku : ''}" />
                        </div>

                        <div class="form-field-group">
                            <label class="form-field-label">Product Name *</label>
                            <input type="text" name="title" class="form-control-input" required placeholder="e.g. CeilingShower400mmx400mm(BrassRG)" value="${existing ? existing.title : ''}" />
                        </div>
                    </div>

                    <!-- ROW 2: PRODUCT CATEGORY, THEN PLANT, THEN PRODUCT GROUP -->
                    <div class="form-grid-3col">
                        <div class="form-field-group">
                            <label class="form-field-label">Product Category *</label>
                            <select name="category" class="form-control-select" required>
                                <option value="" ${!existingCategory ? 'selected' : ''}>Select a category</option>
                                ${categories.map(o => `
                                    <option value="${o.code}" ${existingCategory === o.code ? 'selected' : ''}>${o.label}</option>
                                `).join('')}
                            </select>
                        </div>

                        <div class="form-field-group">
                            <label class="form-field-label">Plant *</label>
                            <select name="plant" id="input-plant" class="form-control-select" required>
                                <option value="" ${!existingPlant ? 'selected' : ''}>Select a plant</option>
                                ${plants.map(o => `
                                    <option value="${o.code}" ${existingPlant === o.code ? 'selected' : ''}>${o.label}</option>
                                `).join('')}
                            </select>
                        </div>

                        <div class="form-field-group">
                            <label class="form-field-label">Product Group</label>
                            <select name="group" class="form-control-select">
                                <option value="" ${!existingGroup ? 'selected' : ''}>Select a group</option>
                                ${groups.map(o => `
                                    <option value="${o.code}" ${existingGroup === o.code ? 'selected' : ''}>${o.label}</option>
                                `).join('')}
                            </select>
                        </div>
                    </div>

                    <!-- ROW 3: COLOR & WARRANTY DROPDOWNS -->
                    <div class="form-grid-2col">
                        <div class="form-field-group">
                            <label class="form-field-label">Color / Finish</label>
                            <select name="color" class="form-control-select">
                                <option value="" ${!existingColor ? 'selected' : ''}>Select color</option>
                                ${colors.map(c => `
                                    <option value="${c.code}" ${existingColor === c.code ? 'selected' : ''}>${c.label}</option>
                                `).join('')}
                            </select>
                        </div>

                        <div class="form-field-group">
                            <label class="form-field-label">Warranty (Years)</label>
                            <select name="warranty" class="form-control-select">
                                <option value="" ${!existingWarranty ? 'selected' : ''}>Select warranty</option>
                                ${warranties.map(w => `
                                    <option value="${w.code}" ${existingWarranty === w.code ? 'selected' : ''}>${w.label}</option>
                                `).join('')}
                            </select>
                        </div>
                    </div>

                    <!-- ROW 4: DISTRIBUTOR PRICE (DP) & MAXIMUM RETAIL PRICE (MRP) -->
                    <div class="form-grid-2col">
                        <div class="form-field-group">
                            <label class="form-field-label">Distributor Price (DP in ₹) *</label>
                            <div class="inr-input-container">
                                <span class="inr-symbol">₹</span>
                                <input type="number" step="0.01" min="0" name="dp" id="input-page-dp" class="form-control-input inr-field" required placeholder="0" value="${existing ? parseINRValue(existing.dp) : '0'}" />
                            </div>
                            <span class="inr-preview-text" id="preview-page-dp">${existing ? formatINR(existing.dp) : '₹0.00'}</span>
                        </div>

                        <div class="form-field-group">
                            <label class="form-field-label">Maximum Retail Price (MRP in ₹) *</label>
                            <div class="inr-input-container">
                                <span class="inr-symbol">₹</span>
                                <input type="number" step="0.01" min="0" name="mrp" id="input-page-mrp" class="form-control-input inr-field" required placeholder="0" value="${existing ? parseINRValue(existing.mrp || existing.price) : '0'}" />
                            </div>
                            <span class="inr-preview-text" id="preview-page-mrp">${existing ? formatINR(existing.mrp || existing.price) : '₹0.00'}</span>
                        </div>
                    </div>

                    <!-- ROW 5: DESCRIPTION / SPECIFICATIONS -->
                    <div class="form-field-group col-full">
                        <label class="form-field-label">Description / Specifications</label>
                        <textarea name="description" class="form-control-textarea" rows="2" placeholder="Item specifications, material, dimensions, package contents...">${existing ? existing.description : ''}</textarea>
                    </div>

                    <!-- Serial numbering (prefix / sequence / padding) is derived from the selected Plant's master data settings -->

                    <!-- ROW 7: DYNAMIC VARIABLES SECTION -->
                    <div class="dynamic-variables-card-section">
                        <div class="vars-section-header">
                            <div>
                                <h3 class="vars-section-title">Dynamic Product Variables & Label Tags</h3>
                                <p class="vars-section-sub">Configured variables are used in sticker label templates (e.g. <code>{{color}}</code>, <code>{{warranty}}</code>, <code>{{plant}}</code>, <code>{{dp}}</code>, <code>{{mrp}}</code>).</p>
                            </div>
                            <button type="button" class="btn btn-outline btn-xs" id="btn-add-page-var">➕ Add Variable</button>
                        </div>

                        <div id="page-vars-list" class="vars-inputs-list">
                            ${initialVars.map((v, i) => `
                                <div class="var-input-row" data-index="${i}">
                                    <input type="text" class="input-var-key" placeholder="Key (e.g. batchNo)" value="${esc(v.key)}" required />
                                    <input type="text" class="input-var-label" placeholder="Display Label (e.g. Batch / Lot #)" value="${esc(v.label)}" required />
                                    <input type="text" class="input-var-default" placeholder="Default Value" value="${esc(v.defaultValue || '')}" />
                                    <button type="button" class="btn btn-icon btn-sm btn-remove-var" title="Remove variable">✕</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- FORM FOOTER BUTTON (PURPLE SAVE PRODUCT BUTTON) -->
                    <div class="add-product-actions-bar">
                        <button type="button" class="btn-save-product-purple" id="btn-submit-save-product">
                            Save Product
                        </button>
                        <button type="button" class="btn btn-outline" id="btn-cancel-add-product" style="padding: 10px 20px; font-size: 0.875rem;">
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
        `;

        this.bindAddEditEvents(existing);
    }

    private bindAddEditEvents(existing?: ProductRecord) {
        const isEdit = !!existing;

        // Back buttons
        const goBack = () => {
            this.currentMode = 'list';
            this.editingProductId = null;
            this.render();
        };

        this.container.querySelector('#btn-back-to-products-top')?.addEventListener('click', goBack);
        this.container.querySelector('#btn-cancel-add-product')?.addEventListener('click', goBack);

        // Live INR Preview
        const dpInput = this.container.querySelector<HTMLInputElement>('#input-page-dp');
        const mrpInput = this.container.querySelector<HTMLInputElement>('#input-page-mrp');
        const dpPreview = this.container.querySelector('#preview-page-dp');
        const mrpPreview = this.container.querySelector('#preview-page-mrp');

        dpInput?.addEventListener('input', () => {
            if (dpPreview) dpPreview.textContent = formatINR(dpInput.value);
        });

        mrpInput?.addEventListener('input', () => {
            if (mrpPreview) mrpPreview.textContent = formatINR(mrpInput.value);
        });

        // Dynamic Variables add / remove
        this.container.querySelector('#btn-add-page-var')?.addEventListener('click', () => {
            const list = this.container.querySelector('#page-vars-list');
            if (list) {
                const newRow = document.createElement('div');
                newRow.className = 'var-input-row';
                newRow.innerHTML = `
                    <input type="text" class="input-var-key" placeholder="Key (e.g. grade)" required />
                    <input type="text" class="input-var-label" placeholder="Display Label (e.g. Grade)" required />
                    <input type="text" class="input-var-default" placeholder="Default Value" />
                    <button type="button" class="btn btn-icon btn-sm btn-remove-var" title="Remove variable">✕</button>
                `;
                list.appendChild(newRow);
                newRow.querySelector('.btn-remove-var')?.addEventListener('click', () => newRow.remove());
            }
        });

        this.container.querySelectorAll('.btn-remove-var').forEach(b => {
            b.addEventListener('click', (e) => {
                (e.currentTarget as HTMLElement).closest('.var-input-row')?.remove();
            });
        });

        // Plant selection — serial numbering is derived from plant master data at generation time

        // Submit Save Product
        this.container.querySelector('#btn-submit-save-product')?.addEventListener('click', () => {
            const form = this.container.querySelector('#form-add-product-master') as HTMLFormElement;
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }

            const formData = new FormData(form);
            const varRows = this.container.querySelectorAll('.var-input-row');
            const variables: ProductVariable[] = [];
            const defaultVariables: Record<string, string> = {};

            varRows.forEach(row => {
                const key = (row.querySelector('.input-var-key') as HTMLInputElement).value.trim();
                const label = (row.querySelector('.input-var-label') as HTMLInputElement).value.trim();
                const defaultValue = (row.querySelector('.input-var-default') as HTMLInputElement).value.trim();
                if (key) {
                    variables.push({ key, label: label || key, defaultValue });
                    defaultVariables[key] = defaultValue;
                }
            });

            const skuVal = (formData.get('sku') as string).trim();
            const titleVal = (formData.get('title') as string).trim();
            const categoryVal = (formData.get('category') as string).trim() || 'faucet';
            const plantVal = (formData.get('plant') as string).trim() || 'KSPL';
            const groupVal = (formData.get('group') as string).trim() || 'Bathware';
            const colorVal = (formData.get('color') as string).trim() || 'CP';
            const warrantyVal = (formData.get('warranty') as string).trim() || '5 Years';
            const dpVal = parseINRValue(formData.get('dp'));
            const mrpVal = parseINRValue(formData.get('mrp'));

            if (isEdit && existing) {
                existing.sku = skuVal;
                existing.title = titleVal;
                existing.category = categoryVal;
                existing.plant = plantVal;
                existing.group = groupVal;
                existing.color = colorVal;
                existing.warranty = warrantyVal;
                existing.dp = dpVal;
                existing.mrp = mrpVal;
                existing.price = formatINR(mrpVal);
                existing.origPrice = formatINR(mrpVal);
                existing.serialPrefix = existing.serialPrefix || `${plantVal}-` || 'SN-';
                existing.nextSerialSequence = existing.nextSerialSequence || 1001;
                existing.serialPadding = existing.serialPadding || 5;
                existing.description = (formData.get('description') as string).trim();
                existing.variables = variables;
                existing.defaultVariables = defaultVariables;
                void supabaseService.saveProduct(existing);
            } else {
                const newProduct: ProductRecord = {
                    id: `prod-${Date.now()}`,
                    sku: skuVal,
                    title: titleVal,
                    category: categoryVal,
                    plant: plantVal,
                    group: groupVal,
                    color: colorVal,
                    warranty: warrantyVal,
                    dp: dpVal,
                    mrp: mrpVal,
                    price: formatINR(mrpVal),
                    origPrice: formatINR(mrpVal),
                    serialPrefix: `${plantVal}-` || 'SN-',
                    nextSerialSequence: 1001,
                    serialPadding: 5,
                    description: (formData.get('description') as string).trim(),
                    variables,
                    defaultVariables,
                    createdAt: new Date().toISOString()
                };
                this.products.unshift(newProduct);
                this.selectedProductId = newProduct.id;
                void supabaseService.saveProduct(newProduct);
            }

            this.saveProductsToStorage();
            this.currentMode = 'list';
            this.editingProductId = null;
            this.render();
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ──────────────────────────────────────────────────────────────────────────
    // 3. BULK CSV UPLOAD & PARSER WITH LIVE PREVIEW
    // ──────────────────────────────────────────────────────────────────────────
    private openBulkUploadModal() {
        const modalContainer = this.container.querySelector('#bulk-upload-modal-container');
        if (!modalContainer) return;

        const masterPlants = getMasterData('plant').map(p => p.code).join(', ') || 'KSPL, KGPL, KBPL';
        const masterColors = getMasterData('color').map(c => c.code).join(', ') || 'CP, RG, MB, W, GM, CG';

        modalContainer.innerHTML = `
        <div class="studio-modal-backdrop">
            <div class="studio-modal-dialog bulk-upload-dialog" style="max-width: 960px;">
                <div class="modal-header">
                    <div>
                        <h3 class="modal-title">📥 Bulk Upload Products (CSV)</h3>
                        <p style="font-size: 0.75rem; color: var(--ink-muted); margin: 2px 0 0 0;">Upload multiple products at once with Product Code, Category, Plant (${masterPlants}), Group, Color (${masterColors}), Warranty, DP, and MRP.</p>
                    </div>
                    <button class="btn btn-icon btn-close-modal">✕</button>
                </div>

                <div class="modal-body-scroll">
                    <!-- DROP ZONE / FILE SELECTOR -->
                    <div class="csv-upload-dropzone" id="csv-dropzone">
                        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        <div class="dropzone-title">Drag and drop your <strong>.CSV</strong> file here, or click to browse</div>
                        <div class="dropzone-sub">Supported columns: <code>Product Code</code>, <code>Product Name</code>, <code>Category</code>, <code>Plant</code>, <code>Group</code>, <code>Color</code>, <code>Warranty</code>, <code>DP</code>, <code>MRP</code>, <code>Description</code></div>
                        <input type="file" id="input-bulk-csv-file" accept=".csv,text/csv" style="display:none;" />
                        <div style="margin-top: 12px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                            <button type="button" class="btn btn-primary btn-sm" id="btn-browse-csv-file">📂 Browse File</button>
                            <button type="button" class="btn btn-outline btn-sm" id="btn-modal-dl-template">📥 Download Sample CSV Template</button>
                        </div>
                    </div>

                    <!-- PREVIEW CONTAINER (HIDDEN UNTIL FILE LOADED) -->
                    <div id="csv-preview-section" style="display: none; margin-top: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                            <div>
                                <h4 style="font-size: 0.875rem; font-weight: 700; margin: 0; color: var(--ink);" id="csv-preview-heading">Parsed Products Preview</h4>
                                <span style="font-size: 0.72rem; color: var(--ink-muted);" id="csv-preview-sub">Review columns and mapped specifications before importing.</span>
                            </div>
                            <div class="csv-import-mode-select" style="display: flex; align-items: center; gap: 6px;">
                                <label style="font-size: 0.75rem; font-weight: 600; color: var(--ink-muted);">Import Mode:</label>
                                <select id="csv-import-mode" style="padding: 4px 10px; font-size: 0.75rem; border-radius: 6px; border: 1px solid var(--line); background: var(--surface);">
                                    <option value="append" selected>Append / Update existing by SKU (Recommended)</option>
                                    <option value="replace">Replace entire catalog</option>
                                </select>
                            </div>
                        </div>

                        <div class="table-responsive-container" style="max-height: 320px; overflow-y: auto; border: 1px solid var(--line); border-radius: 8px;">
                            <table class="product-clean-table" style="font-size: 0.75rem;">
                                <thead>
                                    <tr>
                                        <th style="width: 32px;">#</th>
                                        <th>Product Code</th>
                                        <th>Product Name</th>
                                        <th>Category</th>
                                        <th>Plant</th>
                                        <th>Color</th>
                                        <th>Warranty</th>
                                        <th style="text-align: right;">DP (₹)</th>
                                        <th style="text-align: right;">MRP (₹)</th>
                                        <th style="text-align: center;">Status</th>
                                    </tr>
                                </thead>
                                <tbody id="csv-preview-tbody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="modal-footer">
                    <button class="btn btn-outline btn-close-modal">Cancel</button>
                    <button class="btn btn-primary" id="btn-confirm-import-csv" disabled>
                        Import Products
                    </button>
                </div>
            </div>
        </div>
        `;

        const closeModal = () => { modalContainer.innerHTML = ''; };
        modalContainer.querySelectorAll('.btn-close-modal').forEach(b => b.addEventListener('click', closeModal));

        modalContainer.querySelector('#btn-modal-dl-template')?.addEventListener('click', () => {
            this.downloadSampleCSVTemplate();
        });

        const fileInput = modalContainer.querySelector<HTMLInputElement>('#input-bulk-csv-file');
        const dropzone = modalContainer.querySelector('#csv-dropzone');

        modalContainer.querySelector('#btn-browse-csv-file')?.addEventListener('click', () => {
            fileInput?.click();
        });

        dropzone?.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dropzone-active');
        });

        dropzone?.addEventListener('dragleave', () => {
            dropzone.classList.remove('dropzone-active');
        });

        dropzone?.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dropzone-active');
            const files = (e as DragEvent).dataTransfer?.files;
            if (files && files.length > 0) {
                this.processUploadedCSV(files[0]);
            }
        });

        fileInput?.addEventListener('change', (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files && files.length > 0) {
                this.processUploadedCSV(files[0]);
            }
        });
    }

    private processUploadedCSV(file: File) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            if (!content) return;

            const parsedProducts = this.parseCSVText(content);
            this.renderCSVPreview(parsedProducts);
        };
        reader.readAsText(file);
    }

    private parseCSVText(csv: string): ProductRecord[] {
        const lines = csv.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (lines.length === 0) return [];

        const rawHeaders = this.parseCSVLine(lines[0]);
        const headers = rawHeaders.map(h => h.toLowerCase().trim());

        const masterPlants = getMasterData('plant');
        const masterCategories = getMasterData('category');
        const masterColors = getMasterData('color');
        const masterWarranties = getMasterData('warranty');

        // Column Index Mapping
        const codeIdx = headers.findIndex(h => h.includes('code') || h.includes('sku') || h.includes('item') || h === 'id');
        const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('title') || h === 'product');
        const catIdx = headers.findIndex(h => h.includes('cat') || h.includes('category') || h === 'type');
        const plantIdx = headers.findIndex(h => h.includes('plant') || h.includes('factory') || h.includes('unit') || h.includes('location'));
        const groupIdx = headers.findIndex(h => h.includes('group') || h.includes('division') || h.includes('dept') || h.includes('subcat'));
        const colorIdx = headers.findIndex(h => h.includes('color') || h.includes('colour') || h.includes('finish') || h.includes('shade'));
        const warrantyIdx = headers.findIndex(h => h.includes('warranty') || h.includes('guarantee'));
        const dpIdx = headers.findIndex(h => h === 'dp' || h.includes('dealer') || h.includes('distributor') || h.includes('cost') || h === 'dealer price' || h === 'distributor price');
        const mrpIdx = headers.findIndex(h => h === 'mrp' || h.includes('retail') || h.includes('price') || h.includes('rate') || h === 'mrp price' || h === 'selling price');
        const descIdx = headers.findIndex(h => h.includes('desc') || h.includes('note') || h.includes('spec') || h.includes('detail'));

        const knownIndices = new Set([codeIdx, nameIdx, catIdx, plantIdx, groupIdx, colorIdx, warrantyIdx, dpIdx, mrpIdx, descIdx]);

        const results: ProductRecord[] = [];

        for (let i = 1; i < lines.length; i++) {
            const cols = this.parseCSVLine(lines[i]);
            if (cols.length === 0 || cols.every(c => c.trim() === '')) continue;

            // 1. SKU / Product Code
            const rawSku = codeIdx !== -1 && cols[codeIdx] ? cols[codeIdx].trim() : '';
            const sku = rawSku || `ITEM-${String(i).padStart(4, '0')}`;

            // 2. Product Name / Title
            const rawTitle = nameIdx !== -1 && cols[nameIdx] ? cols[nameIdx].trim() : '';
            const title = rawTitle || `Product ${sku}`;

            // 3. Category Resolution
            const rawCat = catIdx !== -1 && cols[catIdx] ? cols[catIdx].trim() : '';
            let category = 'faucet';
            if (rawCat) {
                const matchCat = masterCategories.find(c =>
                    c.code.toLowerCase() === rawCat.toLowerCase() ||
                    c.label.toLowerCase().includes(rawCat.toLowerCase())
                );
                category = matchCat ? matchCat.code : rawCat.toLowerCase();
            }

            // 4. Plant Resolution
            const rawPlant = plantIdx !== -1 && cols[plantIdx] ? cols[plantIdx].trim().toUpperCase() : 'KSPL';
            const matchedPlantObj = masterPlants.find(p =>
                p.code.toUpperCase() === rawPlant ||
                p.label.toUpperCase() === rawPlant ||
                (p.plantCode && p.plantCode === rawPlant)
            ) || masterPlants[0];
            const plant = matchedPlantObj ? matchedPlantObj.code : (rawPlant || 'KSPL');

            // 5. Product Group
            const rawGroup = groupIdx !== -1 && cols[groupIdx] ? cols[groupIdx].trim() : '';
            const group = rawGroup || 'Bathware';

            // 6. Color Code Resolution
            const rawColor = colorIdx !== -1 && cols[colorIdx] ? cols[colorIdx].trim() : 'CP';
            let color = rawColor.toUpperCase();
            const matchedColorObj = masterColors.find(c =>
                c.code.toUpperCase() === color ||
                c.label.toUpperCase().includes(rawColor.toUpperCase())
            );
            if (matchedColorObj) color = matchedColorObj.code;

            // 7. Warranty Resolution
            const rawWarranty = warrantyIdx !== -1 && cols[warrantyIdx] ? cols[warrantyIdx].trim() : '5 Years';
            let warranty = rawWarranty;
            if (/^\d+$/.test(warranty)) {
                warranty = `${warranty} ${warranty === '1' ? 'Year' : 'Years'}`;
            } else if (/^\d+\s*yr/i.test(warranty)) {
                const num = warranty.match(/\d+/)?.[0] || '5';
                warranty = `${num} ${num === '1' ? 'Year' : 'Years'}`;
            }

            // 8. DP & MRP
            const dpRaw = dpIdx !== -1 && cols[dpIdx] ? cols[dpIdx] : '0';
            const mrpRaw = mrpIdx !== -1 && cols[mrpIdx] ? cols[mrpIdx] : dpRaw;
            const dp = parseINRValue(dpRaw);
            const mrp = parseINRValue(mrpRaw) || dp;

            // 9. Description
            const description = descIdx !== -1 && cols[descIdx] ? cols[descIdx].trim() : '';

            // 10. Serial numbering fallback
            const serialPrefix = `${plant}-` || 'SN-';
            const nextSerialSequence = 1001;
            const serialPadding = 5;

            // 11. Dynamic variables & extra CSV columns
            const variables: ProductVariable[] = [
                { key: 'color', label: 'Color / Finish', defaultValue: color },
                { key: 'warranty', label: 'Warranty Period', defaultValue: warranty },
                { key: 'plant', label: 'Manufacturing Plant', defaultValue: plant },
                { key: 'batchNo', label: 'Batch No', defaultValue: 'BATCH-01' },
                { key: 'mfgDate', label: 'Mfg Date', defaultValue: new Date().toISOString().split('T')[0] }
            ];

            const defaultVariables: Record<string, string> = {
                color,
                warranty,
                plant,
                batchNo: 'BATCH-01',
                mfgDate: new Date().toISOString().split('T')[0]
            };

            // Capture any extra unmapped columns from the CSV
            for (let c = 0; c < cols.length; c++) {
                if (!knownIndices.has(c) && rawHeaders[c]) {
                    const colHeader = rawHeaders[c].trim();
                    const colVal = (cols[c] || '').trim();
                    const key = colHeader.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                    if (key && !defaultVariables[key]) {
                        variables.push({ key, label: colHeader, defaultValue: colVal });
                        defaultVariables[key] = colVal;
                    }
                }
            }

            results.push({
                id: `prod-csv-${Date.now()}-${i}`,
                sku,
                title,
                category,
                plant,
                group,
                color,
                warranty,
                dp,
                mrp,
                price: formatINR(mrp),
                origPrice: formatINR(mrp),
                description,
                serialPrefix,
                nextSerialSequence,
                serialPadding,
                variables,
                defaultVariables,
                createdAt: new Date().toISOString()
            });
        }

        return results;
    }

    private parseCSVLine(text: string): string[] {
        const result: string[] = [];
        let cur = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '"') {
                if (inQuotes && text[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(cur);
                cur = '';
            } else {
                cur += char;
            }
        }
        result.push(cur);
        return result;
    }

    private renderCSVPreview(parsed: ProductRecord[]) {
        const previewSection = this.container.querySelector('#csv-preview-section') as HTMLElement;
        const tbody = this.container.querySelector('#csv-preview-tbody');
        const heading = this.container.querySelector('#csv-preview-heading');
        const subHeading = this.container.querySelector('#csv-preview-sub');
        const confirmBtn = this.container.querySelector('#btn-confirm-import-csv') as HTMLButtonElement;

        if (!previewSection || !tbody || !confirmBtn) return;

        if (parsed.length === 0) {
            alert('No valid product rows could be detected in this CSV file. Please check that the file is not empty and has valid headers.');
            return;
        }

        previewSection.style.display = 'block';
        if (heading) heading.textContent = `Parsed ${parsed.length} Products from CSV`;
        if (subHeading) subHeading.textContent = `All rows validated. Ready to sync with local catalog and Supabase database.`;

        tbody.innerHTML = parsed.map((p, idx) => {
            const existing = this.products.find(x => x.sku.toLowerCase() === p.sku.toLowerCase());
            const statusBadge = existing
                ? `<span class="nav-item-badge badge-amber" style="font-size: 0.65rem;" title="Will update existing product with SKU ${p.sku}">Update</span>`
                : `<span class="nav-item-badge badge-emerald" style="font-size: 0.65rem;" title="New product">New</span>`;

            return `
            <tr>
                <td>${idx + 1}</td>
                <td><strong class="font-mono" style="color: var(--accent);">${esc(p.sku)}</strong></td>
                <td>${esc(p.title)}</td>
                <td><span class="category-chip" style="font-size: 0.65rem;">${esc(p.category)}</span></td>
                <td><span class="plant-badge plant-${(p.plant || 'KSPL').toLowerCase()}" style="font-size: 0.65rem;">${esc(p.plant || 'KSPL')}</span></td>
                <td><span class="color-badge" style="font-size: 0.65rem;">${p.color || 'CP'}</span></td>
                <td><span class="warranty-badge" style="font-size: 0.65rem;">${p.warranty || '5 Years'}</span></td>
                <td style="text-align: right;">${formatINR(p.dp)}</td>
                <td style="text-align: right; font-weight: 700;">${formatINR(p.mrp)}</td>
                <td style="text-align: center;">${statusBadge}</td>
            </tr>
            `;
        }).join('');

        confirmBtn.disabled = false;
        confirmBtn.textContent = `🚀 Import ${parsed.length} Products`;

        confirmBtn.onclick = async () => {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Importing & Syncing...';

            const modeSelect = this.container.querySelector<HTMLSelectElement>('#csv-import-mode');
            const mode = modeSelect?.value || 'append';

            let newCount = 0;
            let updateCount = 0;

            if (mode === 'replace') {
                this.products = parsed;
                newCount = parsed.length;
            } else {
                parsed.forEach(newItem => {
                    const existingIdx = this.products.findIndex(x => x.sku.toLowerCase() === newItem.sku.toLowerCase());
                    if (existingIdx >= 0) {
                        // Preserve original id & created date for clean Supabase upsert
                        newItem.id = this.products[existingIdx].id;
                        newItem.createdAt = this.products[existingIdx].createdAt || newItem.createdAt;
                        this.products[existingIdx] = newItem;
                        updateCount++;
                    } else {
                        this.products.push(newItem);
                        newCount++;
                    }
                });
            }

            // Save locally
            this.saveProductsToStorage();

            // Sync to Supabase in bulk
            try {
                await supabaseService.saveProductsBulk(this.products);
            } catch (err) {
                console.warn('Supabase bulk sync notice:', err);
            }

            const modalContainer = this.container.querySelector('#bulk-upload-modal-container');
            if (modalContainer) modalContainer.innerHTML = '';
            this.render();

            const message = mode === 'replace'
                ? `✅ Successfully replaced catalog with ${parsed.length} products!`
                : `✅ Successfully imported ${parsed.length} products (${newCount} added, ${updateCount} updated)!`;

            alert(message);
        };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. SAMPLE CSV TEMPLATE GENERATOR & DOWNLOAD
    // ──────────────────────────────────────────────────────────────────────────
    private downloadSampleCSVTemplate() {
        const headers = [
            'Product Code',
            'Product Name',
            'Category',
            'Plant',
            'Group',
            'Color',
            'Warranty',
            'DP',
            'MRP',
            'Description'
        ];

        const sampleRows = [
            ['KA570027-RG', 'CeilingShower400mmx400mm(BrassRG)', 'faucet', 'KSPL', 'Bathware', 'RG', '10 Years', '21250', '21250', 'Ceiling shower 400x400 brass rose gold finish'],
            ['AU/KIT', 'AURUM TOOL KIT', 'faucet', 'KGPL', 'Hardware', 'CP', '2 Years', '250', '500', 'Aurum complete plumbing fitting tool kit'],
            ['BW3007', 'BLACK BUSH WASHER FOR SOLONOIDE VALVE', 'sanitaryware', 'KBPL', 'Plumbing', 'MB', '1 Year', '80', '160', 'Solenoid valve black bush washer EPDM'],
            ['F-KA10000-CG', 'HOSE CHAIN 1.MTR -CG', 'faucet', 'KSPL', 'Bathware', 'CG', '5 Years', '420', '840', 'Hose chain 1 meter champagne gold'],
            ['F-KA1000057-GM', 'HOSE CHAIN 1.MTR -GM', 'faucet', 'KGPL', 'Bathware', 'GM', '5 Years', '640', '1280', 'Hose chain 1 meter gun metal finish'],
            ['F-KA1000057-RG', 'HOSE CHAIN 1.MTR -RG', 'faucet', 'KSPL', 'Bathware', 'RG', '5 Years', '420', '840', 'Hose chain 1 meter rose gold finish'],
            ['F-KB2000733-BLK', 'Knob (Small)', 'faucet', 'KBPL', 'Bathware', 'MB', '3 Years', '900', '1800', 'Precision control knob small matte black'],
            ['KS-SN-9010-W', 'Single Lever Basin Mixer White', 'faucet', 'KSPL', 'Mixers & Faucets', 'W', '10 Years', '4500', '8990', 'Premium single lever basin mixer alpine white finish'],
            ['KG-SH-3040-MB', 'Overhead Rain Shower 300mm Matte Black', 'faucet', 'KGPL', 'Showers & Overheads', 'MB', '5 Years', '3200', '6400', 'Ultra-slim stainless steel 304 overhead rain shower'],
            ['KB-WB-7720-W', 'Wall Hung Ceramic Basin 550mm', 'sanitaryware', 'KBPL', 'Washbasins', 'W', '10 Years', '2800', '5600', 'Vitreous china wall hung washbasin with overflow hole']
        ];

        const csvContent = [
            headers.join(','),
            ...sampleRows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `products_bulk_template.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 5. MASTER PRODUCT REPORT DOWNLOAD (CSV / SPREADSHEET)
    // ──────────────────────────────────────────────────────────────────────────
    private downloadProductReport() {
        const headers = ['Product Code', 'Product Name', 'Category', 'Plant', 'Group', 'Color', 'Warranty', 'DP (INR)', 'MRP (INR)', 'Tracked Serials', 'Created Date', 'Description'];
        const rows = this.products.map(p => {
            const serialCount = this.serials.filter(s => s.productId === p.id).length;
            return [
                `"${p.sku}"`,
                `"${p.title.replace(/"/g, '""')}"`,
                `"${p.category}"`,
                `"${(p.plant || 'KSPL').replace(/"/g, '""')}"`,
                `"${(p.group || 'Bathware').replace(/"/g, '""')}"`,
                `"${(p.color || 'CP').replace(/"/g, '""')}"`,
                `"${(p.warranty || '5 Years').replace(/"/g, '""')}"`,
                `"${formatINR(p.dp)}"`,
                `"${formatINR(p.mrp)}"`,
                serialCount,
                `"${new Date(p.createdAt).toLocaleDateString()}"`,
                `"${(p.description || '').replace(/"/g, '""')}"`
            ].join(',');
        });

        const csvString = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `products_master_report_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 6. PRINT LOGIC & DISPATCH
    // ──────────────────────────────────────────────────────────────────────────
    private triggerProductBatchPrint(product: ProductRecord) {
        const productSerials = this.serials.filter(s => s.productId === product.id);
        if (productSerials.length === 0) {
            if (confirm(`No serial units generated for ${product.title} yet. Generate 6 serial numbers now?`)) {
                this.generateSerialsForProduct(product, 6);
                const freshlyGenerated = this.serials.filter(s => s.productId === product.id);
                this.triggerSerializedUnitsPrint(product, freshlyGenerated);
            }
            return;
        }
        this.triggerSerializedUnitsPrint(product, productSerials);
    }

    private triggerSerializedUnitsPrint(product: ProductRecord, units: SerializedUnit[]) {
        const now = new Date().toISOString();
        units.forEach(u => {
            u.lastPrintedAt = now;
            u.printCount = (u.printCount || 0) + 1;
            void supabaseService.saveSerial(u);
        });
        this.saveSerialsToStorage();

        // Build records with all fields & INR formatting
        const records = units.map(u => ({
            sku: product.sku,
            title: product.title,
            category: product.category,
            plant: product.plant || 'KSPL',
            group: product.group || 'Bathware',
            color: product.color || 'CP',
            warranty: product.warranty || '5 Years',
            dp: formatINR(product.dp),
            mrp: formatINR(product.mrp),
            price: formatINR(product.mrp),
            origPrice: formatINR(product.mrp),
            serialNumber: u.serialNumber,
            ...u.variables
        }));

        const schema: EntitySchema = {
            label: `Product: ${product.title}`,
            fields: [
                { name: 'sku', label: 'Product Code / SKU' },
                { name: 'title', label: 'Product Name' },
                { name: 'category', label: 'Category' },
                { name: 'plant', label: 'Plant (KSPL/KGPL/KBPL)' },
                { name: 'group', label: 'Group' },
                { name: 'color', label: 'Color Code' },
                { name: 'warranty', label: 'Warranty' },
                { name: 'dp', label: 'Distributor Price (DP)' },
                { name: 'mrp', label: 'Maximum Retail Price (MRP)' },
                { name: 'price', label: 'Retail Price' },
                { name: 'serialNumber', label: 'Serial Number' },
                ...product.variables.map(v => ({ name: v.key, label: v.label }))
            ],
            sampleData: records[0] || {}
        };

        const baseTpl = PREBUILT_TEMPLATES.find(t => t.id === 'retail-price-tag') || PREBUILT_TEMPLATES[1];
        const layout: StickerLayout = JSON.parse(JSON.stringify(baseTpl.layout));
        layout.name = `${product.title} - INR Label`;
        layout.targetEntity = 'product';

        const priceEl = layout.elements.find(el => el.id === 'prod-price');
        if (priceEl) {
            priceEl.content = '{{mrp}}';
        }

        const hasSerial = layout.elements.some(el => el.content.includes('serialNumber'));
        if (!hasSerial) {
            layout.elements.push({
                id: 'prod-sn-badge',
                type: 'text',
                x: 3,
                y: 31,
                w: 64,
                h: 5,
                content: 'S/N: {{serialNumber}}',
                style: {
                    textAlign: 'left',
                    fontWeight: 'bold',
                    fontSize: 7,
                    color: '#0284c7'
                }
            });
        }

        this.onPrintProductSerials(layout, schema, records);
    }

    private generateSerialsForProduct(product: ProductRecord, count: number, customVars: Record<string, string> = {}) {
        const prefix = product.serialPrefix || `${product.plant || 'SN'}-`;
        const startSeq = product.nextSerialSequence ?? 1001;
        const padding = product.serialPadding ?? 5;

        let currentSeq = startSeq;
        const newUnits: SerializedUnit[] = [];

        for (let i = 0; i < count; i++) {
            const seqStr = currentSeq.toString().padStart(padding, '0');
            const sn = `${prefix}${seqStr}`;

            newUnits.push({
                id: `sn-${product.id}-${Date.now()}-${i}`,
                serialNumber: sn,
                productId: product.id,
                sku: product.sku,
                productTitle: product.title,
                category: product.category,
                plant: product.plant || 'KSPL',
                group: product.group,
                color: product.color || 'CP',
                warranty: product.warranty || '5 Years',
                price: formatINR(product.mrp),
                dp: formatINR(product.dp),
                mrp: formatINR(product.mrp),
                variables: { ...product.defaultVariables, ...customVars },
                createdAt: new Date().toISOString(),
                status: 'In Stock',
                lastPrintedAt: null,
                printCount: 0
            });
            currentSeq++;
        }

        product.nextSerialSequence = currentSeq;
        this.serials.push(...newUnits);
        this.saveProductsToStorage();
        this.saveSerialsToStorage();
        void supabaseService.batchSaveSerials(newUnits);
        void supabaseService.saveProduct(product);
        this.render();
    }

    private openBatchSerialModal(product: ProductRecord) {
        const modalContainer = this.container.querySelector('#serial-batch-modal-container');
        if (!modalContainer) return;

        const nextSeq = product.nextSerialSequence || 1001;

        modalContainer.innerHTML = `
        <div class="studio-modal-backdrop">
            <div class="studio-modal-dialog">
                <div class="modal-header">
                    <h3 class="modal-title">⚡ Generate Serial Numbers for ${esc(product.title)}</h3>
                    <button class="btn btn-icon btn-close-modal">✕</button>
                </div>

                <div class="modal-body-scroll">
                    <form id="batch-serial-form" class="modal-form-grid">
                        <div class="form-group">
                            <label>Number of Units to Generate *</label>
                            <input type="number" name="count" id="input-batch-count" min="1" max="1000" value="10" required />
                        </div>

                        <div class="form-group">
                            <label>Starting Sequence Number</label>
                            <input type="number" name="startSeq" min="1" value="${nextSeq}" required />
                        </div>

                        <div class="form-group col-span-2">
                            <label>Serial Number Format Preview</label>
                            <div class="serial-format-preview-box">
                                <span class="format-tag">Prefix: ${esc(product.serialPrefix)}</span>
                                <span class="format-tag">Plant: ${esc(product.plant || 'KSPL')}</span>
                                <span class="format-tag">Color: ${esc(product.color || 'CP')}</span>
                                <span class="format-tag">Padding: ${esc(product.serialPadding || 5)} digits</span>
                                <span class="format-sample">Preview: ${esc(product.serialPrefix)}${nextSeq.toString().padStart(product.serialPadding || 5, '0')}</span>
                            </div>
                        </div>

                        ${product.variables.length > 0 ? `
                        <div class="col-span-2">
                            <h4 class="vars-title">Override Dynamic Variables for this Batch:</h4>
                            <div class="vars-inputs-list" style="margin-top:8px;">
                                ${product.variables.map(v => `
                                    <div class="form-group">
                                        <label>${esc(v.label)} (<code>{{${esc(v.key)}}}</code>)</label>
                                        <input type="text" class="input-batch-var" data-key="${esc(v.key)}" value="${esc(v.defaultValue || '')}" />
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        ` : ''}
                    </form>
                </div>

                <div class="modal-footer">
                    <button class="btn btn-outline btn-close-modal">Cancel</button>
                    <button class="btn btn-primary" id="btn-submit-batch-generate">
                        ⚡ Generate Units
                    </button>
                </div>
            </div>
        </div>
        `;

        const closeModal = () => { modalContainer.innerHTML = ''; };
        modalContainer.querySelectorAll('.btn-close-modal').forEach(b => b.addEventListener('click', closeModal));

        modalContainer.querySelector('#btn-submit-batch-generate')?.addEventListener('click', () => {
            const countInput = modalContainer.querySelector<HTMLInputElement>('#input-batch-count');
            const count = parseInt(countInput?.value || '10', 10);

            const customVars: Record<string, string> = {};
            modalContainer.querySelectorAll<HTMLInputElement>('.input-batch-var').forEach(inp => {
                const key = inp.dataset.key;
                if (key) customVars[key] = inp.value;
            });

            this.generateSerialsForProduct(product, count, customVars);
            closeModal();
        });
    }
}
