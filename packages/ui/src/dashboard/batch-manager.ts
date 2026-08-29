import { StickerLayout } from 'qrlayout-core';
import type { EntitySchema } from '../types';
import { PREBUILT_TEMPLATES } from './templates-data';
import { ProductRecord, SerializedUnit } from './product-manager';
import { getBatchLogicRule, generateBatchNumberPreview } from './serial-batch-logic';
import { esc } from '../escape';
import { canCurrentUser } from './permissions';

export interface BatchRecord {
    id: string;
    batchNumber: string;
    productId?: string;
    sku: string;
    productTitle: string;
    plant: 'KSPL' | 'KGPL' | 'KBPL' | string;
    mfgDate: string;
    expDate?: string;
    lotQuantity: number;
    shift?: 'Shift A' | 'Shift B' | 'Shift C' | 'General' | string;
    machineLine?: string;
    status: 'Approved' | 'In Production' | 'Pending QA' | 'Quarantine' | 'Rejected';
    supervisor?: string;
    notes?: string;
    createdAt: string;
    printCount?: number;
    lastPrintedAt?: string | null;
}

export interface BatchManagerOptions {
    container: HTMLElement;
    onPrintBatchLabels: (layout: StickerLayout, schema: EntitySchema, records: Record<string, any>[]) => void;
    onOpenInDesigner?: (layout: StickerLayout, schema: EntitySchema) => void;
    onGenerateSerialsForBatch?: (batchNumber: string, productId?: string) => void;
}

const STORAGE_KEY_BATCHES = 'qrlayout_db_batches_v2';
const STORAGE_KEY_PRODUCTS = 'qrlayout_db_products_v2';
const STORAGE_KEY_SERIALS = 'qrlayout_db_serials_v2';

export class BatchManagerView {
    private container: HTMLElement;
    private onPrintBatchLabels: (layout: StickerLayout, schema: EntitySchema, records: Record<string, any>[]) => void;
    private onOpenInDesigner?: (layout: StickerLayout, schema: EntitySchema) => void;
    private onGenerateSerialsForBatch?: (batchNumber: string, productId?: string) => void;

    private batches: BatchRecord[] = [];
    private products: ProductRecord[] = [];
    private serials: SerializedUnit[] = [];
    private selectedBatchIds: Set<string> = new Set();
    private searchQuery: string = '';
    private statusFilter: string = 'All';
    private plantFilter: string = 'All';
    private shiftFilter: string = 'All';

    constructor(options: BatchManagerOptions) {
        this.container = options.container;
        this.onPrintBatchLabels = options.onPrintBatchLabels;
        this.onOpenInDesigner = options.onOpenInDesigner;
        this.onGenerateSerialsForBatch = options.onGenerateSerialsForBatch;

        this.loadData();
        this.render();
    }

    public refresh() {
        this.loadData();
        this.render();
    }

    private loadData() {
        try {
            const rawBatches = localStorage.getItem(STORAGE_KEY_BATCHES);
            if (rawBatches) {
                this.batches = JSON.parse(rawBatches);
            } else {
                this.batches = this.getSampleBatches();
                this.saveBatches();
            }

            const rawProducts = localStorage.getItem(STORAGE_KEY_PRODUCTS) || localStorage.getItem('qrlayout_db_products');
            if (rawProducts) {
                this.products = JSON.parse(rawProducts);
            }

            const rawSerials = localStorage.getItem(STORAGE_KEY_SERIALS) || localStorage.getItem('qrlayout_db_serials');
            if (rawSerials) {
                this.serials = JSON.parse(rawSerials);
            }
        } catch (e) {
            console.error('Error loading batches:', e);
            this.batches = this.getSampleBatches();
        }
    }

    private saveBatches() {
        localStorage.setItem(STORAGE_KEY_BATCHES, JSON.stringify(this.batches));
    }

