// ════════════════════════════════════════════════════════════════════════════
// GENERATE — create Serial Numbers & Batch Numbers in one place.
// Pick a product (searchable dropdown) + quantity → creates serials under a
// batch number and saves to the database.
// ════════════════════════════════════════════════════════════════════════════

import { supabaseService } from '../supabase';
import { esc } from '../escape';
import { generateAutomatedSerials, getBatchLogicRule, generateBatchNumberPreview } from './serial-batch-logic';
import type { ProductRecord } from './product-manager';

export interface GenerateViewOptions {
    container: HTMLElement;
}

export class GenerateView {
    private container: HTMLElement;
    private products: ProductRecord[] = [];
    private selectedProductId: string = '';
    private quantity = 1;
    private query = '';

    constructor(options: GenerateViewOptions) {
        this.container = options.container;
        this.loadProducts().then(() => this.render());
    }

    private async loadProducts(): Promise<void> {
        const all = await supabaseService.fetchProducts();
        this.products = all || [];
        if (this.products.length > 0) this.selectedProductId = this.products[0].id;
    }

    public render(): void {
        const selected = this.products.find(p => p.id === this.selectedProductId);
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
                        <div style="position:relative;">
                            <input type="text" id="gen-product-search" autocomplete="off"
                                placeholder="🔍 Type to search product (SKU or name)…"
                                value="${esc(this.query)}"
                                style="width:100%;padding:11px 12px;border:1px solid var(--border-color,#cbd5e1);border-radius:9px;font-size:0.875rem;" />
                            <div id="gen-product-list" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border:1px solid var(--border-color,#cbd5e1);border-radius:9px;box-shadow:0 8px 24px rgba(0,0,0,.12);max-height:260px;overflow:auto;z-index:20;">
                                ${this.products.map(p => `
                                    <div class="gen-option" data-id="${esc(p.id)}" data-sku="${esc(p.sku)}" data-title="${esc(p.title)}"
                                        style="padding:9px 12px;cursor:pointer;border-bottom:1px solid #f1f5f9;font-size:0.8125rem;">
                                        <strong>${esc(p.sku)}</strong> — ${esc(p.title)}
                                        <span style="color:var(--text-secondary);font-size:0.72rem;margin-left:6px;">${esc(p.plant || '')}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <div class="form-group">
                        <label style="font-weight:700;">Quantity (number of serials) *</label>
                        <input type="number" id="gen-qty" min="1" max="1000" value="${this.quantity}" />
                    </div>

                    <div id="gen-product-summary" style="background:var(--surface-muted,#f1f5f9);border:1px solid var(--border-color,#e2e8f0);border-radius:10px;padding:12px 16px;font-size:0.8125rem;color:var(--text-secondary);">
                        ${selected ? `<strong style="color:var(--text-primary);">Product:</strong> ${esc(selected.title)}<br/><strong style="color:var(--text-primary);">SKU:</strong> ${esc(selected.sku)} · <strong>Plant:</strong> ${esc(selected.plant || 'KSPL')}` : 'Select a product above.'}
                    </div>

                    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:6px;">
                        <button class="btn btn-primary" id="btn-generate-now" ${this.products.length === 0 ? 'disabled' : ''}>💾 Generate &amp; Save</button>
                    </div>
                </div>
            </div>
        </div>`;

        this.bind();
    }

    private bind(): void {
        const search = this.container.querySelector<HTMLInputElement>('#gen-product-search');
        const list = this.container.querySelector<HTMLElement>('#gen-product-list');

        const showFiltered = (filter: string) => {
            const q = filter.trim().toLowerCase();
            let any = false;
            this.container.querySelectorAll<HTMLElement>('.gen-option').forEach(opt => {
                const sku = (opt.dataset.sku || '').toLowerCase();
                const title = (opt.dataset.title || '').toLowerCase();
                const show = !q || sku.includes(q) || title.includes(q);
                opt.style.display = show ? '' : 'none';
                if (show) any = true;
            });
            if (list) list.style.display = any ? 'block' : 'none';
        };

        search?.addEventListener('focus', () => { if (list) list.style.display = 'block'; });
        search?.addEventListener('input', () => { showFiltered(search.value); });
        search?.addEventListener('blur', () => {
            setTimeout(() => { if (list) list.style.display = 'none'; }, 200);
        });

        this.container.querySelectorAll<HTMLElement>('.gen-option').forEach(opt => {
            opt.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.selectedProductId = opt.dataset.id!;
                this.query = `${opt.dataset.sku} — ${opt.dataset.title}`;
                if (search) search.value = this.query;
                if (list) list.style.display = 'none';
                this.render();
            });
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

        await supabaseService.logAudit({ action: 'create', entityType: 'serial', entityId: batchNumber, entityLabel: `${qty} serials · ${product.sku}` });
        await supabaseService.logAudit({ action: 'create', entityType: 'batch', entityId: batchNumber, entityLabel: `${qty} units · ${product.sku}` });

        alert(`✅ Saved batch ${batchNumber} with ${units.length} serial(s) for ${product.sku}.`);
        this.quantity = 1;
        this.render();
    }

    private loadLocal(key: string): any[] {
        try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : []; } catch { return []; }
    }
    private saveLocal(key: string, list: any[]): void {
        try { localStorage.setItem(key, JSON.stringify(list)); } catch {}
    }
}
