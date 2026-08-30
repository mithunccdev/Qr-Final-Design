// ════════════════════════════════════════════════════════════════════════════
// GENERATE — create Serial Numbers & Batch Numbers in one place.
// Pick a product + quantity → generates serials under a batch number, saves to
// the database, then asks if you want to print now (navigates to Print).
// ════════════════════════════════════════════════════════════════════════════

import { supabaseService } from '../supabase';
import { esc } from '../escape';
import { generateAutomatedSerials, getBatchLogicRule, generateBatchNumberPreview } from './serial-batch-logic';
import type { ProductRecord } from './product-manager';

export interface GenerateViewOptions {
    container: HTMLElement;
    onNavigateToPrint: (records: Record<string, any>[]) => void;
}

export class GenerateView {
    private container: HTMLElement;
    private onNavigateToPrint: (records: Record<string, any>[]) => void;
    private products: ProductRecord[] = [];
    private selectedProductId: string = '';
    private quantity = 1;

    constructor(options: GenerateViewOptions) {
        this.container = options.container;
        this.onNavigateToPrint = options.onNavigateToPrint;
        this.loadProducts().then(() => this.render());
    }

    private async loadProducts(): Promise<void> {
        const all = await supabaseService.fetchProducts();
        this.products = all || [];
        if (this.products.length > 0) this.selectedProductId = this.products[0].id;
    }

    public render(): void {
        const product = this.products.find(p => p.id === this.selectedProductId);
        this.container.innerHTML = `
        <div class="entity-manager-root">
            <div class="manager-card-panel" style="max-width:760px;margin:0 auto;width:100%;">
                <div class="panel-header-row">
                    <div>
                        <h2 class="panel-heading">⚡ Generate Serial &amp; Batch Numbers</h2>
                        <p class="panel-subheading">Select a product and the quantity — a batch number and that many serial numbers are created and saved.</p>
                    </div>
                </div>

                <div style="padding:20px 24px;display:flex;flex-direction:column;gap:16px;">
                    <div class="form-group">
                        <label style="font-weight:700;">Product *</label>
                        <select id="gen-product" class="filter-dropdown" style="width:100%;">
                            ${this.products.length === 0 ? '<option value="">No products available — add one in Products first.</option>' : this.products.map(p => `
                                <option value="${esc(p.id)}" ${p.id === this.selectedProductId ? 'selected' : ''}>${esc(p.sku)} — ${esc(p.title)} (${esc(p.plant || 'KSPL')})</option>
                            `).join('')}
                        </select>
                    </div>

                    <div class="form-group">
                        <label style="font-weight:700;">Quantity (number of serials) *</label>
                        <input type="number" id="gen-qty" min="1" max="1000" value="${this.quantity}" />
                    </div>

                    ${product ? `
                    <div style="background:var(--surface-muted,#f1f5f9);border:1px solid var(--border-color,#e2e8f0);border-radius:10px;padding:12px 16px;font-size:0.8125rem;color:var(--text-secondary);">
                        <strong style="color:var(--text-primary);">Product:</strong> ${esc(product.title)}<br/>
                        <strong style="color:var(--text-primary);">SKU:</strong> ${esc(product.sku)} · <strong>Plant:</strong> ${esc(product.plant || 'KSPL')}
                    </div>
                    ` : ''}

                    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:6px;">
                        <button class="btn btn-primary" id="btn-generate-now" ${this.products.length === 0 ? 'disabled' : ''}>⚡ Generate &amp; Save</button>
                    </div>
                </div>
            </div>
        </div>`;

        this.container.querySelector('#gen-product')?.addEventListener('change', (e) => {
            this.selectedProductId = (e.target as HTMLSelectElement).value;
            this.render();
        });
        this.container.querySelector('#gen-qty')?.addEventListener('input', (e) => {
            this.quantity = Math.max(1, parseInt((e.target as HTMLInputElement).value || '1', 10) || 1);
        });
        this.container.querySelector('#btn-generate-now')?.addEventListener('click', () => void this.generate());
    }

    private async generate(): Promise<void> {
        const product = this.products.find(p => p.id === this.selectedProductId);
        const qty = Math.max(1, this.quantity || 1);
        if (!product) { alert('Please select a product.'); return; }
        if (qty > 1000) { alert('Quantity too large (max 1000).'); return; }

        const plant = product.plant || 'KSPL';
        const batchRule = getBatchLogicRule(plant);
        const batchPreview = generateBatchNumberPreview(batchRule, { plant, product, sequence: (Date.now() % 100000) + 1 });
        const batchNumber = batchPreview.code || `BAT-${Date.now()}`;

        const { units } = generateAutomatedSerials({ product, quantity: qty, batchNumber, plant });

        // Persist to local + DB
        const localSerials = this.loadLocal('qrlayout_db_serials_v2');
        const merged = [...units, ...localSerials.filter(l => !units.some(u => u.id === l.id))];
        this.saveLocal('qrlayout_db_serials_v2', merged);
        void supabaseService.batchSaveSerials(units);

        const batch = {
            id: `bat-${Date.now()}`, batchNumber, productId: product.id, sku: product.sku,
            productTitle: product.title, plant, mfgDate: new Date().toISOString().slice(0, 10),
            expDate: '', lotQuantity: qty, shift: 'General', status: 'Approved' as any,
            createdAt: new Date().toISOString(), printCount: 0
        };
        const localBatches = this.loadLocal('qrlayout_db_batches_v2');
        this.saveLocal('qrlayout_db_batches_v2', [batch, ...localBatches.filter(b => b.batchNumber !== batchNumber)]);
        void supabaseService.saveBatch(batch);

        // Build print records (one per unit)
        const records = units.map(u => ({
            serialNumber: u.serialNumber, batchNumber, sku: u.sku, title: u.productTitle,
            productTitle: u.productTitle, category: u.category, plant: u.plant, color: u.color,
            warranty: u.warranty, ...(u.variables || {})
        }));

        await supabaseService.logAudit({ action: 'create', entityType: 'serial', entityId: batchNumber, entityLabel: `${qty} serials · ${product.sku}` });
        await supabaseService.logAudit({ action: 'create', entityType: 'batch', entityId: batchNumber, entityLabel: `${qty} units · ${product.sku}` });

        if (confirm(`✅ Generated ${units.length} serial(s) for ${product.sku} in batch ${batchNumber}.\n\nPrint the labels now?`)) {
            this.onNavigateToPrint(records);
            return;
        }
        alert(`Saved batch ${batchNumber} with ${units.length} serial(s).`);
    }

    private loadLocal(key: string): any[] {
        try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : []; } catch { return []; }
    }
    private saveLocal(key: string, list: any[]): void {
        try { localStorage.setItem(key, JSON.stringify(list)); } catch {}
    }
}
