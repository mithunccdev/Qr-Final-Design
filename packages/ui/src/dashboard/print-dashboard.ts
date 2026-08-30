import { StickerLayout } from 'qrlayout-core';
import type { EntitySchema } from '../types';
import { PREBUILT_TEMPLATES, PrebuiltTemplate, TemplateCategoryType } from './templates-data';
import { SHEET_PRESETS, SheetPreset } from './print-sheet-presets';
import { BatchSheetRenderer } from './print-sheet-renderer';
import {
    PRINTER_TYPES,
    PrinterId,
    LabelMediaDef,
    getMediaForPrinter,
    getMediaById,
    getMediaBySize,
    formatLabelSize,
    mediaToPresetFields,
    buildPrinterContext
} from './print-media';
import type { ProductRecord } from './product-manager';
import {
    generateAutomatedSerials,
    getBatchLogicRule,
    generateBatchNumberPreview
} from './serial-batch-logic';
import { getMasterData } from './master-data';
import { supabaseService, UserProfile } from '../supabase';

// ── Batch number helper ──────────────────────────────────────────────────────
function generateBatchNumber(sku: string): string {
    const now = new Date();
    const date = now.getFullYear().toString() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0');
    const seq = Math.floor(Math.random() * 9000) + 1000;
    return `BATCH-${(sku || 'GEN').toUpperCase()}-${date}-${seq}`;
}

export interface PrintDashboardOptions {
    container: HTMLElement;
    initialLayout: StickerLayout;
    entitySchemas: Record<string, EntitySchema>;
    onOpenDesigner?: (layout: StickerLayout) => void;
    /** Templates available to choose from (built-in + custom). Defaults to built-ins. */
    availableTemplates?: PrebuiltTemplate[];
    /** Categories the current user may print (['All'] = unrestricted). */
    allowedCategories?: (TemplateCategoryType | 'All')[];
    /** The currently logged-in user (for plant-based product filtering). */
    currentUser?: UserProfile;
}

export class QRPrintDashboard {
    private container: HTMLElement;
    private currentLayout: StickerLayout;
    private entitySchemas: Record<string, EntitySchema>;
    private onOpenDesigner?: (layout: StickerLayout) => void;
    private availableTemplates: PrebuiltTemplate[];
    private allowedCategories: (TemplateCategoryType | 'All')[];
    private currentUser?: UserProfile;

    private dataset: Record<string, any>[] = [];
    private selectedIndices: Set<number> = new Set();
    private activePreset: SheetPreset;
    private currentSheetIndex = 0;
    private zoomLevel = 1.0;
    private startOffset = 0;
    private showCutMarks = true;
    private showBorderOutlines = true;
    private showNumberBadge = true;
    private activeTab: 'data' | 'sheet' = 'data';
    private searchQuery = '';
    private selectedPrinterType: PrinterId = 'zebra-desktop';
    private selectedMediaId: string = '';

    // Preview & product state
    private showPreview = false;
    private products: ProductRecord[] = [];
    private selectedProductId: string = '';
    private batchNumber: string = '';
    private productSearchQuery: string = '';
    private comboOpen = false;
    private serialQty = 1;

    private printers: any[] = [];
    private selectedPrinterId: string = '';

    private renderer: BatchSheetRenderer;
    private sheetCanvas!: HTMLCanvasElement;
    private previewContainer!: HTMLElement;

    constructor(options: PrintDashboardOptions) {
        this.container = options.container;
        this.currentLayout = options.initialLayout;
        this.entitySchemas = options.entitySchemas;
        this.onOpenDesigner = options.onOpenDesigner;
        this.allowedCategories = options.allowedCategories || ['All'];
        this.currentUser = options.currentUser;
        this.availableTemplates = (options.availableTemplates && options.availableTemplates.length > 0)
            ? options.availableTemplates
            : PREBUILT_TEMPLATES;

        this.renderer = new BatchSheetRenderer();
        this.activePreset = this.matchInitialPreset();
        this.matchPrinterAndMedia();
        this.initDefaultDataset();

        // Load products filtered by user's plants, then render
        this.loadProducts().then(() => this.render());
        // Load printers (device presets) + saved default selections
        void supabaseService.fetchPrinters().then(list => {
            if (list && list.length > 0) {
                this.printers = list;
                this.selectedPrinterId = this.loadDefault('quick.print.printer') || list.find(p => p.is_default)?.id || list[0].id;
                this.render();
            }
        });
    }

    /** Load products from Supabase, filtered by the current user's allowedPlants */
    private async loadProducts(): Promise<void> {
        const all = await supabaseService.fetchProducts();
        if (!all) { this.products = []; return; }

        const userPlants = this.currentUser?.allowedPlants || ['All'];
        const isAdmin = this.currentUser?.role === 'admin';
        const allowAll = isAdmin || userPlants.includes('All');

        this.products = allowAll
            ? all
            : all.filter(p => userPlants.includes(p.plant || ''));
    }

    /** Persisted "quick print" defaults so the user can just press Print next time. */
    private loadDefault(key: string): string {
        try { return localStorage.getItem(key) || ''; } catch { return ''; }
    }
    private saveDefault(key: string, value: string): void {
        try { localStorage.setItem(key, value); } catch {}
    }

    /**
     * Generate batch data (one row per unit) with sequential serial numbers for the
     * selected product, all under a single unique batch number. Persists to local
     * + Supabase. Only one product is batch-printed at a time.
     */
    private async generateSerialsForProduct() {
        const product = this.products.find(p => p.id === this.selectedProductId);
        const qty = Math.max(1, parseInt((this.container.querySelector('#print-serial-qty') as HTMLInputElement)?.value || '1', 10) || 1);
        if (!product) { alert('Please select a product to generate serial numbers.'); return; }
        if (qty > 1000) { alert('Quantity too large (max 1000).'); return; }

        const plant = product.plant || 'KSPL';
        const batchRule = getBatchLogicRule(plant);
        const batchPreview = generateBatchNumberPreview(batchRule, { plant, product, sequence: Date.now() % 100000 + 1 });
        const batchNumber = batchPreview.code || `BAT-${Date.now()}`;

        const { units } = generateAutomatedSerials({ product, quantity: qty, batchNumber, plant });

        // Update local serials store (serial page reads it) + DB.
        const localSerials = this.loadLocalSerials();
        const merged = [...units, ...localSerials.filter(l => !units.some(u => u.id === l.id))];
        this.saveLocalSerials(merged);
        void supabaseService.batchSaveSerials(units);

        // Record the batch (batch page reads it) + DB.
        const batch = {
            id: `bat-${Date.now()}`,
            batchNumber,
            productId: product.id,
            sku: product.sku,
            productTitle: product.title,
            plant,
            mfgDate: new Date().toISOString().slice(0, 10),
            expDate: '',
            lotQuantity: qty,
            shift: 'General',
            status: 'Approved' as any,
            createdAt: new Date().toISOString(),
            printCount: 0
        };
        const localBatches = this.loadLocalBatches();
        this.saveLocalBatches([batch, ...localBatches.filter(b => b.batchNumber !== batchNumber)]);
        void supabaseService.saveBatch(batch);

        // Build the batch dataset rows (one per unit) so the print preview shows them.
        this.dataset = units.map(u => ({
            serialNumber: u.serialNumber,
            batchNumber,
            sku: u.sku,
            title: u.productTitle,
            productTitle: u.productTitle,
            category: u.category,
            plant: u.plant,
            color: u.color,
            warranty: u.warranty,
            ...(u.variables || {})
        }));
        this.batchNumber = batchNumber;
        this.selectAll();
        this.currentSheetIndex = 0;
        this.render();
        alert(`✅ Generated ${units.length} serial(s) for ${product.sku} in batch ${batchNumber}.`);
    }

    /** "Quick Print": records a print job for the selected records (respects per-row qty). */
    private quickPrint(): void {
        const printerEl = this.container.querySelector<HTMLSelectElement>('#bp-printer');
        const printer = this.printers.find(p => p.id === (printerEl?.value || this.selectedPrinterId));
        const dpi = printer?.dpi || 203;

        // Expand selected records by their per-row quantity (default 1)
        const expanded: Record<string, any>[] = [];
        this.dataset.forEach((r, i) => {
            if (this.selectedIndices.has(i)) {
                const qty = Math.max(1, parseInt(String((r as any)._qty || 1), 10) || 1);
                for (let k = 0; k < qty; k++) expanded.push({ ...r });
            }
        });

        if (expanded.length === 0) {
            // Nothing selected — build a placeholder set of `qty` rows from the field value
            const qtyEl = this.container.querySelector<HTMLInputElement>('#bp-qty');
            const qty = Math.max(1, parseInt(qtyEl?.value || '1', 10) || 1);
            for (let k = 0; k < qty; k++) expanded.push({ serialNumber: `SN-${String(k + 1).padStart(4, '0')}`, title: this.currentLayout?.name || 'Label' });
        }

        const selected = new Set(expanded.map((_, i) => i));
        let zpl = '';
        try {
            zpl = this.renderer.generateBatchZPL(this.currentLayout, expanded, selected, dpi as any);
        } catch { /* non-fatal */ }

        void supabaseService.logPrintJob({
            entityType: 'label', entityLabel: `${expanded.length} label(s) · ${this.currentLayout?.name || ''}`,
            format: 'ZPL', dpi, quantity: expanded.length, printerName: printer?.name || ''
        });
        void supabaseService.logAudit({ action: 'print', entityType: 'print_job', entityId: printer?.id || '', entityLabel: `${expanded.length} label(s)` });

        alert(`🖨️ Print job started on "${printer?.name || 'default printer'}" — ${expanded.length} label(s).`);
        if (zpl) this.showZPLModal();
    }

