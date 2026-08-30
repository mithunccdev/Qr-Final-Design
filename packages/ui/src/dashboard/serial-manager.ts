import { StickerLayout } from 'qrlayout-core';
import type { EntitySchema } from '../types';
import { PREBUILT_TEMPLATES } from './templates-data';
import { supabaseService } from '../supabase';
import { ProductRecord, SerializedUnit, formatINR, parseINRValue } from './product-manager';
import { BatchRecord } from './batch-manager';
import { getSerialLogicRule, generateSerialNumberPreview, generateAutomatedSerials } from './serial-batch-logic';
import { esc } from '../escape';
import { canCurrentUser } from './permissions';

export interface SerialManagerOptions {
    container: HTMLElement;
    onPrintSerials: (layout: StickerLayout, schema: EntitySchema, records: Record<string, any>[]) => void;
    onOpenInDesigner?: (layout: StickerLayout, schema: EntitySchema) => void;
}

const STORAGE_KEY_SERIALS = 'qrlayout_db_serials_v2';
const STORAGE_KEY_PRODUCTS = 'qrlayout_db_products_v2';
const STORAGE_KEY_BATCHES = 'qrlayout_db_batches_v2';

export class SerialManagerView {
    private container: HTMLElement;
    private onPrintSerials: (layout: StickerLayout, schema: EntitySchema, records: Record<string, any>[]) => void;
    private onOpenInDesigner?: (layout: StickerLayout, schema: EntitySchema) => void;

    private serials: SerializedUnit[] = [];
    private products: ProductRecord[] = [];
    private batches: BatchRecord[] = [];
    private selectedSerialIds: Set<string> = new Set();
    private searchQuery: string = '';
    private statusFilter: string = 'All';
    private plantFilter: string = 'All';
    private batchFilter: string = 'All';
    private productFilter: string = 'All';

    constructor(options: SerialManagerOptions) {
        this.container = options.container;
        this.onPrintSerials = options.onPrintSerials;
        this.onOpenInDesigner = options.onOpenInDesigner;

        this.loadData();
        this.render();
    }

    public refresh() {
        this.loadData();
        this.render();
    }

    private loadData() {
        try {
            const rawSerials = localStorage.getItem(STORAGE_KEY_SERIALS) || localStorage.getItem('qrlayout_db_serials');
            if (rawSerials) {
                this.serials = JSON.parse(rawSerials);
            } else {
                this.serials = this.getSampleSerials();
                this.saveSerials();
            }

            const rawProducts = localStorage.getItem(STORAGE_KEY_PRODUCTS) || localStorage.getItem('qrlayout_db_products');
            if (rawProducts) {
                this.products = JSON.parse(rawProducts);
            }

            const rawBatches = localStorage.getItem(STORAGE_KEY_BATCHES);
            if (rawBatches) {
                this.batches = JSON.parse(rawBatches);
            }
        } catch (e) {
            console.error('Error loading serials data:', e);
            this.serials = this.getSampleSerials();
        }
    }

    private saveSerials() {
        localStorage.setItem(STORAGE_KEY_SERIALS, JSON.stringify(this.serials));
        localStorage.setItem('qrlayout_db_serials', JSON.stringify(this.serials));
    }

    private getSampleSerials(): SerializedUnit[] {
        return [
            {
                id: 'sn-101',
                serialNumber: 'KSPL-2026-0001',
                productId: 'p-1',
                sku: 'FAUC-KS-01',
                productTitle: 'Single Lever Basin Mixer - Chrome',
                category: 'Faucets & Fittings',
                plant: 'KSPL',
                group: 'Premium Faucets',
                color: 'CP',
                warranty: '10 Years',
                price: '₹4,850.00',
                dp: '₹3,400.00',
                mrp: '₹4,850.00',
                variables: { finish: 'Chrome Plated', cartridge: '35mm Ceramic' },
                createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
                status: 'Quality Passed',
                lastPrintedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
                printCount: 3,
                batchNumber: 'BAT-202608-001'
            } as any,
            {
                id: 'sn-102',
                serialNumber: 'KSPL-2026-0002',
                productId: 'p-1',
                sku: 'FAUC-KS-01',
                productTitle: 'Single Lever Basin Mixer - Chrome',
                category: 'Faucets & Fittings',
                plant: 'KSPL',
                group: 'Premium Faucets',
                color: 'CP',
                warranty: '10 Years',
                price: '₹4,850.00',
                dp: '₹3,400.00',
                mrp: '₹4,850.00',
                variables: { finish: 'Chrome Plated', cartridge: '35mm Ceramic' },
                createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
                status: 'In Stock',
                lastPrintedAt: null,
                printCount: 0,
                batchNumber: 'BAT-202608-001'
            } as any,
            {
                id: 'sn-103',
                serialNumber: 'KGPL-2026-0089',
                productId: 'p-2',
                sku: 'BATH-KG-W02',
                productTitle: 'Rimless Wall Hung Water Closet',
                category: 'Sanitaryware & Bathware',
                plant: 'KGPL',
                group: 'Sanitaryware',
                color: 'W',
                warranty: '5 Years',
                price: '₹12,400.00',
                dp: '₹8,900.00',
                mrp: '₹12,400.00',
                variables: { trap: 'P-Trap', glaze: 'Nano-Antibacterial' },
                createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
                status: 'In Stock',
                lastPrintedAt: new Date(Date.now() - 86400000).toISOString(),
                printCount: 1,
                batchNumber: 'BAT-202608-002'
            } as any,
            {
                id: 'sn-104',
                serialNumber: 'KBPL-2026-0412',
                productId: 'p-3',
                sku: 'SHWR-KB-G05',
                productTitle: 'Thermostatic Diverter - Matte Black',
                category: 'Faucets & Fittings',
                plant: 'KBPL',
                group: 'Shower Systems',
                color: 'MB',
                warranty: '5 Years',
                price: '₹8,950.00',
                dp: '₹6,200.00',
                mrp: '₹8,950.00',
                variables: { outlets: '3-Way', tempPreset: '38°C Safety Lock' },
                createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
                status: 'Dispatched',
                lastPrintedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
                printCount: 2,
                batchNumber: 'BAT-202608-003'
            } as any
        ];
    }