    private getSampleBatches(): BatchRecord[] {
        const today = new Date().toISOString().slice(0, 10);
        return [
            {
                id: 'bat-001',
                batchNumber: 'BAT-202608-001',
                productId: 'p-1',
                sku: 'FAUC-KS-01',
                productTitle: 'Single Lever Basin Mixer - Chrome',
                plant: 'KSPL',
                mfgDate: '2026-08-20',
                expDate: '2036-08-20',
                lotQuantity: 500,
                shift: 'Shift A',
                machineLine: 'CNC Line 02',
                status: 'Approved',
                supervisor: 'Rajesh Sharma',
                notes: 'Quality inspected. Pass all pressure tests up to 10 bar.',
                createdAt: new Date(Date.now() - 86400000 * 8).toISOString(),
                printCount: 12
            },
            {
                id: 'bat-002',
                batchNumber: 'BAT-202608-002',
                productId: 'p-2',
                sku: 'BATH-KG-W02',
                productTitle: 'Rimless Wall Hung Water Closet',
                plant: 'KGPL',
                mfgDate: '2026-08-22',
                expDate: '2036-08-22',
                lotQuantity: 300,
                shift: 'Shift B',
                machineLine: 'Kiln Line 04',
                status: 'In Production',
                supervisor: 'Anil Verma',
                notes: 'Firing cycle complete. Awaiting final glaze inspection.',
                createdAt: new Date(Date.now() - 86400000 * 6).toISOString(),
                printCount: 4
            },
            {
                id: 'bat-003',
                batchNumber: 'BAT-202608-003',
                productId: 'p-3',
                sku: 'SHWR-KB-G05',
                productTitle: 'Thermostatic Diverter - Matte Black',
                plant: 'KBPL',
                mfgDate: '2026-08-25',
                expDate: '2036-08-25',
                lotQuantity: 250,
                shift: 'Shift C',
                machineLine: 'Assembly 01',
                status: 'Pending QA',
                supervisor: 'Sunil Kumar',
                notes: 'Batch coating in progress.',
                createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
                printCount: 0
            }
        ];
    }