    private loadLocalSerials(): any[] {
        try { const r = localStorage.getItem('qrlayout_db_serials_v2'); return r ? JSON.parse(r) : []; } catch { return []; }
    }
    private saveLocalSerials(list: any[]) {
        try { localStorage.setItem('qrlayout_db_serials_v2', JSON.stringify(list)); } catch {}
    }
    private loadLocalBatches(): any[] {
        try { const r = localStorage.getItem('qrlayout_db_batches_v2'); return r ? JSON.parse(r) : []; } catch { return []; }
    }
    private saveLocalBatches(list: any[]) {
        try { localStorage.setItem('qrlayout_db_batches_v2', JSON.stringify(list)); } catch {}
    }

    /** Templates the current user is allowed to print (category-gated). */
    private getAllowedTemplates(): PrebuiltTemplate[] {
        const allowed = this.allowedCategories || ['All'];
        // Empty or 'All' → unrestricted (always show everything available)
        const allowAll = allowed.length === 0 || allowed.includes('All');
        if (allowAll) return this.availableTemplates;
        return this.availableTemplates.filter(t => allowed.includes(t.category));
    }

    /**
     * Pick a sensible default printer + media based on the active label size,
     * so the "Label Media" dropdown reflects the current layout automatically.
     */
    private matchPrinterAndMedia() {
        const bySize = getMediaBySize(this.activePreset.labelWidthMm, this.activePreset.labelHeightMm);
        if (bySize) {
            this.selectedPrinterType = bySize.printerTypes[0] || this.selectedPrinterType;
            this.selectedMediaId = bySize.id;
            return;
        }
        const media = getMediaForPrinter(this.selectedPrinterType)[0];
        if (media) this.selectedMediaId = media.id;
    }

    private hasPrinterMedia(): boolean {
        return getMediaForPrinter(this.selectedPrinterType).length > 0;
    }

    private get activeMediaSizeLabel(): string {
        const media = getMediaById(this.selectedMediaId);
        if (media) {
            return `Selected: <strong>${media.name}</strong> · ${media.mediaType} · <strong>${formatLabelSize(media.labelWidthMm, media.labelHeightMm)}</strong>`;
        }
        return 'Select a label media size.';
    }

    private get activeMedia(): LabelMediaDef | undefined {
        return getMediaById(this.selectedMediaId);
    }

    /** Apply a chosen media (paper/roll + size) onto the active sheet preset. */
    private applyMediaToPreset(media: LabelMediaDef) {
        const fields = mediaToPresetFields(media);
        this.activePreset = {
            ...this.activePreset,
            id: media.id,
            name: `${media.name} — ${formatLabelSize(media.labelWidthMm, media.labelHeightMm)}`,
            paperSize: fields.paperSize as any,
            paperWidthMm: fields.paperWidthMm,
            paperHeightMm: fields.paperHeightMm,
            cols: fields.cols,
            rows: fields.rows,
            labelWidthMm: fields.labelWidthMm,
            labelHeightMm: fields.labelHeightMm,
            gapXMm: fields.gapXMm,
            gapYMm: fields.gapYMm,
            description: `${media.mediaType} · ${formatLabelSize(media.labelWidthMm, media.labelHeightMm)}${media.rollWidthMm ? ` · roll ${media.rollWidthMm} mm` : ''}`
        };
        this.currentSheetIndex = 0;
    }

    private matchInitialPreset(): SheetPreset {
        const found = PREBUILT_TEMPLATES.find(t => t.id === this.currentLayout.id);
        if (found) {
            const preset = SHEET_PRESETS.find(p => p.id === found.defaultSheetPreset);
            if (preset) return { ...preset };
        }
        // Auto-match based on size
        if (this.currentLayout.height > 120 && this.currentLayout.width > 80) {
            const thermal = SHEET_PRESETS.find(p => p.id === 'thermal-4x6');
            if (thermal) return { ...thermal };
        }
        if (this.currentLayout.height <= 38 && this.currentLayout.width <= 75) {
            const a4_24 = SHEET_PRESETS.find(p => p.id === 'a4-24up');
            if (a4_24) return { ...a4_24 };
        }
        return { ...(SHEET_PRESETS.find(p => p.id === 'a4-10up') || SHEET_PRESETS[0]) }; // badge default
    }

    private initDefaultDataset() {
        const found = PREBUILT_TEMPLATES.find(t => t.id === this.currentLayout.id);
        if (found && found.sampleBatch?.length) {
            this.dataset = JSON.parse(JSON.stringify(found.sampleBatch));
        } else {
            // Generate from template variables
            this.dataset = this.generateSampleRows(8);
        }
        this.selectAll();
    }

    public setLayout(layout: StickerLayout) {
        this.currentLayout = JSON.parse(JSON.stringify(layout));
        this.activePreset = this.matchInitialPreset();
        this.syncLayoutToPreset();
        this.matchPrinterAndMedia();
        this.initDefaultDataset();
        this.currentSheetIndex = 0;
        this.showPreview = false;
        this.render();
    }

    public setBatchData(records: Record<string, any>[]) {
        if (records && records.length > 0) {
            this.dataset = JSON.parse(JSON.stringify(records));
            this.selectAll();
            this.currentSheetIndex = 0;
            this.showPreview = false;
            this.render();
        }
    }

    private syncLayoutToPreset() {
        // Automatically adapt preset label dimensions if custom
        if (this.activePreset.id === 'custom') {
            this.activePreset.labelWidthMm = this.currentLayout.width;
            this.activePreset.labelHeightMm = this.currentLayout.height;
        }
    }