    public render() {
        // Compute stats
        const total = this.serials.length;
        const inStock = this.serials.filter(s => s.status === 'In Stock').length;
        const qcPassed = this.serials.filter(s => s.status === 'Quality Passed').length;
        const dispatched = this.serials.filter(s => s.status === 'Dispatched').length;
        const totalPrinted = this.serials.reduce((sum, s) => sum + (s.printCount || 0), 0);

        // Filter list
        const filtered = this.serials.filter(s => {
            const q = this.searchQuery.toLowerCase();
            const matchesQuery = !q ||
                s.serialNumber.toLowerCase().includes(q) ||
                s.sku.toLowerCase().includes(q) ||
                s.productTitle.toLowerCase().includes(q) ||
                ((s as any).batchNumber && (s as any).batchNumber.toLowerCase().includes(q)) ||
                (s.color && s.color.toLowerCase().includes(q)) ||
                (s.plant && s.plant.toLowerCase().includes(q));

            const matchesStatus = this.statusFilter === 'All' || s.status === this.statusFilter;
            const matchesPlant = this.plantFilter === 'All' || s.plant === this.plantFilter;
            const matchesBatch = this.batchFilter === 'All' || (s as any).batchNumber === this.batchFilter;
            const matchesProduct = this.productFilter === 'All' || s.productId === this.productFilter || s.sku === this.productFilter;

            return matchesQuery && matchesStatus && matchesPlant && matchesBatch && matchesProduct;
        });

        // Unique batches & plants for filters
        const uniqueBatches = Array.from(new Set(this.serials.map(s => (s as any).batchNumber).filter(Boolean)));
        const uniquePlants = ['KSPL', 'KGPL', 'KBPL'];

        this.container.innerHTML = `
        <div class="entity-manager-root">
            <!-- HEADER TOOLBAR -->
            <div class="manager-card-panel">
                <div class="panel-header-row" style="align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 1.5rem;">🔢</span>
                            <div>
                                <h2 class="panel-heading" style="margin: 0;">Serial Numbers</h2>
                                <p class="panel-subheading" style="margin: 2px 0 0 0;">Track individual serialized products, generate barcodes/QR codes, and print tracking tags.</p>
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                        <button class="btn btn-outline" id="btn-export-serials-csv" title="Export serial numbers to CSV">
                            📥 Export CSV
                        </button>
                        <button class="btn btn-outline" id="btn-scan-verify" title="Scan a printed label to verify">
                            📷 Verify
                        </button>
                        <button class="btn btn-outline" id="btn-print-selected-serials" style="${this.selectedSerialIds.size > 0 ? 'border-color: var(--accent); color: var(--accent);' : ''}">
                            🖨️ Print Selected (${this.selectedSerialIds.size})
                        </button>
                        ${canCurrentUser('serials', 'create') ? `
                        <button class="btn btn-primary" id="btn-open-gen-serials-modal">
                            ➕ Generate Serial Numbers
                        </button>
                        ` : ''}
                    </div>
                </div>

                <!-- STATS CARDS -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 20px;">
                    <div class="stat-pill-box">
                        <span class="stat-pill-label">Total Serials</span>
                        <span class="stat-pill-val">${total}</span>
                    </div>
                    <div class="stat-pill-box">
                        <span class="stat-pill-label">In Stock</span>
                        <span class="stat-pill-val" style="color: #0284c7;">${inStock}</span>
                    </div>
                    <div class="stat-pill-box">
                        <span class="stat-pill-label">Quality Passed</span>
                        <span class="stat-pill-val" style="color: #10b981;">${qcPassed}</span>
                    </div>
                    <div class="stat-pill-box">
                        <span class="stat-pill-label">Dispatched</span>
                        <span class="stat-pill-val" style="color: #8b5cf6;">${dispatched}</span>
                    </div>
                    <div class="stat-pill-box">
                        <span class="stat-pill-label">Total Labels Printed</span>
                        <span class="stat-pill-val" style="color: #f59e0b;">${totalPrinted}</span>
                    </div>
                </div>

                <!-- FILTERS & SEARCH ROW -->
                <div style="display: flex; gap: 12px; margin-top: 20px; align-items: center; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 220px; position: relative;">
                        <input type="text" id="serials-search-input" class="search-input-field" placeholder="Search serial #, SKU, product, batch..." value="${this.searchQuery}" style="width: 100%; padding-left: 32px;" />
                        <svg style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); opacity: 0.5;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                    </div>

                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <select id="filter-serial-status" class="filter-dropdown">
                            <option value="All" ${this.statusFilter === 'All' ? 'selected' : ''}>All Statuses</option>
                            <option value="In Stock" ${this.statusFilter === 'In Stock' ? 'selected' : ''}>In Stock</option>
                            <option value="Quality Passed" ${this.statusFilter === 'Quality Passed' ? 'selected' : ''}>Quality Passed</option>
                            <option value="Dispatched" ${this.statusFilter === 'Dispatched' ? 'selected' : ''}>Dispatched</option>
                            <option value="Returned" ${this.statusFilter === 'Returned' ? 'selected' : ''}>Returned</option>
                        </select>

                        <select id="filter-serial-plant" class="filter-dropdown">
                            <option value="All" ${this.plantFilter === 'All' ? 'selected' : ''}>All Plants</option>
                            ${uniquePlants.map(p => `<option value="${p}" ${this.plantFilter === p ? 'selected' : ''}>${p}</option>`).join('')}
                        </select>

                        <select id="filter-serial-batch" class="filter-dropdown">
                            <option value="All" ${this.batchFilter === 'All' ? 'selected' : ''}>All Batches</option>
                            ${uniqueBatches.map(b => `<option value="${esc(b)}" ${this.batchFilter === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}
                        </select>

                        <select id="filter-serial-product" class="filter-dropdown">
                            <option value="All" ${this.productFilter === 'All' ? 'selected' : ''}>All Products</option>
                            ${this.products.map(pr => `<option value="${esc(pr.id)}" ${this.productFilter === pr.id ? 'selected' : ''}>${esc(pr.sku)} - ${esc(pr.title)}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <!-- TABLE VIEW -->
                <div class="manager-table-wrapper" style="margin-top: 16px;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th style="width: 40px;">
                                    <input type="checkbox" id="chk-select-all-serials" ${filtered.length > 0 && filtered.every(s => this.selectedSerialIds.has(s.id)) ? 'checked' : ''} />
                                </th>
                                <th>Serial Number</th>
                                <th>Product SKU &amp; Title</th>
                                <th>Plant</th>
                                <th>Batch Code</th>
                                <th>Status</th>
                                <th>Created Date</th>
                                <th>Print Count</th>
                                <th style="text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filtered.length === 0 ? `
                                <tr>
                                    <td colspan="9" style="text-align: center; padding: 48px; color: var(--text-secondary);">
                                        <div style="font-size: 2rem; margin-bottom: 8px;">🔢</div>
                                        <div style="font-weight: 600; color: var(--text-primary);">No serial numbers found</div>
                                        <div style="font-size: 0.8125rem; margin-top: 4px;">Generate serial numbers for products to begin tracking.</div>
                                    </td>
                                </tr>
                            ` : filtered.map(s => {
                                const isChecked = this.selectedSerialIds.has(s.id);
                                const batchNum = (s as any).batchNumber || '—';
                                return `
                                <tr class="${isChecked ? 'row-selected' : ''}" data-id="${esc(s.id)}">
                                    <td>
                                        <input type="checkbox" class="chk-serial-item" data-id="${esc(s.id)}" ${isChecked ? 'checked' : ''} />
                                    </td>
                                    <td>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <span class="code-badge-pill" style="font-weight: 700; font-family: monospace; font-size: 0.875rem; color: var(--accent); background: var(--accent-soft); padding: 4px 8px; border-radius: 6px;">
                                                ${esc(s.serialNumber)}
                                            </span>
                                        </div>
                                    </td>
                                    <td>
                                        <div>
                                            <div style="font-weight: 600; color: var(--text-primary); font-size: 0.875rem;">${esc(s.productTitle)}</div>
                                            <div style="font-size: 0.75rem; font-family: monospace; color: var(--text-secondary);">${esc(s.sku)}</div>
                                        </div>
                                    </td>
                                    <td>
                                        <span class="nav-item-badge badge-neutral" style="font-size: 0.75rem;">${esc(s.plant || 'KSPL')}</span>
                                    </td>
                                    <td>
                                        ${batchNum !== '—' ? `
                                            <span class="nav-item-badge badge-indigo" style="font-family: monospace; font-size: 0.75rem;">${esc(batchNum)}</span>
                                        ` : '<span style="color: var(--text-secondary); font-size: 0.75rem;">—</span>'}
                                    </td>
                                    <td>
                                        ${this.renderStatusBadge(s.status)}
                                    </td>
                                    <td style="font-size: 0.8125rem; color: var(--text-secondary);">
                                        ${new Date(s.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                    </td>
                                    <td>
                                        <span class="nav-item-badge ${s.printCount > 0 ? 'badge-emerald' : 'badge-neutral'}">
                                            🖨️ ${s.printCount || 0}
                                        </span>
                                    </td>
                                    <td style="text-align: right;">
                                        <div style="display: flex; gap: 6px; justify-content: flex-end;">
                                            <button class="btn btn-sm btn-outline btn-print-single-serial" data-id="${s.id}" title="Print Label">
                                                🖨️ Print
                                            </button>
                                            <button class="btn btn-sm btn-outline btn-view-serial-qr" data-id="${s.id}" title="View QR Code & Barcode">
                                                🔍
                                            </button>
                                            <button class="btn btn-sm btn-outline btn-delete-serial" data-id="${s.id}" title="Delete Serial" style="color: #ef4444; border-color: #fee2e2;">
                                                🗑️
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>

                <!-- TABLE FOOTER / BULK ACTIONS -->
                ${this.selectedSerialIds.size > 0 ? `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--accent-soft); border-radius: 8px; margin-top: 16px;">
                        <span style="font-size: 0.875rem; font-weight: 600; color: var(--accent);">
                            ✓ ${this.selectedSerialIds.size} serial number(s) selected
                        </span>
                        <div style="display: flex; gap: 8px;">
                            <select id="bulk-serial-status-select" class="filter-dropdown" style="font-size: 0.8125rem; padding: 4px 8px;">
                                <option value="">Change Status...</option>
                                <option value="In Stock">Set In Stock</option>
                                <option value="Quality Passed">Set Quality Passed</option>
                                <option value="Dispatched">Set Dispatched</option>
                                <option value="Returned">Set Returned</option>
                            </select>
                            <button class="btn btn-sm btn-outline" id="btn-bulk-delete-serials" style="color: #ef4444; border-color: #fca5a5;">
                                🗑️ Delete Selected
                            </button>
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>

        <!-- MODAL ROOT -->
        <div id="serial-modal-root"></div>
        `;

        this.bindEvents();
    }

    private renderStatusBadge(status: string): string {
        switch (status) {
            case 'Quality Passed':
                return '<span class="nav-item-badge badge-emerald">✓ QC Passed</span>';
            case 'In Stock':
                return '<span class="nav-item-badge badge-cyan">📦 In Stock</span>';
            case 'Dispatched':
                return '<span class="nav-item-badge badge-indigo">🚚 Dispatched</span>';
            case 'Returned':
                return '<span class="nav-item-badge badge-amber">↩️ Returned</span>';
            default:
                return `<span class="nav-item-badge badge-neutral">${status}</span>`;
        }
    }

    private bindEvents() {
        // Search
        const searchInput = this.container.querySelector('#serials-search-input') as HTMLInputElement;
        searchInput?.addEventListener('input', (e) => {
            this.searchQuery = (e.target as HTMLInputElement).value;
            this.render();
            // Restore focus and cursor
            const updated = this.container.querySelector('#serials-search-input') as HTMLInputElement;
            if (updated) {
                updated.focus();
                updated.setSelectionRange(this.searchQuery.length, this.searchQuery.length);
            }
        });

        // Filters
        this.container.querySelector('#filter-serial-status')?.addEventListener('change', (e) => {
            this.statusFilter = (e.target as HTMLSelectElement).value;
            this.render();
        });
        this.container.querySelector('#filter-serial-plant')?.addEventListener('change', (e) => {
            this.plantFilter = (e.target as HTMLSelectElement).value;
            this.render();
        });
        this.container.querySelector('#filter-serial-batch')?.addEventListener('change', (e) => {
            this.batchFilter = (e.target as HTMLSelectElement).value;
            this.render();
        });
        this.container.querySelector('#filter-serial-product')?.addEventListener('change', (e) => {
            this.productFilter = (e.target as HTMLSelectElement).value;
            this.render();
        });

        // Checkbox select all
        this.container.querySelector('#chk-select-all-serials')?.addEventListener('change', (e) => {
            const checked = (e.target as HTMLInputElement).checked;
            if (checked) {
                this.serials.forEach(s => this.selectedSerialIds.add(s.id));
            } else {
                this.selectedSerialIds.clear();
            }
            this.render();
        });

        // Item checkboxes
        this.container.querySelectorAll<HTMLInputElement>('.chk-serial-item').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const id = (e.target as HTMLInputElement).dataset.id;
                if (id) {
                    if ((e.target as HTMLInputElement).checked) {
                        this.selectedSerialIds.add(id);
                    } else {
                        this.selectedSerialIds.delete(id);
                    }
                    this.render();
                }
            });
        });

        // Open Generate Modal
        this.container.querySelector('#btn-open-gen-serials-modal')?.addEventListener('click', () => {
            this.openGenerateModal();
        });

        // Export CSV
        this.container.querySelector('#btn-export-serials-csv')?.addEventListener('click', () => {
            this.exportCSV();
        });

        // Verify by scan
        this.container.querySelector('#btn-scan-verify')?.addEventListener('click', () => {
            this.openVerifyScanner();
        });

        // Print Selected
        this.container.querySelector('#btn-print-selected-serials')?.addEventListener('click', () => {
            const targets = this.selectedSerialIds.size > 0
                ? this.serials.filter(s => this.selectedSerialIds.has(s.id))
                : this.serials;
            this.dispatchToPrint(targets);
        });

        // Print Single
        this.container.querySelectorAll<HTMLButtonElement>('.btn-print-single-serial').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const unit = this.serials.find(s => s.id === id);
                if (unit) {
                    unit.printCount = (unit.printCount || 0) + 1;
                    unit.lastPrintedAt = new Date().toISOString();
                    this.saveSerials();
                    this.dispatchToPrint([unit]);
                }
            });
        });

        // View QR / Barcode details
        this.container.querySelectorAll<HTMLButtonElement>('.btn-view-serial-qr').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const unit = this.serials.find(s => s.id === id);
                if (unit) this.openViewQRModal(unit);
            });
        });

        // Delete Single
        this.container.querySelectorAll<HTMLButtonElement>('.btn-delete-serial').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                if (id && confirm('Delete this serial number?')) {
                    this.serials = this.serials.filter(s => s.id !== id);
                    this.selectedSerialIds.delete(id);
                    this.saveSerials();
                    this.render();
                }
            });
        });

        // Bulk status change
        this.container.querySelector('#bulk-serial-status-select')?.addEventListener('change', (e) => {
            const newStatus = (e.target as HTMLSelectElement).value;
            if (newStatus && this.selectedSerialIds.size > 0) {
                this.serials.forEach(s => {
                    if (this.selectedSerialIds.has(s.id)) {
                        s.status = newStatus as any;
                    }
                });
                this.saveSerials();
                this.render();
            }
        });

        // Bulk delete
        this.container.querySelector('#btn-bulk-delete-serials')?.addEventListener('click', () => {
            if (confirm(`Delete all ${this.selectedSerialIds.size} selected serial numbers?`)) {
                this.serials = this.serials.filter(s => !this.selectedSerialIds.has(s.id));
                this.selectedSerialIds.clear();
                this.saveSerials();
                this.render();
            }
        });
    }

    public openGenerateModal(preselectedProductId?: string, preselectedBatchNumber?: string) {
        const modalRoot = this.container.querySelector('#serial-modal-root') as HTMLElement;
        if (!modalRoot) return;

        const defaultProduct = this.products.find(p => p.id === preselectedProductId) || this.products[0];
        let currentPlant = defaultProduct?.plant || 'KSPL';
        let currentRule = getSerialLogicRule(currentPlant);
        let preview = generateSerialNumberPreview(currentRule, {
            plant: currentPlant,
            product: defaultProduct,
            color: defaultProduct?.color
        });

        modalRoot.innerHTML = `
        <div class="modal-overlay" style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
            <div class="modal-card" style="background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); width: 100%; max-width: 600px; box-shadow: var(--shadow-md); overflow: hidden;">
                <div class="modal-header" style="padding: 16px 20px; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1.25rem;">🔢</span>
                        <div>
                            <h3 style="margin: 0; font-size: 1.125rem; font-weight: 700; color: var(--text-primary);">Generate Unique Serial Numbers</h3>
                            <p style="margin: 0; font-size: 0.75rem; color: var(--text-secondary);">Driven by Plant Master Serialization Logic &amp; Rules</p>
                        </div>
                    </div>
                    <button class="btn-modal-close" id="btn-close-serial-modal" style="background: none; border: none; font-size: 1.25rem; cursor: pointer; color: var(--text-secondary);">✕</button>
                </div>

                <div class="modal-body" style="padding: 20px; display: flex; flex-direction: column; gap: 16px; max-height: 80vh; overflow-y: auto;">
                    
                    <!-- LIVE PREVIEW FROM MASTER LOGIC -->
                    <div style="background: var(--surface-muted); border: 1.5px solid var(--accent); border-radius: 10px; padding: 14px 16px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                            <span style="font-size: 0.75rem; font-weight: 700; color: var(--accent); text-transform: uppercase;">
                                Master Format Preview:
                            </span>
                            <span class="nav-item-badge badge-indigo" id="modal-serial-preview-len" style="font-family: monospace;">
                                ${preview.length} Chars
                            </span>
                        </div>
                        <div id="modal-serial-preview-code" style="font-size: 1.375rem; font-weight: 800; font-family: monospace; color: var(--text-primary);">
                            ${preview.code}
                        </div>
                        <div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 4px;">
                            Rule: <strong>${currentRule.ruleName}</strong> (${currentRule.sequencePadding} digits, reset: ${currentRule.resetFrequency})
                        </div>
                    </div>

                    <!-- PRODUCT SELECTION -->
                    <div class="form-group">
                        <label style="font-weight: 700; font-size: 0.8125rem;">Target Product *</label>
                        <select id="gen-serial-product" class="filter-dropdown" style="width: 100%;">
                            ${this.products.map(p => `
                                <option value="${esc(p.id)}" ${p.id === defaultProduct?.id ? 'selected' : ''}>
                                    ${esc(p.sku)} — ${esc(p.title)} (${esc(p.plant || 'KSPL')} | Color: ${esc(p.color || 'CP')})
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <!-- BATCH NUMBER SELECTION -->
                    <div class="form-group">
                        <label style="font-weight: 700; font-size: 0.8125rem;">Associate Batch Number (Optional)</label>
                        <input type="text" id="gen-serial-batch" list="batch-datalist" placeholder="e.g. BAT-202608-001" value="${preselectedBatchNumber || ''}" style="width: 100%; font-family: monospace;" />
                        <datalist id="batch-datalist">
                            ${this.batches.map(b => `<option value="${b.batchNumber}">${b.productTitle} (${b.plant})</option>`).join('')}
                        </datalist>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div class="form-group">
                            <label style="font-weight: 700; font-size: 0.8125rem;">Quantity to Generate *</label>
                            <input type="number" id="gen-serial-qty" min="1" max="5000" value="10" style="width: 100%; font-weight: 700;" />
                        </div>
                        <div class="form-group">
                            <label style="font-weight: 700; font-size: 0.8125rem;">Manufacturing Plant</label>
                            <select id="gen-serial-plant" class="filter-dropdown" style="width: 100%;">
                                <option value="KSPL" ${currentPlant === 'KSPL' ? 'selected' : ''}>KSPL - Kajaria Sanitaryware</option>
                                <option value="KGPL" ${currentPlant === 'KGPL' ? 'selected' : ''}>KGPL - Kajaria Gailpur</option>
                                <option value="KBPL" ${currentPlant === 'KBPL' ? 'selected' : ''}>KBPL - Kajaria Bathware</option>
                            </select>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div class="form-group">
                            <label style="font-weight: 700; font-size: 0.8125rem;">Starting Sequence #</label>
                            <input type="number" id="gen-serial-seq" min="1" value="${currentRule.currentSequence || currentRule.sequenceStartNumber || 1}" style="width: 100%; font-weight: 700;" />
                        </div>
                        <div class="form-group">
                            <label style="font-weight: 700; font-size: 0.8125rem;">Initial Inventory Status</label>
                            <select id="gen-serial-initial-status" class="filter-dropdown" style="width: 100%;">
                                <option value="In Stock" selected>In Stock (Ready for Dispatch)</option>
                                <option value="Quality Passed">Quality Passed (QC Approved)</option>
                                <option value="Dispatched">Dispatched</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="modal-footer" style="padding: 16px 20px; border-top: 1px solid var(--line); display: flex; justify-content: flex-end; gap: 10px; background: var(--surface-muted);">
                    <button class="btn btn-outline" id="btn-cancel-serial-gen">Cancel</button>
                    <button class="btn btn-primary" id="btn-submit-serial-gen">⚡ Generate Unique Serials</button>
                </div>
            </div>
        </div>
        `;

        const updateModalPreview = () => {
            const pid = (modalRoot.querySelector('#gen-serial-product') as HTMLSelectElement).value;
            const prod = this.products.find(p => p.id === pid) || defaultProduct;
            const plant = (modalRoot.querySelector('#gen-serial-plant') as HTMLSelectElement).value;
            const seq = parseInt((modalRoot.querySelector('#gen-serial-seq') as HTMLInputElement).value, 10) || 1;
            const rule = getSerialLogicRule(plant);
            const p = generateSerialNumberPreview(rule, { plant, product: prod, sequence: seq, color: prod?.color });

            const codeEl = modalRoot.querySelector('#modal-serial-preview-code');
            const lenEl = modalRoot.querySelector('#modal-serial-preview-len');
            if (codeEl) codeEl.textContent = p.code;
            if (lenEl) lenEl.textContent = `${p.length} Chars`;
        };

        modalRoot.querySelector('#btn-close-serial-modal')?.addEventListener('click', () => { modalRoot.innerHTML = ''; });
        modalRoot.querySelector('#btn-cancel-serial-gen')?.addEventListener('click', () => { modalRoot.innerHTML = ''; });

        modalRoot.querySelector('#gen-serial-product')?.addEventListener('change', updateModalPreview);
        modalRoot.querySelector('#gen-serial-plant')?.addEventListener('change', updateModalPreview);
        modalRoot.querySelector('#gen-serial-seq')?.addEventListener('input', updateModalPreview);

        modalRoot.querySelector('#btn-submit-serial-gen')?.addEventListener('click', () => {
            const pid = (modalRoot.querySelector('#gen-serial-product') as HTMLSelectElement).value;
            const prod = this.products.find(p => p.id === pid);
            if (!prod) {
                alert('Please select a valid product.');
                return;
            }

            const batchNum = (modalRoot.querySelector('#gen-serial-batch') as HTMLInputElement).value.trim();
            const qty = parseInt((modalRoot.querySelector('#gen-serial-qty') as HTMLInputElement).value, 10) || 1;
            const plant = (modalRoot.querySelector('#gen-serial-plant') as HTMLSelectElement).value;
            const startSeq = parseInt((modalRoot.querySelector('#gen-serial-seq') as HTMLInputElement).value, 10) || 1;
            const status = (modalRoot.querySelector('#gen-serial-initial-status') as HTMLSelectElement).value as any;

            const { units, nextSequence } = generateAutomatedSerials({
                product: prod,
                quantity: qty,
                batchNumber: batchNum || undefined,
                plant,
                startSequence: startSeq,
                status
            });

            this.serials = [...units, ...this.serials];
            this.saveSerials();

            modalRoot.innerHTML = '';
            this.render();
            alert(`✅ Successfully generated ${units.length} unique serial number(s) adhering to ${plant} logic!`);
        });
    }

    /** Open a camera scanner to verify a printed label (uses the browser BarcodeDetector). */
    private openVerifyScanner(): void {
        const modalRoot = this.container.querySelector('#serial-modal-root') as HTMLElement;
        if (!modalRoot) return;
        modalRoot.innerHTML = `
        <div class="modal-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;">
            <div class="modal-card" style="background:var(--surface);border-radius:14px;width:420px;max-width:95vw;padding:20px;text-align:center;">
                <h3 style="margin:0 0 8px 0;">📷 Scan to Verify</h3>
                <p style="margin:0 0 12px 0;font-size:0.8125rem;color:var(--text-secondary);">Point the camera at a printed QR / barcode.</p>
                <div style="position:relative;background:#000;border-radius:10px;overflow:hidden;height:220px;">
                    <video id="scan-video" playsinline style="width:100%;height:100%;object-fit:cover;"></video>
                </div>
                <div id="scan-result" style="margin-top:12px;font-size:0.875rem;"></div>
                <div style="display:flex;justify-content:center;gap:8px;margin-top:12px;">
                    <button class="btn btn-outline" id="scan-close">Close</button>
                </div>
            </div>
        </div>`;
        const close = () => { this.stopStream(); modalRoot.innerHTML = ''; };
        modalRoot.querySelector('#scan-close')?.addEventListener('click', close);
        this.startStream();
    }

    private stream: MediaStream | null = null;
    private scanTimer: any = null;

    private async startStream(): Promise<void> {
        const modalRoot = this.container.querySelector('#serial-modal-root') as HTMLElement;
        const video = modalRoot?.querySelector<HTMLVideoElement>('#scan-video');
        const resultEl = modalRoot?.querySelector('#scan-result');
        // @ts-ignore
        const Detector = (window as any).BarcodeDetector;
        if (!video || !resultEl) return;
        if (typeof Detector === 'undefined') {
            resultEl.innerHTML = '<span style="color:#fbbf24;">⚠️ Camera scanning is not supported in this browser. Use Chrome/Edge.</span>';
            return;
        }
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            video.srcObject = this.stream;
            await video.play();
            const detector = new Detector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'upc_a'] });
            this.scanTimer = setInterval(async () => {
                if (!video.videoWidth) return;
                try {
                    const codes = await detector.detect(video);
                    if (codes && codes.length > 0) {
                        const val = codes[0].rawValue?.trim();
                        if (val) { this.handleScannedValue(val, resultEl); this.stopStream(); }
                    }
                } catch (e) { /* continue */ }
            }, 500);
        } catch (e) {
            resultEl.innerHTML = '<span style="color:#f87171;">Unable to access camera. Please allow camera permission.</span>';
        }
    }

    private handleScannedValue(val: string, resultEl: Element | null): void {
        const list = this.serials || [];
        // Try to match the scanned value to a serial number (case-insensitive, trimmed).
        const match = list.find(s => s.serialNumber.trim().toUpperCase() === val.toUpperCase())
            || list.find(s => val.toUpperCase().includes(s.serialNumber.trim().toUpperCase()));
        if (!resultEl) return;
        if (match) {
            resultEl.innerHTML = `<div style="color:#059669;font-weight:700;">✔ Verified</div>
                <div style="font-size:0.8125rem;margin-top:4px;">Serial: <strong>${esc(match.serialNumber)}</strong><br/>
                Product: ${esc(match.productTitle || match.sku)}<br/>
                Plant: ${esc(match.plant || '—')} · Status: ${esc(match.status || '—')}</div>`;
        } else {
            resultEl.innerHTML = `<div style="color:#ef4444;font-weight:700;">✖ Not found in system</div>
                <div style="font-size:0.8125rem;margin-top:4px;">Scanned: ${esc(val)}</div>`;
        }
    }

    private stopStream(): void {
        if (this.scanTimer) { clearInterval(this.scanTimer); this.scanTimer = null; }
        if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
        const modalRoot = this.container.querySelector('#serial-modal-root') as HTMLElement;
        const video = modalRoot?.querySelector<HTMLVideoElement>('#scan-video');
        if (video) video.srcObject = null;
    }

    private openViewQRModal(unit: SerializedUnit) {
        const modalRoot = this.container.querySelector('#serial-modal-root') as HTMLElement;
        if (!modalRoot) return;

        const qrValue = `https://verify.kajariabathware.in/sn/${encodeURIComponent(unit.serialNumber)}?sku=${encodeURIComponent(unit.sku)}&plant=${encodeURIComponent(unit.plant || 'KSPL')}`;

        modalRoot.innerHTML = `
        <div class="modal-overlay" style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
            <div class="modal-card" style="background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); width: 100%; max-width: 480px; box-shadow: var(--shadow-md); overflow: hidden; text-align: center;">
                <div class="modal-header" style="padding: 16px 20px; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between;">
                    <h3 style="margin: 0; font-size: 1.125rem; font-weight: 700; color: var(--text-primary);">QR &amp; Serial Inspection</h3>
                    <button class="btn-modal-close" id="btn-close-qr-modal" style="background: none; border: none; font-size: 1.25rem; cursor: pointer; color: var(--text-secondary);">✕</button>
                </div>

                <div class="modal-body" style="padding: 24px 20px; display: flex; flex-direction: column; align-items: center; gap: 16px;">
                    <div style="background: #ffffff; padding: 16px; border-radius: 12px; border: 2px dashed var(--line); display: inline-block;">
                        <!-- QR Code Canvas / SVG Placeholder -->
                        <div style="width: 160px; height: 160px; background: #000; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff; font-family: monospace; font-size: 0.75rem; padding: 8px;">
                            <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg>
                            <span style="font-size: 0.625rem; opacity: 0.8; margin-top: 4px;">SCAN FOR VERIFICATION</span>
                        </div>
                    </div>

                    <div>
                        <div style="font-size: 1.25rem; font-weight: 800; font-family: monospace; color: var(--accent);">
                            ${esc(unit.serialNumber)}
                        </div>
                        <div style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary); margin-top: 4px;">
                            ${esc(unit.productTitle)}
                        </div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary); font-family: monospace;">
                            SKU: ${esc(unit.sku)} | Plant: ${esc(unit.plant || 'KSPL')} | Color: ${esc(unit.color || 'CP')}
                        </div>
                        ${(unit as any).batchNumber ? `
                            <div style="margin-top: 6px;">
                                <span class="nav-item-badge badge-indigo" style="font-family: monospace; font-size: 0.75rem;">Batch: ${esc((unit as any).batchNumber)}</span>
                            </div>
                        ` : ''}
                    </div>

                    <div style="background: var(--surface-muted); padding: 8px 12px; border-radius: 6px; font-size: 0.75rem; font-family: monospace; word-break: break-all; color: var(--text-secondary); width: 100%;">
                        ${esc(qrValue)}
                    </div>
                </div>

                <div class="modal-footer" style="padding: 14px 20px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; background: var(--surface-muted);">
                    <button class="btn btn-outline" id="btn-copy-serial-val">📋 Copy Serial</button>
                    <button class="btn btn-primary" id="btn-print-from-modal">🖨️ Print Label</button>
                </div>
            </div>
        </div>
        `;

        modalRoot.querySelector('#btn-close-qr-modal')?.addEventListener('click', () => { modalRoot.innerHTML = ''; });
        modalRoot.querySelector('#btn-copy-serial-val')?.addEventListener('click', () => {
            navigator.clipboard.writeText(unit.serialNumber);
            alert(`Copied ${unit.serialNumber} to clipboard!`);
        });
        modalRoot.querySelector('#btn-print-from-modal')?.addEventListener('click', () => {
            modalRoot.innerHTML = '';
            this.dispatchToPrint([unit]);
        });
    }

    private dispatchToPrint(units: SerializedUnit[]) {
        if (units.length === 0) {
            alert('Please select at least one serial number to print.');
            return;
        }

        const template = PREBUILT_TEMPLATES.find(t => t.id === 'faucet-serial-sticker') || PREBUILT_TEMPLATES[0];
        const records = units.map(u => ({
            serialNumber: u.serialNumber,
            productCode: u.sku,
            sku: u.sku,
            productTitle: u.productTitle,
            category: u.category,
            plant: u.plant || 'KSPL',
            group: u.group || 'Faucets',
            color: u.color || 'CP',
            warranty: u.warranty || '10 Years',
            mrp: u.mrp || u.price,
            dp: u.dp || u.price,
            batchNumber: (u as any).batchNumber || '',
            date: new Date().toLocaleDateString('en-GB')
        }));

        this.onPrintSerials(template.layout, template.schema, records);
    }

    private exportCSV() {
        if (this.serials.length === 0) {
            alert('No serial numbers to export.');
            return;
        }

        const headers = ['Serial Number', 'SKU', 'Product Name', 'Plant', 'Batch Number', 'Status', 'Color', 'Warranty', 'MRP', 'Print Count', 'Created Date'];
        const rows = this.serials.map(s => [
            s.serialNumber,
            s.sku,
            `"${s.productTitle.replace(/"/g, '""')}"`,
            s.plant || 'KSPL',
            (s as any).batchNumber || '',
            s.status,
            s.color || '',
            s.warranty || '',
            s.mrp || s.price || '',
            s.printCount || 0,
            new Date(s.createdAt).toISOString()
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `serial_numbers_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