    public render() {
        const total = this.batches.length;
        const approved = this.batches.filter(b => b.status === 'Approved').length;
        const inProd = this.batches.filter(b => b.status === 'In Production').length;
        const pendingQA = this.batches.filter(b => b.status === 'Pending QA').length;
        const totalUnits = this.batches.reduce((sum, b) => sum + (b.lotQuantity || 0), 0);

        const filtered = this.batches.filter(b => {
            const q = this.searchQuery.toLowerCase();
            const matchesQuery = !q ||
                b.batchNumber.toLowerCase().includes(q) ||
                b.sku.toLowerCase().includes(q) ||
                b.productTitle.toLowerCase().includes(q) ||
                (b.supervisor && b.supervisor.toLowerCase().includes(q)) ||
                (b.machineLine && b.machineLine.toLowerCase().includes(q));

            const matchesStatus = this.statusFilter === 'All' || b.status === this.statusFilter;
            const matchesPlant = this.plantFilter === 'All' || b.plant === this.plantFilter;
            const matchesShift = this.shiftFilter === 'All' || b.shift === this.shiftFilter;

            return matchesQuery && matchesStatus && matchesPlant && matchesShift;
        });

        this.container.innerHTML = `
        <div class="entity-manager-root">
            <!-- HEADER -->
            <div class="manager-card-panel">
                <div class="panel-header-row" style="align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 1.5rem;">📦</span>
                            <div>
                                <h2 class="panel-heading" style="margin: 0;">Batch Numbers &amp; Production Lots</h2>
                                <p class="panel-subheading" style="margin: 2px 0 0 0;">Manage manufacturing batch codes, lot sizes, QA status, and print pallet/master carton tags.</p>
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                        <button class="btn btn-outline" id="btn-export-batches-csv" title="Export batch list to CSV">
                            📥 Export CSV
                        </button>
                        <button class="btn btn-outline" id="btn-print-selected-batches" style="${this.selectedBatchIds.size > 0 ? 'border-color: var(--accent); color: var(--accent);' : ''}">
                            🖨️ Print Batch Labels (${this.selectedBatchIds.size})
                        </button>
                        ${canCurrentUser('batches', 'create') ? `
                        <button class="btn btn-primary" id="btn-open-create-batch-modal">
                            ➕ Create New Batch
                        </button>
                        ` : ''}
                    </div>
                </div>

                <!-- STATS CARDS -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 20px;">
                    <div class="stat-pill-box">
                        <span class="stat-pill-label">Total Batches</span>
                        <span class="stat-pill-val">${total}</span>
                    </div>
                    <div class="stat-pill-box">
                        <span class="stat-pill-label">QA Approved</span>
                        <span class="stat-pill-val" style="color: #10b981;">${approved}</span>
                    </div>
                    <div class="stat-pill-box">
                        <span class="stat-pill-label">In Production</span>
                        <span class="stat-pill-val" style="color: #0284c7;">${inProd}</span>
                    </div>
                    <div class="stat-pill-box">
                        <span class="stat-pill-label">Pending QA</span>
                        <span class="stat-pill-val" style="color: #f59e0b;">${pendingQA}</span>
                    </div>
                    <div class="stat-pill-box">
                        <span class="stat-pill-label">Total Lot Quantity</span>
                        <span class="stat-pill-val" style="color: #6366f1;">${totalUnits.toLocaleString()} units</span>
                    </div>
                </div>

                <!-- SEARCH & FILTERS -->
                <div style="display: flex; gap: 12px; margin-top: 20px; align-items: center; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 220px; position: relative;">
                        <input type="text" id="batches-search-input" class="search-input-field" placeholder="Search batch #, product SKU, line, supervisor..." value="${this.searchQuery}" style="width: 100%; padding-left: 32px;" />
                        <svg style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); opacity: 0.5;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                    </div>

                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <select id="filter-batch-status" class="filter-dropdown">
                            <option value="All" ${this.statusFilter === 'All' ? 'selected' : ''}>All Statuses</option>
                            <option value="Approved" ${this.statusFilter === 'Approved' ? 'selected' : ''}>Approved</option>
                            <option value="In Production" ${this.statusFilter === 'In Production' ? 'selected' : ''}>In Production</option>
                            <option value="Pending QA" ${this.statusFilter === 'Pending QA' ? 'selected' : ''}>Pending QA</option>
                            <option value="Quarantine" ${this.statusFilter === 'Quarantine' ? 'selected' : ''}>Quarantine</option>
                            <option value="Rejected" ${this.statusFilter === 'Rejected' ? 'selected' : ''}>Rejected</option>
                        </select>

                        <select id="filter-batch-plant" class="filter-dropdown">
                            <option value="All" ${this.plantFilter === 'All' ? 'selected' : ''}>All Plants</option>
                            <option value="KSPL" ${this.plantFilter === 'KSPL' ? 'selected' : ''}>KSPL</option>
                            <option value="KGPL" ${this.plantFilter === 'KGPL' ? 'selected' : ''}>KGPL</option>
                            <option value="KBPL" ${this.plantFilter === 'KBPL' ? 'selected' : ''}>KBPL</option>
                        </select>

                        <select id="filter-batch-shift" class="filter-dropdown">
                            <option value="All" ${this.shiftFilter === 'All' ? 'selected' : ''}>All Shifts</option>
                            <option value="Shift A" ${this.shiftFilter === 'Shift A' ? 'selected' : ''}>Shift A</option>
                            <option value="Shift B" ${this.shiftFilter === 'Shift B' ? 'selected' : ''}>Shift B</option>
                            <option value="Shift C" ${this.shiftFilter === 'Shift C' ? 'selected' : ''}>Shift C</option>
                            <option value="General" ${this.shiftFilter === 'General' ? 'selected' : ''}>General</option>
                        </select>
                    </div>
                </div>

                <!-- TABLE VIEW -->
                <div class="manager-table-wrapper" style="margin-top: 16px;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th style="width: 40px;">
                                    <input type="checkbox" id="chk-select-all-batches" ${filtered.length > 0 && filtered.every(b => this.selectedBatchIds.has(b.id)) ? 'checked' : ''} />
                                </th>
                                <th>Batch Code</th>
                                <th>Product SKU &amp; Name</th>
                                <th>Plant</th>
                                <th>Mfg / Exp Date</th>
                                <th>Lot Qty</th>
                                <th>Shift &amp; Line</th>
                                <th>Status</th>
                                <th>Serials Created</th>
                                <th style="text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filtered.length === 0 ? `
                                <tr>
                                    <td colspan="10" style="text-align: center; padding: 48px; color: var(--text-secondary);">
                                        <div style="font-size: 2rem; margin-bottom: 8px;">📦</div>
                                        <div style="font-weight: 600; color: var(--text-primary);">No batch records found</div>
                                        <div style="font-size: 0.8125rem; margin-top: 4px;">Create your first production batch to start tracking lots.</div>
                                    </td>
                                </tr>
                            ` : filtered.map(b => {
                                const isChecked = this.selectedBatchIds.has(b.id);
                                const serialCount = this.serials.filter(s => (s as any).batchNumber === b.batchNumber).length;
                                return `
                                <tr class="${isChecked ? 'row-selected' : ''}" data-id="${b.id}">
                                    <td>
                                        <input type="checkbox" class="chk-batch-item" data-id="${b.id}" ${isChecked ? 'checked' : ''} />
                                    </td>
                                    <td>
                                        <span class="code-badge-pill" style="font-weight: 700; font-family: monospace; font-size: 0.875rem; color: #4f46e5; background: rgba(79, 70, 229, 0.08); padding: 4px 8px; border-radius: 6px;">
                                            ${b.batchNumber}
                                        </span>
                                    </td>
                                    <td>
                                        <div>
                                            <div style="font-weight: 600; color: var(--text-primary); font-size: 0.875rem;">${b.productTitle}</div>
                                            <div style="font-size: 0.75rem; font-family: monospace; color: var(--text-secondary);">${b.sku}</div>
                                        </div>
                                    </td>
                                    <td>
                                        <span class="nav-item-badge badge-neutral" style="font-size: 0.75rem;">${b.plant || 'KSPL'}</span>
                                    </td>
                                    <td style="font-size: 0.8125rem;">
                                        <div>MFG: <strong>${b.mfgDate}</strong></div>
                                        ${b.expDate ? `<div style="color: var(--text-secondary); font-size: 0.75rem;">EXP: ${b.expDate}</div>` : ''}
                                    </td>
                                    <td>
                                        <span style="font-weight: 700; font-size: 0.875rem; color: var(--text-primary);">${b.lotQuantity.toLocaleString()}</span>
                                        <span style="font-size: 0.75rem; color: var(--text-secondary);"> units</span>
                                    </td>
                                    <td style="font-size: 0.8125rem;">
                                        <div>${b.shift || 'General'}</div>
                                        <div style="color: var(--text-secondary); font-size: 0.75rem;">${b.machineLine || '—'}</div>
                                    </td>
                                    <td>
                                        ${this.renderBatchStatus(b.status)}
                                    </td>
                                    <td>
                                        <span class="nav-item-badge ${serialCount > 0 ? 'badge-indigo' : 'badge-neutral'}">
                                            🔢 ${serialCount} serials
                                        </span>
                                    </td>
                                    <td style="text-align: right;">
                                        <div style="display: flex; gap: 6px; justify-content: flex-end;">
                                            <button class="btn btn-sm btn-outline btn-print-batch-label" data-id="${b.id}" title="Print Batch / Pallet Tag">
                                                🖨️ Label
                                            </button>
                                            <button class="btn btn-sm btn-outline btn-gen-serials-for-batch" data-id="${b.id}" title="Generate Serials for this Batch" style="color: #4f46e5; border-color: #c7d2fe;">
                                                ➕ Serials
                                            </button>
                                            <button class="btn btn-sm btn-outline btn-edit-batch" data-id="${b.id}" title="Edit Batch Details">
                                                ✏️
                                            </button>
                                            <button class="btn btn-sm btn-outline btn-delete-batch" data-id="${b.id}" title="Delete Batch" style="color: #ef4444; border-color: #fee2e2;">
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
            </div>
        </div>

        <div id="batch-modal-root"></div>
        `;

        this.bindEvents();
    }

    private renderBatchStatus(status: string): string {
        switch (status) {
            case 'Approved':
                return '<span class="nav-item-badge badge-emerald">✓ Approved</span>';
            case 'In Production':
                return '<span class="nav-item-badge badge-cyan">⚙️ In Production</span>';
            case 'Pending QA':
                return '<span class="nav-item-badge badge-amber">⏳ Pending QA</span>';
            case 'Quarantine':
                return '<span class="nav-item-badge badge-indigo">⚠️ Quarantine</span>';
            case 'Rejected':
                return '<span class="nav-item-badge badge-neutral" style="color: #ef4444; background: #fee2e2;">✕ Rejected</span>';
            default:
                return `<span class="nav-item-badge badge-neutral">${status}</span>`;
        }
    }

    private bindEvents() {
        // Search
        const searchInput = this.container.querySelector('#batches-search-input') as HTMLInputElement;
        searchInput?.addEventListener('input', (e) => {
            this.searchQuery = (e.target as HTMLInputElement).value;
            this.render();
            const updated = this.container.querySelector('#batches-search-input') as HTMLInputElement;
            if (updated) {
                updated.focus();
                updated.setSelectionRange(this.searchQuery.length, this.searchQuery.length);
            }
        });

        // Filters
        this.container.querySelector('#filter-batch-status')?.addEventListener('change', (e) => {
            this.statusFilter = (e.target as HTMLSelectElement).value;
            this.render();
        });
        this.container.querySelector('#filter-batch-plant')?.addEventListener('change', (e) => {
            this.plantFilter = (e.target as HTMLSelectElement).value;
            this.render();
        });
        this.container.querySelector('#filter-batch-shift')?.addEventListener('change', (e) => {
            this.shiftFilter = (e.target as HTMLSelectElement).value;
            this.render();
        });

        // Checkbox select all
        this.container.querySelector('#chk-select-all-batches')?.addEventListener('change', (e) => {
            const checked = (e.target as HTMLInputElement).checked;
            if (checked) {
                this.batches.forEach(b => this.selectedBatchIds.add(b.id));
            } else {
                this.selectedBatchIds.clear();
            }
            this.render();
        });

        // Checkbox items
        this.container.querySelectorAll<HTMLInputElement>('.chk-batch-item').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const id = (e.target as HTMLInputElement).dataset.id;
                if (id) {
                    if ((e.target as HTMLInputElement).checked) {
                        this.selectedBatchIds.add(id);
                    } else {
                        this.selectedBatchIds.delete(id);
                    }
                    this.render();
                }
            });
        });

        // Create Modal
        this.container.querySelector('#btn-open-create-batch-modal')?.addEventListener('click', () => {
            this.openBatchModal();
        });

        // Export CSV
        this.container.querySelector('#btn-export-batches-csv')?.addEventListener('click', () => {
            this.exportCSV();
        });

        // Print Selected
        this.container.querySelector('#btn-print-selected-batches')?.addEventListener('click', () => {
            const targets = this.selectedBatchIds.size > 0
                ? this.batches.filter(b => this.selectedBatchIds.has(b.id))
                : this.batches;
            this.dispatchBatchPrint(targets);
        });

        // Print Single Batch
        this.container.querySelectorAll<HTMLButtonElement>('.btn-print-batch-label').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const batch = this.batches.find(b => b.id === id);
                if (batch) {
                    batch.printCount = (batch.printCount || 0) + 1;
                    batch.lastPrintedAt = new Date().toISOString();
                    this.saveBatches();
                    this.dispatchBatchPrint([batch]);
                }
            });
        });

        // Generate Serials for this batch
        this.container.querySelectorAll<HTMLButtonElement>('.btn-gen-serials-for-batch').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const batch = this.batches.find(b => b.id === id);
                if (batch && this.onGenerateSerialsForBatch) {
                    this.onGenerateSerialsForBatch(batch.batchNumber, batch.productId);
                }
            });
        });

        // Edit Batch
        this.container.querySelectorAll<HTMLButtonElement>('.btn-edit-batch').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const batch = this.batches.find(b => b.id === id);
                if (batch) this.openBatchModal(batch);
            });
        });

        // Delete Batch
        this.container.querySelectorAll<HTMLButtonElement>('.btn-delete-batch').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                if (id && confirm('Delete this batch record?')) {
                    this.batches = this.batches.filter(b => b.id !== id);
                    this.selectedBatchIds.delete(id);
                    this.saveBatches();
                    this.render();
                }
            });
        });
    }

    private openBatchModal(existingBatch?: BatchRecord) {
        const modalRoot = this.container.querySelector('#batch-modal-root') as HTMLElement;
        if (!modalRoot) return;

        const isEdit = Boolean(existingBatch);
        const defaultProd = this.products.find(p => p.id === existingBatch?.productId) || this.products[0];
        const plant = existingBatch?.plant || defaultProd?.plant || 'KSPL';
        const rule = getBatchLogicRule(plant);
        const preview = generateBatchNumberPreview(rule, {
            plant,
            product: defaultProd,
            sequence: this.batches.length + 1
        });
        const defaultBatchCode = existingBatch?.batchNumber || preview.code;

        modalRoot.innerHTML = `
        <div class="modal-overlay" style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
            <div class="modal-card" style="background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); width: 100%; max-width: 620px; box-shadow: var(--shadow-md); overflow: hidden;">
                <div class="modal-header" style="padding: 16px 20px; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1.25rem;">📦</span>
                        <h3 style="margin: 0; font-size: 1.125rem; font-weight: 700; color: var(--text-primary);">${isEdit ? 'Edit Batch Record' : 'Create New Batch / Lot'}</h3>
                    </div>
                    <button class="btn-modal-close" id="btn-close-batch-modal" style="background: none; border: none; font-size: 1.25rem; cursor: pointer; color: var(--text-secondary);">✕</button>
                </div>

                <div class="modal-body" style="padding: 20px; display: flex; flex-direction: column; gap: 14px; max-height: 80vh; overflow-y: auto;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div class="form-group">
                            <label style="font-weight: 700; font-size: 0.8125rem;">Batch Code / Lot Number *</label>
                            <input type="text" id="bm-batch-code" value="${defaultBatchCode}" style="width: 100%; font-family: monospace; font-weight: 700;" />
                        </div>
                        <div class="form-group">
                            <label style="font-weight: 700; font-size: 0.8125rem;">Manufacturing Plant *</label>
                            <select id="bm-plant" class="filter-dropdown" style="width: 100%;">
                                <option value="KSPL" ${plant === 'KSPL' ? 'selected' : ''}>KSPL - Kajaria Sanitaryware</option>
                                <option value="KGPL" ${plant === 'KGPL' ? 'selected' : ''}>KGPL - Kajaria Gailpur</option>
                                <option value="KBPL" ${plant === 'KBPL' ? 'selected' : ''}>KBPL - Kajaria Bathware</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-group">
                        <label style="font-weight: 700; font-size: 0.8125rem;">Target Product *</label>
                        <select id="bm-product" class="filter-dropdown" style="width: 100%;">
                            ${this.products.map(p => `
                                <option value="${esc(p.id)}" ${p.id === (existingBatch?.productId || defaultProd?.id) ? 'selected' : ''}>
                                    ${esc(p.sku)} — ${esc(p.title)}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                        <div class="form-group">
                            <label style="font-weight: 700; font-size: 0.8125rem;">Lot Quantity *</label>
                            <input type="number" id="bm-lot-qty" min="1" value="${existingBatch?.lotQuantity || 500}" style="width: 100%; font-weight: 700;" />
                        </div>
                        <div class="form-group">
                            <label style="font-weight: 700; font-size: 0.8125rem;">Mfg Date *</label>
                            <input type="date" id="bm-mfg-date" value="${existingBatch?.mfgDate || new Date().toISOString().slice(0, 10)}" style="width: 100%;" />
                        </div>
                        <div class="form-group">
                            <label style="font-weight: 700; font-size: 0.8125rem;">Exp Date</label>
                            <input type="date" id="bm-exp-date" value="${existingBatch?.expDate || ''}" style="width: 100%;" />
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div class="form-group">
                            <label style="font-weight: 700; font-size: 0.8125rem;">Production Shift</label>
                            <select id="bm-shift" class="filter-dropdown" style="width: 100%;">
                                <option value="Shift A" ${existingBatch?.shift === 'Shift A' ? 'selected' : ''}>Shift A (Morning)</option>
                                <option value="Shift B" ${existingBatch?.shift === 'Shift B' ? 'selected' : ''}>Shift B (Evening)</option>
                                <option value="Shift C" ${existingBatch?.shift === 'Shift C' ? 'selected' : ''}>Shift C (Night)</option>
                                <option value="General" ${existingBatch?.shift === 'General' ? 'selected' : ''}>General Shift</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label style="font-weight: 700; font-size: 0.8125rem;">Line / Machine</label>
                            <input type="text" id="bm-line" placeholder="e.g. Line 02 / CNC A" value="${existingBatch?.machineLine || ''}" style="width: 100%;" />
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div class="form-group">
                            <label style="font-weight: 700; font-size: 0.8125rem;">Quality Status</label>
                            <select id="bm-status" class="filter-dropdown" style="width: 100%;">
                                <option value="Approved" ${existingBatch?.status === 'Approved' ? 'selected' : ''}>Approved</option>
                                <option value="In Production" ${existingBatch?.status === 'In Production' ? 'selected' : ''}>In Production</option>
                                <option value="Pending QA" ${existingBatch?.status === 'Pending QA' ? 'selected' : ''}>Pending QA</option>
                                <option value="Quarantine" ${existingBatch?.status === 'Quarantine' ? 'selected' : ''}>Quarantine</option>
                                <option value="Rejected" ${existingBatch?.status === 'Rejected' ? 'selected' : ''}>Rejected</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label style="font-weight: 700; font-size: 0.8125rem;">Supervisor</label>
                            <input type="text" id="bm-supervisor" placeholder="Supervisor Name" value="${existingBatch?.supervisor || ''}" style="width: 100%;" />
                        </div>
                    </div>

                    <div class="form-group">
                        <label style="font-weight: 700; font-size: 0.8125rem;">Production &amp; QA Notes</label>
                        <textarea id="bm-notes" rows="2" style="width: 100%; font-family: inherit; font-size: 0.8125rem; border: 1px solid var(--line); border-radius: 6px; padding: 8px;">${existingBatch?.notes || ''}</textarea>
                    </div>
                </div>

                <div class="modal-footer" style="padding: 16px 20px; border-top: 1px solid var(--line); display: flex; justify-content: flex-end; gap: 10px; background: var(--surface-muted);">
                    <button class="btn btn-outline" id="btn-cancel-batch-modal">Cancel</button>
                    <button class="btn btn-primary" id="btn-save-batch-submit">💾 ${isEdit ? 'Save Changes' : 'Create Batch'}</button>
                </div>
            </div>
        </div>
        `;

        modalRoot.querySelector('#btn-close-batch-modal')?.addEventListener('click', () => { modalRoot.innerHTML = ''; });
        modalRoot.querySelector('#btn-cancel-batch-modal')?.addEventListener('click', () => { modalRoot.innerHTML = ''; });

        modalRoot.querySelector('#btn-save-batch-submit')?.addEventListener('click', () => {
            const batchCode = (modalRoot.querySelector('#bm-batch-code') as HTMLInputElement).value.trim();
            const plant = (modalRoot.querySelector('#bm-plant') as HTMLSelectElement).value;
            const pid = (modalRoot.querySelector('#bm-product') as HTMLSelectElement).value;
            const prod = this.products.find(p => p.id === pid);
            const lotQty = parseInt((modalRoot.querySelector('#bm-lot-qty') as HTMLInputElement).value, 10) || 1;
            const mfgDate = (modalRoot.querySelector('#bm-mfg-date') as HTMLInputElement).value;
            const expDate = (modalRoot.querySelector('#bm-exp-date') as HTMLInputElement).value;
            const shift = (modalRoot.querySelector('#bm-shift') as HTMLSelectElement).value;
            const machineLine = (modalRoot.querySelector('#bm-line') as HTMLInputElement).value.trim();
            const status = (modalRoot.querySelector('#bm-status') as HTMLSelectElement).value as any;
            const supervisor = (modalRoot.querySelector('#bm-supervisor') as HTMLInputElement).value.trim();
            const notes = (modalRoot.querySelector('#bm-notes') as HTMLTextAreaElement).value.trim();

            if (!batchCode) {
                alert('Please enter a valid batch code.');
                return;
            }

            if (isEdit && existingBatch) {
                existingBatch.batchNumber = batchCode;
                existingBatch.plant = plant;
                existingBatch.productId = pid;
                existingBatch.sku = prod ? prod.sku : existingBatch.sku;
                existingBatch.productTitle = prod ? prod.title : existingBatch.productTitle;
                existingBatch.lotQuantity = lotQty;
                existingBatch.mfgDate = mfgDate;
                existingBatch.expDate = expDate;
                existingBatch.shift = shift;
                existingBatch.machineLine = machineLine;
                existingBatch.status = status;
                existingBatch.supervisor = supervisor;
                existingBatch.notes = notes;
            } else {
                const newBatch: BatchRecord = {
                    id: `bat-${Date.now()}`,
                    batchNumber: batchCode,
                    productId: pid,
                    sku: prod ? prod.sku : 'SKU-UNKNOWN',
                    productTitle: prod ? prod.title : 'General Product',
                    plant,
                    lotQuantity: lotQty,
                    mfgDate,
                    expDate,
                    shift,
                    machineLine,
                    status,
                    supervisor,
                    notes,
                    createdAt: new Date().toISOString(),
                    printCount: 0
                };
                this.batches.unshift(newBatch);
            }

            this.saveBatches();
            modalRoot.innerHTML = '';
            this.render();
        });
    }

    private dispatchBatchPrint(batches: BatchRecord[]) {
        if (batches.length === 0) {
            alert('Please select at least one batch to print labels.');
            return;
        }

        const template = PREBUILT_TEMPLATES.find(t => t.id === 'warehouse-pallet-tag') || PREBUILT_TEMPLATES[0];
        const records = batches.map(b => ({
            batchNumber: b.batchNumber,
            productCode: b.sku,
            sku: b.sku,
            productTitle: b.productTitle,
            plant: b.plant || 'KSPL',
            lotQuantity: b.lotQuantity,
            mfgDate: b.mfgDate,
            expDate: b.expDate || 'N/A',
            shift: b.shift || 'General',
            machineLine: b.machineLine || '—',
            supervisor: b.supervisor || 'QA Team',
            status: b.status,
            date: new Date().toLocaleDateString('en-GB')
        }));

        this.onPrintBatchLabels(template.layout, template.schema, records);
    }

    private exportCSV() {
        if (this.batches.length === 0) {
            alert('No batches to export.');
            return;
        }

        const headers = ['Batch Code', 'Product SKU', 'Product Name', 'Plant', 'Mfg Date', 'Exp Date', 'Lot Quantity', 'Shift', 'Machine Line', 'Status', 'Supervisor', 'Notes'];
        const rows = this.batches.map(b => [
            b.batchNumber,
            b.sku,
            `"${b.productTitle.replace(/"/g, '""')}"`,
            b.plant,
            b.mfgDate,
            b.expDate || '',
            b.lotQuantity,
            b.shift || '',
            b.machineLine || '',
            b.status,
            `"${(b.supervisor || '').replace(/"/g, '""')}"`,
            `"${(b.notes || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `batch_records_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