    private extractVariables(): string[] {
        const vars = new Set<string>();
        const regex = /\{\{([^}]+)\}\}/g;
        for (const el of this.currentLayout.elements) {
            if (el.content) {
                let match;
                while ((match = regex.exec(el.content)) !== null) {
                    vars.add(match[1].trim());
                }
            }
        }
        if (vars.size === 0) {
            // Check active entity schema
            const schema = this.entitySchemas[this.currentLayout.targetEntity];
            if (schema && schema.fields) {
                schema.fields.forEach(f => vars.add(f.name));
            }
        }
        return Array.from(vars);
    }

    private generateSampleRows(count: number): Record<string, any>[] {
        const vars = this.extractVariables();
        const rows: Record<string, any>[] = [];
        const names = ['Alex Johnson', 'Sarah Miller', 'David Chen', 'Elena Rostova', 'Marcus Vance', 'Priya Patel', 'Carlos Gomez', 'Emily Watson', 'James Wilson', 'Amina Al-Mansoor'];
        const depts = ['Engineering', 'Design', 'Product', 'DevOps', 'SecOps', 'Operations', 'Marketing', 'Analytics'];
        const bloods = ['A+', 'B+', 'O+', 'AB+', 'O-', 'A-'];

        for (let i = 0; i < count; i++) {
            const row: Record<string, any> = {};
            const num = 1000 + i + 1;
            for (const v of vars) {
                const vl = v.toLowerCase();
                if (vl.includes('name')) row[v] = names[i % names.length];
                else if (vl.includes('id') || vl.includes('emp')) row[v] = `EMP-${num}`;
                else if (vl.includes('sku') || vl.includes('code')) row[v] = `SKU-89012345${num}`;
                else if (vl.includes('track')) row[v] = `TRK-9842109${num}US`;
                else if (vl.includes('loc') || vl.includes('bin')) row[v] = `LOC-A-0${(i % 9) + 1}-${num % 50}`;
                else if (vl.includes('part') || vl.includes('item')) row[v] = `PART-${num}-X`;
                else if (vl.includes('ticket') || vl.includes('pass')) row[v] = `PASS-${num}`;
                else if (vl.includes('asset') || vl.includes('sn')) row[v] = `AST-2026-${num}`;
                else if (vl.includes('price')) row[v] = `$${((i + 1) * 14.99).toFixed(2)}`;
                else if (vl.includes('dept')) row[v] = depts[i % depts.length];
                else if (vl.includes('blood')) row[v] = bloods[i % bloods.length];
                else if (vl.includes('desc') || vl.includes('title')) row[v] = `Sample Item #${i + 1} High Quality`;
                else row[v] = `Value ${i + 1}`;
            }
            rows.push(row);
        }
        return rows;
    }

    private selectAll() {
        this.selectedIndices = new Set(this.dataset.map((_, i) => i));
    }

    private deselectAll() {
        this.selectedIndices.clear();
    }

    private render() {
        // ── Simplified print view (clean, focused on template → qty → printer → print) ──
        this.renderSimplified();
        return;
        // eslint-disable-next-line no-unreachable
        const totalSheets = this.renderer.calculateSheetCount(this.dataset.length, this.activePreset, this.startOffset);

        const vars = this.extractVariables();
        const activeCount = this.selectedIndices.size;
        const totalCount = this.dataset.length;

        // Product combo-box
        const filteredProducts = this.products.filter(p => {
            if (!this.productSearchQuery) return true;
            const q = this.productSearchQuery.toLowerCase();
            return p.sku.toLowerCase().includes(q) || p.title.toLowerCase().includes(q) || (p.plant || '').toLowerCase().includes(q);
        });
        const selectedProduct = this.products.find(p => p.id === this.selectedProductId);

        this.container.innerHTML = `
        <div class="print-dashboard-layout">
            <!-- TOP BAR -->
            <div class="print-topbar">
                <div class="print-topbar-left">
                    <div class="print-template-badge">
                        <span class="badge-icon">🏷️</span>
                        <div>
                            <div class="badge-title">${this.currentLayout.name || 'Current Layout'}</div>
                            <div class="badge-sub">${this.currentLayout.width} × ${this.currentLayout.height} ${this.currentLayout.unit} • ${this.activePreset.name}</div>
                        </div>
                    </div>
                    <button class="btn btn-outline btn-sm" id="btn-edit-in-designer">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        Edit in Designer
                    </button>
                    <div class="template-selector-wrap">
                        <label>Preset Template:</label>
                        <select id="select-active-template" class="form-select-sm">
                            ${this.getAllowedTemplates().map(t => `
                                <option value="${t.id}" ${t.id === this.currentLayout.id ? 'selected' : ''}>
                                    ${t.icon} ${t.title}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>

                <div class="print-topbar-right">
                    <div class="print-stats-chip">
                        <span class="stats-pill"><strong>${activeCount}</strong> of ${totalCount} labels selected</span>
                        <span class="stats-pill"><strong>${totalSheets}</strong> ${totalSheets === 1 ? 'Sheet' : 'Sheets'}</span>
                    </div>

                    <button class="btn btn-outline" id="btn-export-zpl" title="Export ZPL code for Zebra thermal printers">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                        ZPL (Thermal)
                    </button>

                    <button class="btn btn-outline" id="btn-export-pdf" title="Download high-resolution vector PDF">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>
                        Export PDF
                    </button>

                    <button class="btn btn-outline" id="btn-export-png" title="Download Sheet as Image">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        Download Image
                    </button>

                    <button class="btn btn-primary btn-print-main" id="btn-print-dialog" title="Open Print Dialog (Ctrl+P)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                        Print Now
                    </button>
                </div>
            </div>

            <!-- QUICK PRINT SETUP -->
            <div class="quick-print-bar" style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;padding:12px 18px;border-bottom:1px solid var(--border-color,#e2e8f0);background:#fbfcfe;">
                <div style="font-size:0.8125rem;font-weight:700;color:var(--text-primary);align-self:center;">⚡ Quick Print</div>
                <div style="flex:1;min-width:150px;">
                    <label style="font-size:0.7rem;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Quantity</label>
                    <input type="number" id="quick-qty" min="1" value="${this.loadDefault('quick.print.qty') || Math.max(1, this.dataset.length || 1)}" style="width:100%;padding:7px 10px;border:1px solid var(--border-color,#cbd5e1);border-radius:8px;font-size:0.8125rem;" />
                </div>
                <div style="flex:1;min-width:180px;">
                    <label style="font-size:0.7rem;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Printer</label>
                    <select id="quick-printer" style="width:100%;padding:7px 10px;border:1px solid var(--border-color,#cbd5e1);border-radius:8px;font-size:0.8125rem;">
                        ${this.printers.length === 0 ? '<option value="">No printers configured — add in Settings</option>' : this.printers.map(p => `
                            <option value="${this.escapeHtml(p.id)}" ${p.id === this.selectedPrinterId ? 'selected' : ''}>${this.escapeHtml(p.name)} · ${this.escapeHtml(String(p.dpi))} DPI · ${this.escapeHtml(String(p.label_width_mm))}×${this.escapeHtml(String(p.label_height_mm))}mm${p.is_default ? ' (default)' : ''}</option>
                        `).join('')}
                    </select>
                </div>
                <button class="btn btn-outline" id="btn-save-print-default" title="Save these as your default print settings">💾 Save as Default</button>
                <button class="btn btn-primary" id="btn-quick-print" title="Start the print job">🖨️ Print</button>
            </div>

            <!-- WORKSPACE BODY -->
            <div class="print-body print-body-split">
                <!-- LEFT PANEL: Product Selection + Data (wider) -->
                <div class="print-sidebar print-sidebar-wide">

                    <!-- PRODUCT SELECTION CARD -->
                    <div class="product-select-card">
                        <div class="product-select-header">
                            <div class="product-select-icon">📦</div>
                            <div>
                                <div class="product-select-title">Select Product</div>
                                <div class="product-select-sub">
                                    ${this.currentUser?.allowedPlants && !this.currentUser.allowedPlants.includes('All')
                                        ? `Showing: ${(this.currentUser.allowedPlants).join(', ')}`
                                        : `${this.products.length} products available`}
                                </div>
                            </div>
                        </div>

                        <!-- Searchable Product Combo-box -->
                        <div class="product-combo-wrap" id="product-combo-wrap">
                            <div class="product-combo-trigger" id="product-combo-trigger" tabindex="0" role="combobox">
                                <div class="product-combo-value">
                                    ${selectedProduct
                                        ? `<span class="combo-selected-badge">${selectedProduct.plant || ''}</span>
                                           <span class="combo-selected-name">${selectedProduct.sku} — ${selectedProduct.title}</span>`
                                        : `<span class="combo-placeholder">🔍 Search or select a product…</span>`}
                                </div>
                                <div class="combo-chevron">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
                                </div>
                            </div>

                            <div class="product-combo-dropdown ${this.comboOpen ? 'open' : ''}" id="product-combo-dropdown" role="listbox">
                                <div class="combo-search-wrap">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                                    <input type="text" id="product-combo-search" class="combo-search-input"
                                        placeholder="Type SKU or product name…"
                                        value="${this.escapeHtml(this.productSearchQuery)}"
                                        autocomplete="off" />
                                </div>
                                <div class="combo-options-list" id="combo-options-list">
                                    ${filteredProducts.length === 0
                                        ? `<div class="combo-empty">No products found${this.products.length === 0 ? ' — check plant allocation or network' : ''}</div>`
                                        : filteredProducts.map(p => `
                                            <div class="combo-option ${p.id === this.selectedProductId ? 'selected' : ''}" data-product-id="${p.id}" role="option">
                                                <div class="combo-option-main">
                                                    <span class="combo-option-sku">${p.sku}</span>
                                                    <span class="combo-option-name">${p.title}</span>
                                                </div>
                                                <div class="combo-option-meta">
                                                    <span class="combo-option-plant">🏭 ${p.plant || '—'}</span>
                                                    <span class="combo-option-group">${p.group || p.category || ''}</span>
                                                </div>
                                            </div>
                                        `).join('')}
                                </div>
                            </div>
                        </div>

                        <!-- Selected product details + batch number -->
                        ${selectedProduct ? `
                        <div class="product-details-strip">
                            <div class="product-detail-row">
                                <div class="product-detail-chip">
                                    <span class="detail-chip-label">SKU</span>
                                    <span class="detail-chip-val">${selectedProduct.sku}</span>
                                </div>
                                <div class="product-detail-chip">
                                    <span class="detail-chip-label">Plant</span>
                                    <span class="detail-chip-val">${selectedProduct.plant || '—'}</span>
                                </div>
                                <div class="product-detail-chip">
                                    <span class="detail-chip-label">Category</span>
                                    <span class="detail-chip-val">${selectedProduct.category || '—'}</span>
                                </div>
                                <div class="product-detail-chip">
                                    <span class="detail-chip-label">MRP</span>
                                    <span class="detail-chip-val">₹${Number(selectedProduct.mrp || 0).toLocaleString('en-IN')}</span>
                                </div>
                            </div>
                            <div class="batch-number-row">
                                <span class="batch-number-label">📦 Batch:</span>
                                <span class="batch-number-value" id="batch-number-display">${this.batchNumber}</span>
                                <button class="btn btn-outline btn-xs" id="btn-regen-batch" title="Generate new batch number">↻ New</button>
                            </div>
                            <div class="serial-gen-row">
                                <div class="serial-gen-field">
                                    <span class="serial-gen-label">Quantity</span>
                                    <input type="number" id="print-serial-qty" class="form-input-sm" min="1" max="1000" value="${this.serialQty}" />
                                </div>
                                <button class="btn btn-primary btn-xs" id="btn-generate-serials">⚡ Generate Serial Number</button>
                            </div>
                        </div>
                        ` : ''}
                    </div>

                    <!-- SIDEBAR NAV TABS -->
                    <div class="print-nav-tabs">
                        <button class="print-tab-btn ${this.activeTab === 'data' ? 'active' : ''}" id="tab-btn-data">
                            📊 Batch Data (${totalCount})
                        </button>
                        <button class="print-tab-btn ${this.activeTab === 'sheet' ? 'active' : ''}" id="tab-btn-sheet">
                            ⚙️ Sheet &amp; Grid Setup
                        </button>
                    </div>

                    <!-- TAB CONTENT: BATCH DATA -->
                    <div class="print-tab-content" style="${this.activeTab === 'data' ? '' : 'display:none;'}">
                        <div class="data-manager-header">
                            <div class="data-actions-row">
                                <button class="btn btn-outline btn-xs" id="btn-add-row">+ Add Row</button>
                                <button class="btn btn-outline btn-xs" id="btn-gen-sample">+ Generate Mock Data</button>
                                <label class="btn btn-outline btn-xs btn-file-label">
                                    📁 CSV Import
                                    <input type="file" id="input-csv-file" accept=".csv" style="display:none;" />
                                </label>
                                <button class="btn btn-outline btn-xs" id="btn-export-csv">💾 Export CSV</button>
                                <button class="btn btn-outline btn-xs btn-danger-soft" id="btn-clear-table">Clear All</button>
                            </div>
                            <div class="data-search-row">
                                <input type="text" id="input-data-search" placeholder="Search records..." value="${this.searchQuery}" class="form-input-sm" />
                                <div class="selection-toggles">
                                    <button class="btn-link" id="btn-select-all">Select All</button>
                                    <span>•</span>
                                    <button class="btn-link" id="btn-deselect-all">Deselect All</button>
                                </div>
                            </div>
                        </div>

                        <!-- DATA TABLE -->
                        <div class="data-table-container">
                            <table class="batch-data-table">
                                <thead>
                                    <tr>
                                        <th style="width: 36px; text-align: center;">Print</th>
                                        <th style="width: 36px; text-align: center;">#</th>
                                        ${vars.map(v => `<th>{{${v}}}</th>`).join('')}
                                        <th style="width: 40px; text-align: center;">Act</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${this.renderTableRows(vars)}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- TAB CONTENT: SHEET SETUP -->
                    <div class="print-tab-content" style="${this.activeTab === 'sheet' ? '' : 'display:none;'}">
                        <div class="sheet-config-form">
                            <div class="config-group">
                                <label class="config-label">Printer Type</label>
                                <select id="select-printer-type" class="form-select">
                                    ${PRINTER_TYPES.map(p => `
                                        <option value="${p.id}" ${p.id === this.selectedPrinterType ? 'selected' : ''}>
                                            ${p.vendor} — ${p.name}
                                        </option>
                                    `).join('')}
                                </select>
                                <small class="config-help">${buildPrinterContext(this.selectedPrinterType).printer.description}</small>
                            </div>

                            <div class="config-group">
                                <label class="config-label">Label Media (Paper / Roll)</label>
                                <select id="select-label-media" class="form-select">
                                    ${getMediaForPrinter(this.selectedPrinterType).map(m => `
                                        <option value="${m.id}" data-size="${formatLabelSize(m.labelWidthMm, m.labelHeightMm)}" ${m.id === this.selectedMediaId ? 'selected' : ''}>
                                            ${m.name} · ${m.mediaType} — ${formatLabelSize(m.labelWidthMm, m.labelHeightMm)}
                                        </option>
                                    `).join('')}
                                </select>
                                <small class="config-help" data-el="media-size-help">
                                    ${this.activeMediaSizeLabel}
                                </small>
                            </div>

                            <div class="config-group">
                                <label class="config-label">Sheet Preset</label>
                                <select id="select-sheet-preset" class="form-select">
                                    ${SHEET_PRESETS.map(p => `
                                        <option value="${p.id}" ${p.id === this.activePreset.id ? 'selected' : ''}>
                                            ${p.name}
                                        </option>
                                    `).join('')}
                                </select>
                                <small class="config-help">${this.activePreset.description}</small>
                            </div>

                            <div class="config-row-2">
                                <div class="config-group">
                                    <label class="config-label">Paper Size</label>
                                    <select id="select-paper-size" class="form-select">
                                        <option value="A4" ${this.activePreset.paperSize === 'A4' ? 'selected' : ''}>A4 (210 × 297 mm)</option>
                                        <option value="Letter" ${this.activePreset.paperSize === 'Letter' ? 'selected' : ''}>US Letter (8.5 × 11 in)</option>
                                        <option value="Roll" ${this.activePreset.paperSize === 'Roll' ? 'selected' : ''}>Continuous Roll</option>
                                        <option value="Custom" ${this.activePreset.paperSize === 'Custom' ? 'selected' : ''}>Custom Size</option>
                                    </select>
                                </div>
                                <div class="config-group">
                                    <label class="config-label">Grid Layout</label>
                                    <div class="grid-inputs">
                                        <input type="number" id="input-cols" value="${this.activePreset.cols}" min="1" max="20" title="Columns" />
                                        <span>×</span>
                                        <input type="number" id="input-rows" value="${this.activePreset.rows}" min="1" max="50" title="Rows" />
                                    </div>
                                </div>
                            </div>

                            <div class="config-row-2">
                                <div class="config-group">
                                    <label class="config-label">Label Width (mm)</label>
                                    <input type="number" id="input-label-w" value="${this.activePreset.labelWidthMm}" step="0.1" min="5" />
                                </div>
                                <div class="config-group">
                                    <label class="config-label">Label Height (mm)</label>
                                    <input type="number" id="input-label-h" value="${this.activePreset.labelHeightMm}" step="0.1" min="5" />
                                </div>
                            </div>

                            <div class="config-row-2">
                                <div class="config-group">
                                    <label class="config-label">Gap X (mm)</label>
                                    <input type="number" id="input-gap-x" value="${this.activePreset.gapXMm}" step="0.1" min="0" />
                                </div>
                                <div class="config-group">
                                    <label class="config-label">Gap Y (mm)</label>
                                    <input type="number" id="input-gap-y" value="${this.activePreset.gapYMm}" step="0.1" min="0" />
                                </div>
                            </div>

                            <div class="config-row-2">
                                <div class="config-group">
                                    <label class="config-label">Top Margin (mm)</label>
                                    <input type="number" id="input-margin-top" value="${this.activePreset.marginTopMm}" step="0.1" min="0" />
                                </div>
                                <div class="config-group">
                                    <label class="config-label">Left Margin (mm)</label>
                                    <input type="number" id="input-margin-left" value="${this.activePreset.marginLeftMm}" step="0.1" min="0" />
                                </div>
                            </div>

                            <div class="config-group">
                                <label class="config-label">Start Offset (Skip Used Sticker Slots)</label>
                                <div class="offset-slider-wrap">
                                    <input type="range" id="input-offset-range" min="0" max="${(this.activePreset.cols * this.activePreset.rows) - 1}" value="${this.startOffset}" />
                                    <span class="offset-value">${this.startOffset} labels skipped</span>
                                </div>
                                <small class="config-help">Start printing on a partially used physical sticker sheet.</small>
                            </div>

                            <div class="config-divider"></div>

                            <div class="config-checkbox-group">
                                <label class="checkbox-item">
                                    <input type="checkbox" id="check-cut-marks" ${this.showCutMarks ? 'checked' : ''} />
                                    <span>Draw Corner Cut Marks (Trim guides)</span>
                                </label>
                                <label class="checkbox-item">
                                    <input type="checkbox" id="check-borders" ${this.showBorderOutlines ? 'checked' : ''} />
                                    <span>Show Label Outlines &amp; Borders</span>
                                </label>
                                <label class="checkbox-item">
                                    <input type="checkbox" id="check-number-badge" ${this.showNumberBadge ? 'checked' : ''} />
                                    <span>Display Label Index (#1, #2...)</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- RIGHT PANEL: Print Preview (compact, on-demand) -->
                <div class="print-preview-area print-preview-compact">
                    <!-- PREVIEW TOOLBAR -->
                    <div class="preview-controls-bar">
                        <div class="pagination-controls">
                            <button class="btn btn-outline btn-xs" id="btn-prev-sheet" ${this.currentSheetIndex === 0 ? 'disabled' : ''}>
                                ◀ Prev
                            </button>
                            <span class="sheet-indicator">Sheet <strong>${this.currentSheetIndex + 1}</strong> / ${totalSheets}</span>
                            <button class="btn btn-outline btn-xs" id="btn-next-sheet" ${this.currentSheetIndex >= totalSheets - 1 ? 'disabled' : ''}>
                                Next ▶
                            </button>
                        </div>

                        <div class="zoom-controls">
                            <button class="btn btn-outline btn-xs" id="btn-zoom-out" title="Zoom Out">-</button>
                            <span class="zoom-text">${Math.round(this.zoomLevel * 100)}%</span>
                            <button class="btn btn-outline btn-xs" id="btn-zoom-in" title="Zoom In">+</button>
                            <button class="btn btn-outline btn-xs" id="btn-zoom-fit">Fit</button>
                            <button class="btn btn-outline btn-xs" id="btn-zoom-100">1:1</button>
                        </div>
                    </div>

                    <!-- BATCH STATS (compact) -->
                    <div class="preview-stats-bar">
                        <span class="stats-pill"><strong>${activeCount}</strong> / ${totalCount} selected</span>
                        <span class="stats-pill"><strong>${totalSheets}</strong> sheets</span>
                        ${this.batchNumber ? `<span class="stats-pill batch-pill" title="Batch Number">📦 ${this.batchNumber}</span>` : ''}
                    </div>

                    <!-- SHEET CANVAS / PLACEHOLDER -->
                    <div class="sheet-viewport" id="sheet-viewport">
                        ${this.showPreview
                            ? `<div class="sheet-shadow-box" id="sheet-shadow-box" style="transform: scale(${this.zoomLevel}); transform-origin: top center;">
                                   <canvas id="sheet-canvas" class="sheet-canvas"></canvas>
                               </div>`
                            : `<div class="preview-placeholder" id="preview-placeholder">
                                   <div class="preview-placeholder-icon">
                                       <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                   </div>
                                   <h3 class="preview-placeholder-title">Print Preview</h3>
                                   <p class="preview-placeholder-sub">Generate a live label sheet preview based on the current settings and selected records.</p>
                                   <button class="btn btn-primary btn-generate-preview" id="btn-generate-preview">
                                       <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
                                       Generate Preview
                                   </button>
                               </div>`}
                    </div>
                </div>
            </div>
        </div>

        <!-- HIDDEN PRINT CONTAINER (FOR WINDOW.PRINT) -->
        <div id="print-media-container" class="print-only"></div>
        `;

        this.cacheAndBindEvents();
        if (this.showPreview) {
            this.renderActiveSheet();
        }
    }

    private renderTableRows(vars: string[]): string {
        if (this.dataset.length === 0) {
            return `<tr><td colspan="${vars.length + 3}" style="text-align:center; padding: 24px; color: var(--text-secondary);">No records in batch. Click <strong>+ Add Row</strong> or <strong>+ Generate Mock Data</strong>.</td></tr>`;
        }

        const filtered = this.dataset.map((row, idx) => ({ row, idx })).filter(({ row }) => {
            if (!this.searchQuery) return true;
            return Object.values(row).some(v => String(v).toLowerCase().includes(this.searchQuery.toLowerCase()));
        });

        return filtered.map(({ row, idx }) => {
            const isChecked = this.selectedIndices.has(idx);
            return `
            <tr class="table-row-item ${isChecked ? '' : 'row-disabled'}" data-index="${idx}">
                <td style="text-align: center;">
                    <input type="checkbox" class="row-checkbox" data-index="${idx}" ${isChecked ? 'checked' : ''} />
                </td>
                <td style="text-align: center; font-weight: bold; color: var(--text-secondary);">${idx + 1}</td>
                ${vars.map(v => `
                    <td class="editable-cell" data-index="${idx}" data-field="${v}">
                        <input type="text" class="cell-input" value="${this.escapeHtml(String(row[v] ?? ''))}" data-index="${idx}" data-field="${v}" />
                    </td>
                `).join('')}
                <td style="text-align: center;">
                    <button class="btn-delete-row" data-index="${idx}" title="Delete Record">✕</button>
                </td>
            </tr>
            `;
        }).join('');
    }

    private escapeHtml(str: string): string {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    private cacheAndBindEvents() {
        const q = <T extends HTMLElement>(sel: string) => this.container.querySelector<T>(sel);

        // Edit in Designer
        q('#btn-edit-in-designer')?.addEventListener('click', () => {
            if (this.onOpenDesigner) this.onOpenDesigner(this.currentLayout);
        });

        // Preset Template Selector
        q<HTMLSelectElement>('#select-active-template')?.addEventListener('change', (e) => {
            const val = (e.target as HTMLSelectElement).value;
            const t = this.getAllowedTemplates().find(x => x.id === val);
            if (t) {
                this.currentLayout = JSON.parse(JSON.stringify(t.layout));
                const preset = SHEET_PRESETS.find(p => p.id === t.defaultSheetPreset);
                if (preset) this.activePreset = { ...preset };
                this.dataset = JSON.parse(JSON.stringify(t.sampleBatch));
                this.selectAll();
                this.currentSheetIndex = 0;
                this.showPreview = false;
                this.render();
            }
        });

        // Tabs
        q('#tab-btn-data')?.addEventListener('click', () => { this.activeTab = 'data'; this.render(); });
        q('#tab-btn-sheet')?.addEventListener('click', () => { this.activeTab = 'sheet'; this.render(); });

        // Add Row
        // Generate serial numbers for the selected product
        q('#btn-generate-serials')?.addEventListener('click', () => { void this.generateSerialsForProduct(); });

        q('#btn-add-row')?.addEventListener('click', () => {            const vars = this.extractVariables();
            const newRow: Record<string, any> = {};
            const num = this.dataset.length + 1;
            vars.forEach(v => newRow[v] = `New Item #${num}`);
            this.dataset.push(newRow);
            this.selectedIndices.add(this.dataset.length - 1);
            this.showPreview = false;
            this.render();
        });

        // Mock Data
        q('#btn-gen-sample')?.addEventListener('click', () => {
            const more = this.generateSampleRows(10);
            const startIdx = this.dataset.length;
            this.dataset.push(...more);
            for (let i = startIdx; i < this.dataset.length; i++) this.selectedIndices.add(i);
            this.showPreview = false;
            this.render();
        });

        // Clear Table
        q('#btn-clear-table')?.addEventListener('click', () => {
            if (confirm('Clear all batch records?')) {
                this.dataset = [];
                this.selectedIndices.clear();
                this.showPreview = false;
                this.render();
            }
        });

        // Search
        q<HTMLInputElement>('#input-data-search')?.addEventListener('input', (e) => {
            this.searchQuery = (e.target as HTMLInputElement).value;
            const tbody = this.container.querySelector('tbody');
            if (tbody) tbody.innerHTML = this.renderTableRows(this.extractVariables());
            this.bindTableEvents();
        });

        // Select / Deselect all
        q('#btn-select-all')?.addEventListener('click', () => { this.selectAll(); this.render(); });
        q('#btn-deselect-all')?.addEventListener('click', () => { this.deselectAll(); this.render(); });

        // CSV Import
        q<HTMLInputElement>('#input-csv-file')?.addEventListener('change', (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) this.importCSV(file);
        });

        // CSV Export
        q('#btn-export-csv')?.addEventListener('click', () => this.exportCSV());

        // Sheet Preset Selector
        q<HTMLSelectElement>('#select-sheet-preset')?.addEventListener('change', (e) => {
            const id = (e.target as HTMLSelectElement).value;
            const found = SHEET_PRESETS.find(p => p.id === id);
            if (found) {
                this.activePreset = { ...found };
                this.currentSheetIndex = 0;
                this.render();
            }
        });

        // Printer Type Selector — repopulate media options for the chosen printer
        q<HTMLSelectElement>('#select-printer-type')?.addEventListener('change', (e) => {
            const pId = (e.target as HTMLSelectElement).value as PrinterId;
            this.selectedPrinterType = pId;
            const first = getMediaForPrinter(pId)[0];
            this.selectedMediaId = first?.id || '';
            if (this.activeMedia) this.applyMediaToPreset(this.activeMedia);
            this.render();
        });

        // Label Media Selector — apply the chosen paper/roll size
        q<HTMLSelectElement>('#select-label-media')?.addEventListener('change', (e) => {
            const mId = (e.target as HTMLSelectElement).value;
            const media = getMediaById(mId);
            if (media) {
                this.selectedMediaId = mId;
                this.applyMediaToPreset(media);
            }
            this.render();
        });

        // Grid form inputs
        q<HTMLInputElement>('#input-cols')?.addEventListener('change', (e) => {
            this.activePreset.cols = Math.max(1, parseInt((e.target as HTMLInputElement).value) || 1);
            this.render();
        });
        q<HTMLInputElement>('#input-rows')?.addEventListener('change', (e) => {
            this.activePreset.rows = Math.max(1, parseInt((e.target as HTMLInputElement).value) || 1);
            this.render();
        });
        q<HTMLInputElement>('#input-label-w')?.addEventListener('change', (e) => {
            this.activePreset.labelWidthMm = Math.max(5, parseFloat((e.target as HTMLInputElement).value) || 10);
            this.renderActiveSheet();
        });
        q<HTMLInputElement>('#input-label-h')?.addEventListener('change', (e) => {
            this.activePreset.labelHeightMm = Math.max(5, parseFloat((e.target as HTMLInputElement).value) || 10);
            this.renderActiveSheet();
        });
        q<HTMLInputElement>('#input-gap-x')?.addEventListener('change', (e) => {
            this.activePreset.gapXMm = Math.max(0, parseFloat((e.target as HTMLInputElement).value) || 0);
            this.renderActiveSheet();
        });
        q<HTMLInputElement>('#input-gap-y')?.addEventListener('change', (e) => {
            this.activePreset.gapYMm = Math.max(0, parseFloat((e.target as HTMLInputElement).value) || 0);
            this.renderActiveSheet();
        });
        q<HTMLInputElement>('#input-margin-top')?.addEventListener('change', (e) => {
            this.activePreset.marginTopMm = Math.max(0, parseFloat((e.target as HTMLInputElement).value) || 0);
            this.renderActiveSheet();
        });
        q<HTMLInputElement>('#input-margin-left')?.addEventListener('change', (e) => {
            this.activePreset.marginLeftMm = Math.max(0, parseFloat((e.target as HTMLInputElement).value) || 0);
            this.renderActiveSheet();
        });

        // Offset range
        q<HTMLInputElement>('#input-offset-range')?.addEventListener('input', (e) => {
            this.startOffset = parseInt((e.target as HTMLInputElement).value) || 0;
            const span = this.container.querySelector('.offset-value');
            if (span) span.textContent = `${this.startOffset} labels skipped`;
            this.renderActiveSheet();
        });

        // Visual check marks
        q<HTMLInputElement>('#check-cut-marks')?.addEventListener('change', (e) => {
            this.showCutMarks = (e.target as HTMLInputElement).checked;
            this.renderActiveSheet();
        });
        q<HTMLInputElement>('#check-borders')?.addEventListener('change', (e) => {
            this.showBorderOutlines = (e.target as HTMLInputElement).checked;
            this.renderActiveSheet();
        });
        q<HTMLInputElement>('#check-number-badge')?.addEventListener('change', (e) => {
            this.showNumberBadge = (e.target as HTMLInputElement).checked;
            this.renderActiveSheet();
        });

        // Pagination
        q('#btn-prev-sheet')?.addEventListener('click', () => {
            if (this.currentSheetIndex > 0) {
                this.currentSheetIndex--;
                this.render();
            }
        });
        q('#btn-next-sheet')?.addEventListener('click', () => {
            const total = this.renderer.calculateSheetCount(this.dataset.length, this.activePreset, this.startOffset);
            if (this.currentSheetIndex < total - 1) {
                this.currentSheetIndex++;
                this.render();
            }
        });

        // Zoom
        q('#btn-zoom-in')?.addEventListener('click', () => this.setZoom(this.zoomLevel + 0.15));
        q('#btn-zoom-out')?.addEventListener('click', () => this.setZoom(Math.max(0.3, this.zoomLevel - 0.15)));
        q('#btn-zoom-100')?.addEventListener('click', () => this.setZoom(1.0));
        q('#btn-zoom-fit')?.addEventListener('click', () => this.fitZoomToContainer());

        // Export Actions
        q('#btn-print-dialog')?.addEventListener('click', () => this.triggerBrowserPrint());
        q('#btn-export-pdf')?.addEventListener('click', () => this.exportBatchPDF());
        q('#btn-export-png')?.addEventListener('click', () => this.exportSheetPNG());
        q('#btn-export-zpl')?.addEventListener('click', () => this.showZPLModal());

        // Quick Print bar
        q('#btn-quick-print')?.addEventListener('click', () => this.quickPrint());
        q('#btn-save-print-default')?.addEventListener('click', () => {
            const qty = q('#quick-qty') as HTMLInputElement;
            const printer = q('#quick-printer') as HTMLSelectElement;
            this.saveDefault('quick.print.qty', qty?.value || '1');
            this.saveDefault('quick.print.printer', printer?.value || '');
            alert('✅ Default print settings saved. Next time just press Print.');
        });

        // Generate Preview (on-demand)
        q('#btn-generate-preview')?.addEventListener('click', () => {
            this.showPreview = true;
            this.render();
        });

        // Batch Number Regen
        q('#btn-regen-batch')?.addEventListener('click', () => {
            const p = this.products.find(x => x.id === this.selectedProductId);
            this.batchNumber = generateBatchNumber(p?.sku || 'GEN');
            const disp = q('#batch-number-display');
            if (disp) disp.textContent = this.batchNumber;
        });

        // ── Product Combo-box ──────────────────────────────────────────────────
        const trigger = q<HTMLElement>('#product-combo-trigger');
        const dropdown = q<HTMLElement>('#product-combo-dropdown');
        const searchInput = q<HTMLInputElement>('#product-combo-search');

        trigger?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.comboOpen = !this.comboOpen;
            if (dropdown) dropdown.classList.toggle('open', this.comboOpen);
            if (this.comboOpen && searchInput) {
                setTimeout(() => searchInput.focus(), 50);
            }
        });

        trigger?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.comboOpen = true;
                if (dropdown) dropdown.classList.add('open');
                setTimeout(() => searchInput?.focus(), 50);
            }
        });

        searchInput?.addEventListener('input', (e) => {
            this.productSearchQuery = (e.target as HTMLInputElement).value;
            const listEl = q<HTMLElement>('#combo-options-list');
            if (!listEl) return;

            const filtered = this.products.filter(p => {
                if (!this.productSearchQuery) return true;
                const qry = this.productSearchQuery.toLowerCase();
                return p.sku.toLowerCase().includes(qry) ||
                       p.title.toLowerCase().includes(qry) ||
                       (p.plant || '').toLowerCase().includes(qry);
            });

            listEl.innerHTML = filtered.length === 0
                ? `<div class="combo-empty">No products found</div>`
                : filtered.map(p => `
                    <div class="combo-option ${p.id === this.selectedProductId ? 'selected' : ''}" data-product-id="${p.id}" role="option">
                        <div class="combo-option-main">
                            <span class="combo-option-sku">${p.sku}</span>
                            <span class="combo-option-name">${p.title}</span>
                        </div>
                        <div class="combo-option-meta">
                            <span class="combo-option-plant">🏭 ${p.plant || '—'}</span>
                            <span class="combo-option-group">${p.group || p.category || ''}</span>
                        </div>
                    </div>
                `).join('');

            this.bindComboOptionEvents();
        });

        searchInput?.addEventListener('click', (e) => e.stopPropagation());

        // Close on outside click
        const closeCombo = (e: MouseEvent) => {
            const wrap = this.container.querySelector('#product-combo-wrap');
            if (wrap && !wrap.contains(e.target as Node)) {
                this.comboOpen = false;
                dropdown?.classList.remove('open');
                document.removeEventListener('click', closeCombo, true);
            }
        };
        if (this.comboOpen) {
            document.addEventListener('click', closeCombo, true);
        }
        trigger?.addEventListener('click', () => {
            if (this.comboOpen) {
                document.addEventListener('click', closeCombo, true);
            }
        });

        this.bindComboOptionEvents();
        this.bindTableEvents();
    }

    private bindComboOptionEvents() {
        this.container.querySelectorAll<HTMLElement>('.combo-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const productId = opt.dataset.productId || '';
                this.selectProduct(productId);
            });
        });
    }

    private selectProduct(productId: string) {
        this.selectedProductId = productId;
        this.comboOpen = false;
        this.productSearchQuery = '';

        const product = this.products.find(p => p.id === productId);
        if (product) {
            this.batchNumber = generateBatchNumber(product.sku);

            const vars = this.extractVariables();
            if (vars.length > 0) {
                const baseRow: Record<string, any> = {};
                vars.forEach(v => {
                    const vl = v.toLowerCase();
                    if (vl.includes('sku') || vl.includes('code')) baseRow[v] = product.sku;
                    else if (vl.includes('title') || vl.includes('name') || vl.includes('product')) baseRow[v] = product.title;
                    else if (vl.includes('plant')) baseRow[v] = product.plant || '';
                    else if (vl.includes('category') || vl.includes('cat')) baseRow[v] = product.category || '';
                    else if (vl.includes('group')) baseRow[v] = product.group || '';
                    else if (vl.includes('color') || vl.includes('colour')) baseRow[v] = product.color || '';
                    else if (vl.includes('warranty')) baseRow[v] = product.warranty || '';
                    else if (vl.includes('mrp') || vl.includes('price')) baseRow[v] = `₹${Number(product.mrp || 0).toLocaleString('en-IN')}`;
                    else if (vl.includes('dp')) baseRow[v] = `₹${Number(product.dp || 0).toLocaleString('en-IN')}`;
                    else if (vl.includes('batch')) baseRow[v] = this.batchNumber;
                    else baseRow[v] = (product.defaultVariables || {})[v] || `${product.sku}-${v}`;
                });

                this.dataset = Array.from({ length: 10 }, () => ({ ...baseRow }));
                this.selectAll();
            }
        }

        this.showPreview = false;
        this.render();
    }

    private bindTableEvents() {
        // Checkboxes in table
        this.container.querySelectorAll<HTMLInputElement>('.row-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const idx = parseInt((e.target as HTMLInputElement).dataset.index || '0');
                if ((e.target as HTMLInputElement).checked) {
                    this.selectedIndices.add(idx);
                } else {
                    this.selectedIndices.delete(idx);
                }
                const chip = this.container.querySelector('.stats-pill');
                if (chip) chip.innerHTML = `<strong>${this.selectedIndices.size}</strong> of ${this.dataset.length} labels selected`;
                this.renderActiveSheet();
            });
        });

        // Inputs in table cells
        this.container.querySelectorAll<HTMLInputElement>('.cell-input').forEach(inp => {
            inp.addEventListener('input', (e) => {
                const idx = parseInt((e.target as HTMLInputElement).dataset.index || '0');
                const field = (e.target as HTMLInputElement).dataset.field || '';
                if (this.dataset[idx] && field) {
                    this.dataset[idx][field] = (e.target as HTMLInputElement).value;
                    this.renderActiveSheetDebounced();
                }
            });
        });

        // Delete Row buttons
        this.container.querySelectorAll<HTMLButtonElement>('.btn-delete-row').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt((e.currentTarget as HTMLButtonElement).dataset.index || '0');
                this.dataset.splice(idx, 1);
                this.selectedIndices.delete(idx);
                // Re-index remaining selection
                const newSelected = new Set<number>();
                this.selectedIndices.forEach(s => {
                    if (s < idx) newSelected.add(s);
                    else if (s > idx) newSelected.add(s - 1);
                });
                this.selectedIndices = newSelected;
                this.render();
            });
        });
    }

    private debounceTimer: any = null;
    private renderActiveSheetDebounced() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.renderActiveSheet(), 200);
    }

    // ────────────────────────────────────────────────────────────────────────────
    // SIMPLIFIED PRINT VIEW
    // ────────────────────────────────────────────────────────────────────────────
    private renderSimplified(): void {
        const tpls = this.getAllowedTemplates();
        const activeCount = this.selectedIndices.size;
        const totalCount = this.dataset.length;
        const selectedTotal = this.dataset.reduce((sum, r, i) => this.selectedIndices.has(i) ? sum + (r._qty || 1) : sum, 0);
        const batches = this.listBatches();

        this.container.innerHTML = `
        <div class="entity-manager-root" style="padding:16px 24px;">
            <div class="manager-card-panel" style="flex:1;">
                <div class="panel-header-row">
                    <div>
                        <h2 class="panel-heading">🖨️ Print</h2>
                        <p class="panel-subheading">Pick a template, quantity, and printer — then print.</p>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button class="btn btn-outline" id="bp-export-pdf">📄 Export PDF</button>
                        <button class="btn btn-outline" id="bp-export-zpl">🧾 ZPL</button>
                        <button class="btn btn-primary" id="bp-print">🖨️ Print Now</button>
                    </div>
                </div>

                <!-- SETUP BAR -->
                <div style="display:flex;gap:12px;flex-wrap:wrap;padding:14px 18px;border-bottom:1px solid var(--border-color,#e2e8f0);background:#fbfcfe;align-items:flex-end;">
                    <div style="flex:1;min-width:200px;">
                        <label style="font-size:0.7rem;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">1 · Template</label>
                        <select id="bp-template" style="width:100%;padding:8px 10px;border:1px solid var(--border-color,#cbd5e1);border-radius:8px;font-size:0.8125rem;">
                            ${tpls.map(t => `
                                <option value="${this.escapeHtml(t.id)}" ${t.id === this.currentTemplateId() ? 'selected' : ''}>${this.escapeHtml(t.title)}</option>
                            `).join('')}
                        </select>
                    </div>
                    <div style="flex:0 1 120px;">
                        <label style="font-size:0.7rem;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">2 · Quantity</label>
                        <input type="number" id="bp-qty" min="1" value="${this.loadDefault('quick.print.qty') || Math.max(1, selectedTotal || 1)}" style="width:100%;padding:8px 10px;border:1px solid var(--border-color,#cbd5e1);border-radius:8px;font-size:0.8125rem;" />
                    </div>
                    <div style="flex:1;min-width:200px;">
                        <label style="font-size:0.7rem;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">3 · Printer</label>
                        <select id="bp-printer" style="width:100%;padding:8px 10px;border:1px solid var(--border-color,#cbd5e1);border-radius:8px;font-size:0.8125rem;">
                            ${this.printers.length === 0 ? '<option value="">No printers — add in Settings</option>' : this.printers.map(p => `
                                <option value="${this.escapeHtml(p.id)}" ${p.id === this.selectedPrinterId ? 'selected' : ''}>${this.escapeHtml(p.name)} · ${this.escapeHtml(String(p.dpi))} DPI · ${this.escapeHtml(String(p.label_width_mm))}×${this.escapeHtml(String(p.label_height_mm))}mm${p.is_default ? ' (default)' : ''}</option>
                            `).join('')}
                        </select>
                    </div>
                    <button class="btn btn-outline" id="bp-save-default" title="Save these as your default print settings">💾 Save as Default</button>
                </div>

                <!-- BATCH / RECORDS -->
                <div style="display:flex;gap:10px;flex-wrap:wrap;padding:12px 18px;border-bottom:1px solid var(--border-color,#e2e8f0);align-items:center;">
                    <label style="font-size:0.8125rem;font-weight:700;color:var(--text-primary);">Batch:</label>
                    <select id="bp-batch" style="padding:7px 10px;border:1px solid var(--border-color,#cbd5e1);border-radius:8px;font-size:0.8125rem;min-width:220px;flex:1;max-width:360px;">
                        <option value="__all__" ${this.activeBatchNumber === '__all__' ? 'selected' : ''}>All serials</option>
                        ${batches.map(b => `
                            <option value="${this.escapeHtml(b.batchNumber)}" ${this.activeBatchNumber === b.batchNumber ? 'selected' : ''}>${this.escapeHtml(b.batchNumber)} · ${this.escapeHtml(String(b.lotQuantity || 0))} units</option>
                        `).join('')}
                    </select>
                    <button class="btn btn-outline" id="bp-load">↻ Load</button>
                    <span style="font-size:0.75rem;color:var(--text-secondary);margin-left:auto;">${activeCount} of ${totalCount} selected · ${selectedTotal} labels</span>
                </div>

                <!-- RECORDS TABLE (read-only: serial + sku + qty + select) -->
                <div style="overflow-x:auto;">
                    <table class="manager-data-table">
                        <thead>
                            <tr><th style="width:52px;text-align:center;">PRINT</th><th>SERIAL NUMBER</th><th>PRODUCT SKU</th><th style="width:80px;text-align:center;">QTY</th></tr>
                        </thead>
                        <tbody>
                            ${totalCount === 0 ? `
                                <tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-secondary);">No records. Pick a batch above and click Load, or generate from the Generate page.</td></tr>
                            ` : this.dataset.map((r, i) => `
                                <tr>
                                    <td style="text-align:center;"><input type="checkbox" class="bp-row-chk" data-i="${i}" ${this.selectedIndices.has(i) ? 'checked' : ''} /></td>
                                    <td style="font-family:monospace;font-weight:600;">${this.escapeHtml(r.serialNumber || '')}</td>
                                    <td>${this.escapeHtml(r.sku || r.productTitle || '')}</td>
                                    <td style="text-align:center;"><input type="number" class="bp-row-qty" data-i="${i}" min="1" value="${r._qty || 1}" style="width:56px;padding:4px 6px;border:1px solid var(--border-color,#cbd5e1);border-radius:6px;text-align:center;" /></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;

        this.bindSimplified();
    }

    private activeBatchNumber: string = '__all__';

    private currentTemplateId(): string {
        return this.availableTemplates.find(t => t.layout && JSON.stringify(t.layout) === JSON.stringify(this.currentLayout))?.id
            || this.availableTemplates[0]?.id || '';
    }

    private listBatches(): any[] {
        try {
            const r = localStorage.getItem('qrlayout_db_batches_v2');
            return r ? JSON.parse(r) : [];
        } catch { return []; }
    }

    private loadRecordsForBatch(batchNumber: string): void {
        const allSerials = (() => { try { const r = localStorage.getItem('qrlayout_db_serials_v2'); return r ? JSON.parse(r) : []; } catch { return []; } })();
        let rows = allSerials;
        if (batchNumber !== '__all__') rows = allSerials.filter((s: any) => s.batchNumber === batchNumber);
        this.dataset = rows.map((s: any) => ({
            serialNumber: s.serialNumber, sku: s.sku, productTitle: s.productTitle,
            category: s.category, plant: s.plant, color: s.color, warranty: s.warranty, _qty: 1, ...(s.variables || {})
        }));
        this.selectedIndices = new Set(this.dataset.map((_, i) => i));
        this.activeBatchNumber = batchNumber;
        this.render();
    }

    private bindSimplified(): void {
        const q = (s: string) => this.container.querySelector<any>(s);

        q('#bp-template')?.addEventListener('change', (e: any) => {
            const id = e.target.value;
            const tpl = this.availableTemplates.find((t: any) => t.id === id);
            if (tpl) { this.setLayout(JSON.parse(JSON.stringify(tpl.layout))); }
        });
        q('#bp-printer')?.addEventListener('change', (e: any) => { this.selectedPrinterId = e.target.value; });
        q('#bp-save-default')?.addEventListener('click', () => {
            this.saveDefault('quick.print.qty', q('#bp-qty')?.value || '1');
            this.saveDefault('quick.print.printer', q('#bp-printer')?.value || '');
            alert('✅ Default print settings saved.');
        });
        q('#bp-load')?.addEventListener('click', () => {
            const v = q('#bp-batch')?.value || '__all__';
            this.saveDefault('quick.print.batch', v);
            this.loadRecordsForBatch(v);
        });
        q('#bp-batch')?.addEventListener('change', (e: any) => {
            if (e.target.value !== '__all__') this.loadRecordsForBatch(e.target.value);
        });
        q('#bp-print')?.addEventListener('click', () => this.quickPrint());
        q('#bp-export-pdf')?.addEventListener('click', () => this.exportBatchPDF());
        q('#bp-export-zpl')?.addEventListener('click', () => this.showZPLModal());

        this.container.querySelectorAll<HTMLInputElement>('.bp-row-chk').forEach(cb => {
            cb.addEventListener('change', () => {
                const i = parseInt(cb.dataset.i!, 10);
                if (cb.checked) this.selectedIndices.add(i); else this.selectedIndices.delete(i);
                this.render();
            });
        });
        this.container.querySelectorAll<HTMLInputElement>('.bp-row-qty').forEach(inp => {
            inp.addEventListener('change', () => {
                const i = parseInt(inp.dataset.i!, 10);
                if (this.dataset[i]) this.dataset[i]._qty = Math.max(1, parseInt(inp.value || '1', 10) || 1);
                this.render();
            });
        });
    }

    private setZoom(val: number) {
        this.zoomLevel = Math.max(0.2, Math.min(2.5, val));
        const box = this.container.querySelector<HTMLElement>('#sheet-shadow-box');
        if (box) box.style.transform = `scale(${this.zoomLevel})`;
        const txt = this.container.querySelector('.zoom-text');
        if (txt) txt.textContent = `${Math.round(this.zoomLevel * 100)}%`;
    }

    private fitZoomToContainer() {
        const vp = this.container.querySelector<HTMLElement>('#sheet-viewport');
        if (vp) {
            const availW = vp.clientWidth - 48;
            const availH = vp.clientHeight - 48;
            const sheetW = this.activePreset.paperWidthMm * (96 / 25.4);
            const sheetH = this.activePreset.paperHeightMm * (96 / 25.4);
            const scaleW = availW / sheetW;
            const scaleH = availH / sheetH;
            this.setZoom(Math.min(scaleW, scaleH, 1.2));
        }
    }

    private async renderActiveSheet() {
        const canvas = this.container.querySelector<HTMLCanvasElement>('#sheet-canvas');
        if (!canvas) return;

        try {
            const rendered = await this.renderer.renderSheetToCanvas(
                this.currentSheetIndex,
                this.currentLayout,
                this.dataset,
                this.selectedIndices,
                {
                    sheetPreset: this.activePreset,
                    showCutMarks: this.showCutMarks,
                    showBorderOutlines: this.showBorderOutlines,
                    showNumberBadge: this.showNumberBadge,
                    startOffset: this.startOffset,
                    dpi: 120 // Crisp screen preview
                }
            );

            canvas.width = rendered.width;
            canvas.height = rendered.height;
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.drawImage(rendered, 0, 0);
        } catch (err) {
            console.error('Error rendering sheet:', err);
        }
    }

    /**
     * CSV Import with automatic header detection
     */
    private importCSV(file: File) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = (e.target?.result as string) || '';
            const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length < 2) {
                alert('CSV file is empty or missing headers.');
                return;
            }

            const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
            const rows: Record<string, any>[] = [];

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
                const obj: Record<string, any> = {};
                headers.forEach((h, hIdx) => {
                    obj[h] = values[hIdx] ?? '';
                });
                rows.push(obj);
            }

            this.dataset = rows;
            this.selectAll();
            this.currentSheetIndex = 0;
            this.render();
        };
        reader.readAsText(file);
    }

    /**
     * CSV Export
     */
    private exportCSV() {
        if (this.dataset.length === 0) return;
        const keys = Object.keys(this.dataset[0]);
        let csv = keys.join(',') + '\n';
        this.dataset.forEach(row => {
            csv += keys.map(k => `"${String(row[k] ?? '').replace(/"/g, '""')}"`).join(',') + '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `batch_data_${this.currentLayout.targetEntity || 'labels'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Trigger native browser print dialog with accurate CSS page layout
     */
    private async triggerBrowserPrint() {
        const printContainer = this.container.querySelector<HTMLElement>('#print-media-container');
        if (!printContainer) return;

        printContainer.innerHTML = '<div class="print-loading-msg">Preparing high-resolution print pages...</div>';
        const totalSheets = this.renderer.calculateSheetCount(this.dataset.length, this.activePreset, this.startOffset);

        let html = '';
        for (let s = 0; s < totalSheets; s++) {
            const sheetCanvas = await this.renderer.renderSheetToCanvas(s, this.currentLayout, this.dataset, this.selectedIndices, {
                sheetPreset: this.activePreset,
                showCutMarks: this.showCutMarks,
                showBorderOutlines: this.showBorderOutlines,
                showNumberBadge: false, // Don't print item numbers on final paper
                startOffset: this.startOffset,
                dpi: 300 // High-res for printer
            });
            const dataUrl = sheetCanvas.toDataURL('image/png');
            html += `
            <div class="print-page-sheet" style="width:${this.activePreset.paperWidthMm}mm; height:${this.activePreset.paperHeightMm}mm; page-break-after: always;">
                <img src="${dataUrl}" style="width:100%; height:100%; object-fit:contain; display:block;" />
            </div>
            `;
        }

        printContainer.innerHTML = html;

        setTimeout(() => {
            window.print();
        }, 300);
    }

    /**
     * Multi-Page PDF Download
     */
    private async exportBatchPDF() {
        const btn = this.container.querySelector<HTMLButtonElement>('#btn-export-pdf');
        if (btn) btn.textContent = 'Generating PDF...';

        try {
            const pdf = await this.renderer.exportBatchPDF(
                this.currentLayout,
                this.dataset,
                this.selectedIndices,
                {
                    sheetPreset: this.activePreset,
                    showCutMarks: this.showCutMarks,
                    showBorderOutlines: this.showBorderOutlines,
                    showNumberBadge: false,
                    startOffset: this.startOffset
                }
            );

            pdf.save(`batch_labels_${this.currentLayout.id}_${Date.now()}.pdf`);
        } catch (err) {
            console.error('PDF export error:', err);
            alert('Failed to generate PDF. Check console for details.');
        } finally {
            if (btn) btn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>
                Export PDF
            `;
        }
    }

    /**
     * Download PNG of current sheet
     */
    private async exportSheetPNG() {
        const canvas = await this.renderer.renderSheetToCanvas(
            this.currentSheetIndex,
            this.currentLayout,
            this.dataset,
            this.selectedIndices,
            {
                sheetPreset: this.activePreset,
                showCutMarks: this.showCutMarks,
                showBorderOutlines: this.showBorderOutlines,
                showNumberBadge: false,
                startOffset: this.startOffset,
                dpi: 300
            }
        );

        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `sheet_${this.currentSheetIndex + 1}_${this.currentLayout.id}.png`;
        a.click();
    }

    /**
     * Show ZPL Modal for Zebra Thermal Printers
     */
    private showZPLModal() {
        const zpl = this.renderer.generateBatchZPL(this.currentLayout, this.dataset, this.selectedIndices, 203);
        const modal = document.createElement('div');
        modal.className = 'dashboard-modal-backdrop';
        modal.innerHTML = `
        <div class="dashboard-modal-box">
            <div class="modal-header">
                <h3>📟 Zebra Thermal Printer ZPL Code</h3>
                <button class="modal-close-btn">✕</button>
            </div>
            <div class="modal-body">
                <p style="font-size:0.8125rem; color:var(--text-secondary); margin-bottom:12px;">
                    Copy this ZPL (Zebra Programming Language) script directly to your thermal printer via raw socket, USB driver, or print server.
                </p>
                <textarea class="zpl-code-area" readonly>${zpl}</textarea>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline" id="btn-copy-zpl">📋 Copy ZPL to Clipboard</button>
                <button class="btn btn-primary" id="btn-download-zpl">💾 Download .zpl File</button>
            </div>
        </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.modal-close-btn')?.addEventListener('click', () => modal.remove());
        modal.querySelector('#btn-copy-zpl')?.addEventListener('click', () => {
            navigator.clipboard.writeText(zpl);
            alert('ZPL code copied to clipboard!');
        });
        modal.querySelector('#btn-download-zpl')?.addEventListener('click', () => {
            const blob = new Blob([zpl], { type: 'text/plain' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `batch_${this.currentLayout.id}.zpl`;
            a.click();
        });
    }
}
