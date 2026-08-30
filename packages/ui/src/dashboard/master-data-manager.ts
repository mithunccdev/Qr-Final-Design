import {
    MasterDataType,
    MasterDataOption,
    MASTER_DATA_TYPES,
    getMasterData,
    addMasterData,
    updateMasterData,
    deleteMasterData
} from './master-data';
import {
    SerialNumberLogicRule,
    BatchNumberLogicRule,
    loadSerialLogicRules,
    saveSerialLogicRule,
    getSerialLogicRule,
    loadBatchLogicRules,
    saveBatchLogicRule,
    getBatchLogicRule,
    generateSerialNumberPreview,
    generateBatchNumberPreview,
    getMasterCodesMapping,
    DEFAULT_SERIAL_RULES,
    DEFAULT_BATCH_RULES,
    persistSerialLogicRulesToDb,
    persistBatchLogicRulesToDb,
    hydrateSerialLogicRulesFromDb,
    hydrateBatchLogicRulesFromDb
} from './serial-batch-logic';
import { supabaseService } from '../supabase';
import { esc } from '../escape';

type ViewMode = 'list' | 'create' | 'edit';

export class MasterDataManagerView {
    private container: HTMLElement;
    private activeType: MasterDataType = 'plant';
    private view: ViewMode = 'list';
    private editingCode: string | null = null;
    private selectedPlantForRule = 'ALL';
    private searchQuery = '';

    constructor(container: HTMLElement) {
        this.container = container;
        this.render();
    }

    private typeDef() {
        return MASTER_DATA_TYPES.find(t => t.type === this.activeType) || MASTER_DATA_TYPES[0];
    }

    private isPlant() { return this.activeType === 'plant'; }
    private isVendor() { return this.activeType === 'vendor'; }
    private isFinancialYear() { return this.activeType === 'financial_year'; }
    private isMonth() { return this.activeType === 'month'; }
    private isVariable() { return this.activeType === 'variable'; }
    private isSerialLogic() { return this.activeType === 'serial_logic'; }
    private isBatchLogic() { return this.activeType === 'batch_logic'; }

    /** Types that support Code for Serial number and Code for Batch number */
    private supportsSerialAndBatchCode(): boolean {
        return ['plant', 'vendor', 'financial_year', 'month', 'date', 'category', 'group'].includes(this.activeType);
    }

    private getSubheading(): string {
        switch (this.activeType) {
            case 'plant':
                return 'Manufacturing plant definitions with plant code, serial code and batch code.';
            case 'vendor':
                return 'Vendors mapped to plant codes with serial and batch tracking codes.';
            case 'financial_year':
                return 'Financial year codes with serial and batch tracking codes for fiscal accounting.';
            case 'month':
                return 'Standard calendar months with serial code and batch code for date-based serialization.';
            case 'date':
                return 'Days of a month (01–31) with serial code and batch code for day-based serialization.';
            case 'category':
                return 'Product categories with serial and batch code segments.';
            case 'group':
                return 'Product groups with serial and batch code segments.';
            case 'variable':
                return 'Common variables shared by all products.';
            case 'serial_logic':
                return 'Define serialization structure, segment inclusions, sequence length, and start numbers per plant.';
            case 'batch_logic':
                return 'Define manufacturing batch / lot numbering format, plant codes, and sequence resets.';
            default:
                return 'Each option has a unique ID (code) used in product dropdowns.';
        }
    }

    private getSerialPlaceholder(): string {
        switch (this.activeType) {
            case 'plant': return 'e.g. K / G / B';
            case 'vendor': return 'e.g. V1 / V2';
            case 'financial_year': return 'e.g. 25 / 26';
            case 'month': return 'e.g. 01 / JAN';
            case 'date': return 'e.g. 01 / 15 / 31';
            case 'category': return 'e.g. FC / SW';
            case 'group': return 'e.g. SH / MX';
            default: return 'e.g. SN-01';
        }
    }

    private getBatchPlaceholder(): string {
        switch (this.activeType) {
            case 'plant': return 'e.g. KS / KG / KB';
            case 'vendor': return 'e.g. VB1 / VB2';
            case 'financial_year': return 'e.g. F25 / F26';
            case 'month': return 'e.g. M01 / JAN';
            case 'date': return 'e.g. D01 / D15 / D31';
            case 'category': return 'e.g. BFC / BSW';
            case 'group': return 'e.g. BSH / BMX';
            default: return 'e.g. BT-01';
        }
    }

    private render() {
        if (this.isSerialLogic()) {
            this.renderSerialLogicPage();
            return;
        }
        if (this.isBatchLogic()) {
            this.renderBatchLogicPage();
            return;
        }
        if (this.view === 'create') { this.renderFormPage(null); return; }
        if (this.view === 'edit' && this.editingCode) {
            const option = getMasterData(this.activeType).find(o => o.code === this.editingCode);
            if (option) { this.renderFormPage(option); return; }
            this.view = 'list';
        }
        this.renderListPage();
    }

    // ── TYPE SUB-NAV + LIST PAGE ────────────────────────────────────────────────
    private renderListPage() {
        const records = getMasterData(this.activeType);
        const def = this.typeDef();
        const hasSerialBatch = this.supportsSerialAndBatchCode();
        const hasPlantCode = this.isPlant() || this.isVendor();

        const q = this.searchQuery.trim().toLowerCase();
        const filtered = q
            ? records.filter(r =>
                String(r.code || '').toLowerCase().includes(q) ||
                String(r.label || '').toLowerCase().includes(q)
              )
            : records;

        let colCount = 3; // ID, Label, Actions
        if (hasPlantCode) colCount += 1;
        if (this.isFinancialYear()) colCount += 1;
        if (hasSerialBatch) colCount += 2;
        if (this.isVariable()) colCount += 1;

        this.container.innerHTML = `
        <div class="entity-manager-root">
            <div class="master-type-nav">
                ${MASTER_DATA_TYPES.map(t => `
                    <button class="master-type-tab ${this.activeType === t.type ? 'active' : ''}" data-type="${esc(t.type)}">
                        <span>${esc(t.icon)}</span> <span>${esc(t.label)}</span>
                    </button>
                `).join('')}
            </div>

            <div class="manager-card-panel">
                <div class="panel-header-row">
                    <div>
                        <h2 class="panel-heading">${esc(def.icon)} ${esc(def.label)}</h2>
                        <p class="panel-subheading">${esc(this.getSubheading())}</p>
                    </div>
                    <button class="btn btn-primary" id="btn-add-master-entry">
                        ➕ Add ${esc(def.label.replace(/s$/, ''))}
                    </button>
                </div>

                <div class="manager-toolbar">
                    <div class="search-input-wrapper">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                        <input type="text" id="master-search" placeholder="Search by code or label…" value="${esc(this.searchQuery)}" />
                    </div>
                    <span class="toolbar-count">${filtered.length} of ${records.length} ${esc(def.label.toLowerCase())}</span>
                </div>

                <div class="manager-table-wrapper" style="margin-top:0;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>ID / Code</th>
                                <th>Label / Name</th>
                                ${hasPlantCode ? '<th>Plant Code</th>' : ''}
                                ${this.isFinancialYear() ? '<th>FY Structure</th>' : ''}
                                ${hasSerialBatch ? '<th>Code for Serial No</th><th>Code for Batch No</th>' : ''}
                                ${this.isVariable() ? '<th>Default Value</th>' : ''}
                                <th style="text-align:right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filtered.length === 0 ? `
                                <tr>
                                    <td colspan="${colCount}">
                                        <div class="master-empty-state">
                                            <div class="empty-icon">🗂️</div>
                                            <div class="empty-title">No ${esc(def.label.toLowerCase())} found</div>
                                            <div class="empty-sub">${q ? 'Try a different search term.' : `Click "Add ${esc(def.label.replace(/s$/, ''))}" above to create one.`}</div>
                                        </div>
                                    </td>
                                </tr>
                            ` : filtered.map(r => `
                                <tr>
                                    <td><span class="code-badge-pill" style="font-weight:700;font-family:monospace;">${esc(r.code)}</span></td>
                                    <td style="font-weight:600;">${esc(r.label)}</td>
                                    ${hasPlantCode ? `<td><span class="nav-item-badge badge-neutral" style="font-family:monospace;font-weight:700;">${esc(r.plantCode || '—')}</span></td>` : ''}
                                    ${this.isFinancialYear() ? `<td><span class="nav-item-badge badge-indigo" style="font-size:0.75rem;">${esc(r.fyStructure || 'April to March')}</span></td>` : ''}
                                    ${hasSerialBatch ? `
                                        <td>
                                            ${r.serialCode ? `<span class="nav-item-badge badge-emerald" style="font-family:monospace;font-weight:700;">${esc(r.serialCode)}</span>` : '<span style="color:var(--text-secondary);font-size:0.75rem;">—</span>'}
                                        </td>
                                        <td>
                                            ${r.batchCode ? `<span class="nav-item-badge badge-cyan" style="font-family:monospace;font-weight:700;">${esc(r.batchCode)}</span>` : '<span style="color:var(--text-secondary);font-size:0.75rem;">—</span>'}
                                        </td>
                                    ` : ''}
                                    ${this.isVariable() ? `<td style="font-family:monospace;color:var(--text-secondary);">${esc(r.defaultValue || '—')}</td>` : ''}
                                    <td style="text-align:right;">
                                        <div style="display:flex;gap:6px;justify-content:flex-end;">
                                            <button class="btn btn-sm btn-outline" data-action="edit" data-code="${esc(r.code)}" title="Edit">✏️</button>
                                            <button class="btn btn-sm btn-outline" data-action="delete" data-code="${esc(r.code)}" title="Delete" style="color:#ef4444;border-color:#fee2e2;">🗑️</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;

        this.bindListEvents();
    }

    private bindListEvents() {
        this.container.querySelectorAll<HTMLButtonElement>('.master-type-tab').forEach(b => {
            b.addEventListener('click', () => {
                const t = b.dataset.type as MasterDataType;
                if (t && t !== this.activeType) {
                    this.activeType = t;
                    this.view = 'list';
                    this.searchQuery = '';
                    this.render();
                }
            });
        });

        const search = this.container.querySelector<HTMLInputElement>('#master-search');
        if (search) {
            search.addEventListener('input', (e) => {
                this.searchQuery = (e.target as HTMLInputElement).value;
                // Re-render, then restore focus & caret so typing feels seamless
                const pos = search.selectionStart ?? this.searchQuery.length;
                this.render();
                const next = this.container.querySelector<HTMLInputElement>('#master-search');
                if (next) {
                    next.focus();
                    try { next.setSelectionRange(pos, pos); } catch { /* ignore */ }
                }
            });
        }

        this.container.querySelector('#btn-add-master-entry')?.addEventListener('click', () => {
            this.view = 'create';
            this.render();
        });

        this.container.querySelectorAll<HTMLButtonElement>('[data-action="edit"]').forEach(b => {
            b.addEventListener('click', () => {
                this.editingCode = b.dataset.code || null;
                this.view = 'edit';
                this.render();
            });
        });

        this.container.querySelectorAll<HTMLButtonElement>('[data-action="delete"]').forEach(b => {
            b.addEventListener('click', () => {
                const code = b.dataset.code;
                if (!code) return;
                if (confirm(`Delete "${code}" from ${this.typeDef().label}?`)) {
                    deleteMasterData(this.activeType, code);
                    void supabaseService.deleteMasterData(this.activeType, code);
                    this.render();
                }
            });
        });
    }

    /** Renders a single "Master Code Segment Inclusion" card with a per-segment Pad input and reorder arrows. */
    private codeSegmentCard(o: {
        checkboxId: string;
        padId: string;
        title: string;
        active?: { code: string; badge: string };
        desc?: string;
        manage?: { tab: string; label: string };
        checked: boolean;
        pad: number;
        noPad?: boolean;
        segKey?: string;
        count?: number;
        reorderable?: boolean;
    }): string {
        const activeHtml = o.active
            ? `Active: <span class="nav-item-badge ${o.active.badge}" style="font-family: monospace; font-weight: 700;">${esc(o.active.code)}</span>`
            : esc(o.desc || '');
        const padHtml = o.noPad
            ? ''
            : `<label style="display:flex;align-items:center;gap:4px;font-size:0.7rem;color:var(--text-secondary);cursor:text;">
                    Pad
                    <input type="number" id="${o.padId}" min="0" max="8" value="${o.pad}" style="width:46px;padding:2px 4px;font-size:0.75rem;border:1px solid var(--line);border-radius:5px;text-align:center;" />
                </label>`;
        const reorderHtml = o.reorderable && o.count > 1
            ? `<span style="display:inline-flex;gap:2px;" class="seg-reorder" data-seg="${esc(o.segKey)}">
                    <button type="button" class="btn-reorder btn-reorder-up" title="Move earlier">▲</button>
                    <button type="button" class="btn-reorder btn-reorder-down" title="Move later">▼</button>
                </span>`
            : '';
        const footer = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;padding-top:6px;border-top:1px dashed var(--line);">
                ${padHtml}
                <span style="display:inline-flex;align-items:center;gap:6px;">
                    ${o.manage ? `<button class="btn btn-sm btn-outline btn-jump-master" data-tab="${esc(o.manage.tab)}" style="font-size:0.72rem;padding:2px 6px;">⚙️ Manage ${esc(o.manage.label)} ➔</button>` : ''}
                    ${reorderHtml}
                </span>
            </div>`;
        return `
        <div class="checkbox-label-card" style="display: flex; flex-direction: column; justify-content: space-between; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface);">
            <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; margin: 0;">
                <input type="checkbox" id="${o.checkboxId}" ${o.checked ? 'checked' : ''} style="margin-top: 3px;" />
                <div>
                    <div style="font-weight: 700; font-size: 0.8125rem;">${esc(o.title)}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">${activeHtml}</div>
                </div>
            </label>
            ${footer}
        </div>`;
    }

    /** Render the segment cards ordered by the rule's segmentOrder (unlisted ones appended). */
    private renderOrderedSegmentCards(kind: 'serial' | 'batch', rule: any, cfgs: any[]): string {
        const order = (rule.segmentOrder || []).map(String);
        const PRIORITY = kind === 'serial'
            ? ['custom_prefix', 'plant', 'vendor', 'financial_year', 'month', 'category', 'group', 'sku', 'color', 'sequence']
            : ['custom_prefix', 'plant', 'vendor', 'financial_year', 'month', 'category', 'group', 'shift', 'sequence'];
        const pos = (seg: string) => {
            const i = order.indexOf(seg);
            if (i !== -1) return i;
            const p = PRIORITY.indexOf(seg);
            return order.length + (p >= 0 ? p : 99);
        };
        const sorted = [...cfgs].sort((a, b) => pos(a.segKey) - pos(b.segKey));
        return sorted.map(c => this.codeSegmentCard({ ...c, count: order.length, reorderable: true })).join('');
    }

    /** Move a segment earlier/later within the rule's segmentOrder and persist. */
    private moveSegment(kind: 'serial' | 'batch', seg: string, dir: -1 | 1): void {
        const rule = kind === 'serial'
            ? getSerialLogicRule(this.selectedPlantForRule)
            : getBatchLogicRule(this.selectedPlantForRule);
        const order = [...(rule.segmentOrder || [])].map(String);
        let i = order.indexOf(seg);
        if (i === -1) { order.push(seg); i = order.length - 1; }
        const j = i + dir;
        if (j < 0 || j >= order.length) return;
        [order[i], order[j]] = [order[j], order[i]];
        rule.segmentOrder = order as any;
        if (kind === 'serial') { saveSerialLogicRule(rule as any); void persistSerialLogicRulesToDb(); }
        else { saveBatchLogicRule(rule as any); void persistBatchLogicRulesToDb(); }
        this.render();
    }

    /** Bind the segment reorder (▲/▼) buttons. */
    private bindReorder(kind: 'serial' | 'batch'): void {
        this.container.querySelectorAll<HTMLButtonElement>('.btn-reorder-up').forEach(b => {
            b.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const seg = (b.closest('.seg-reorder') as HTMLElement)?.dataset?.seg;
                if (seg) this.moveSegment(kind, seg, -1);
            });
        });
        this.container.querySelectorAll<HTMLButtonElement>('.btn-reorder-down').forEach(b => {
            b.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const seg = (b.closest('.seg-reorder') as HTMLElement)?.dataset?.seg;
                if (seg) this.moveSegment(kind, seg, 1);
            });
        });
    }

    // ── 🔢 SERIAL NUMBER LOGIC BUILDER ──────────────────────────────────────────
    private renderSerialLogicPage() {
        const rule = getSerialLogicRule(this.selectedPlantForRule);
        const segCount = rule.segmentOrder.length;
        const plants = getMasterData('plant');
        const targetPlant = this.selectedPlantForRule !== 'ALL' ? this.selectedPlantForRule : 'KSPL';
        const preview = generateSerialNumberPreview(rule, { plant: targetPlant });
        const mapping = getMasterCodesMapping(targetPlant, false);

        this.container.innerHTML = `
        <div class="entity-manager-root">
            <div class="master-type-nav">
                ${MASTER_DATA_TYPES.map(t => `
                    <button class="master-type-tab ${this.activeType === t.type ? 'active' : ''}" data-type="${esc(t.type)}">
                        <span>${esc(t.icon)}</span> <span>${esc(t.label)}</span>
                    </button>
                `).join('')}
            </div>

            <div class="manager-card-panel" style="max-width: 980px; margin: 0 auto; width: 100%;">
                <div class="panel-header-row" style="align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
                    <div>
                        <h2 class="panel-heading">🔢 Serial Number Logic &amp; Rule Builder</h2>
                        <p class="panel-subheading">Configure serialization format, active master code inclusions, sequence length/padding, and per-plant rules.</p>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-outline" id="btn-reset-serial-logic">🔄 Reset Defaults</button>
                        <button class="btn btn-primary" id="btn-save-serial-logic">💾 Save Serial Logic</button>
                    </div>
                </div>

                <!-- INTEGRATION CALLOUT BANNER -->
                <div style="background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.25); border-radius: 8px; padding: 12px 16px; margin-top: 14px; display: flex; align-items: flex-start; gap: 10px;">
                    <span style="font-size: 1.25rem;">🔗</span>
                    <div style="font-size: 0.8125rem; color: var(--text-primary); line-height: 1.4;">
                        <strong>Connected to Master Tables:</strong> All codes used in serial number generation are managed separately in their respective master pages (Plants, Financial Years, Months, Categories, etc.). Any change made in those master pages is automatically reflected here in real time.
                    </div>
                </div>

                <!-- PLANT SELECTOR TABS -->
                <div style="display: flex; gap: 8px; margin-top: 16px; border-bottom: 1px solid var(--line); padding-bottom: 12px; flex-wrap: wrap;">
                    <span style="font-size: 0.8125rem; font-weight: 700; color: var(--text-secondary); align-self: center; margin-right: 6px;">Target Plant:</span>
                    <button class="btn btn-sm ${this.selectedPlantForRule === 'ALL' ? 'btn-primary' : 'btn-outline'} btn-serial-plant-tab" data-plant="ALL">
                        🌐 All Plants (Global Default)
                    </button>
                    ${plants.map(p => `
                        <button class="btn btn-sm ${this.selectedPlantForRule === (p.label || p.code) ? 'btn-primary' : 'btn-outline'} btn-serial-plant-tab" data-plant="${esc(p.label || p.code)}">
                            🏭 ${esc(p.label)} (${esc(p.serialCode || p.code)})
                        </button>
                    `).join('')}
                </div>

                <div style="display: flex; flex-direction: column; gap: 20px; margin-top: 20px;">
                    <!-- LIVE PREVIEW CARD -->
                    <div style="background: var(--surface-muted); border: 2px solid var(--accent); border-radius: 12px; padding: 20px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                            <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--accent); letter-spacing: 0.05em;">
                                Live Generated Serial Preview
                            </span>
                            <span class="nav-item-badge badge-indigo" id="preview-serial-length" style="font-family: monospace; font-weight: 700;">
                                ${preview.length} Characters
                            </span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span id="preview-serial-code" style="font-size: 1.75rem; font-weight: 800; font-family: monospace; color: var(--text-primary); letter-spacing: 0.02em;">
                                ${preview.code}
                            </span>
                        </div>
                        <div id="preview-serial-breakdown" style="display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap;">
                            ${this.renderSerialBreakdownPills(rule, preview.segments)}
                        </div>
                    </div>

                    <!-- RULE DETAILS & DELIMITER -->
                    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 16px;">
                        <div class="form-group">
                            <label style="font-weight: 700; font-size: 0.8125rem;">Rule Description / Name</label>
                            <input type="text" id="sl-rule-name" value="${rule.ruleName}" style="width: 100%; font-weight: 600;" />
                        </div>
                        <div class="form-group">
                            <label style="font-weight: 700; font-size: 0.8125rem;">Segment Delimiter (Separator)</label>
                            <select id="sl-delimiter" class="filter-dropdown" style="width: 100%;">
                                <option value="-" ${rule.delimiter === '-' ? 'selected' : ''}>Hyphen (-)</option>
                                <option value="/" ${rule.delimiter === '/' ? 'selected' : ''}>Slash (/)</option>
                                <option value="_" ${rule.delimiter === '_' ? 'selected' : ''}>Underscore (_)</option>
                                <option value="." ${rule.delimiter === '.' ? 'selected' : ''}>Dot (.)</option>
                                <option value="" ${rule.delimiter === '' ? 'selected' : ''}>None (No Separator)</option>
                            </select>
                        </div>
                    </div>

                    <!-- CODE INCLUSIONS & SEGMENTS -->
                    <div class="settings-section-card" style="padding: 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                            <h3 style="font-size: 0.9375rem; font-weight: 700; margin: 0; color: var(--text-primary);">
                                🧩 Master Code Segment Inclusions
                            </h3>
                            <span style="font-size: 0.75rem; color: var(--text-secondary);">
                                Active values pulled directly from Master pages
                            </span>
                        </div>

                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px;">
                            ${this.renderOrderedSegmentCards('serial', rule, [
                                { checkboxId: 'inc-sl-plant', padId: 'pad-sl-plant', title: 'Plant Serial Code', active: { code: mapping.plant.code, badge: 'badge-emerald' }, manage: { tab: 'plant', label: 'in Plants Master' }, checked: rule.inclusions.includePlant, pad: rule.segmentPadding?.plant ?? rule.sequencePadding, segKey: 'plant' },
                                { checkboxId: 'inc-sl-fy', padId: 'pad-sl-fy', title: 'Financial Year Serial Code', active: { code: mapping.financialYear.code, badge: 'badge-indigo' }, manage: { tab: 'financial_year', label: 'in FY Master' }, checked: rule.inclusions.includeFinancialYear, pad: rule.segmentPadding?.financial_year ?? rule.sequencePadding, segKey: 'financial_year' },
                                { checkboxId: 'inc-sl-month', padId: 'pad-sl-month', title: 'Month Serial Code', active: { code: mapping.month.code, badge: 'badge-cyan' }, manage: { tab: 'month', label: 'in Months Master' }, checked: rule.inclusions.includeMonth, pad: rule.segmentPadding?.month ?? rule.sequencePadding, segKey: 'month' },
                                { checkboxId: 'inc-sl-date', padId: 'pad-sl-date', title: 'Day Serial Code', active: { code: mapping.date.code, badge: 'badge-cyan' }, manage: { tab: 'date', label: 'in Dates Master' }, checked: rule.inclusions.includeDate, pad: rule.segmentPadding?.date ?? rule.sequencePadding, segKey: 'date' },
                                { checkboxId: 'inc-sl-category', padId: 'pad-sl-category', title: 'Category Serial Code', active: { code: mapping.category.code, badge: 'badge-emerald' }, manage: { tab: 'category', label: 'in Categories' }, checked: rule.inclusions.includeCategory, pad: rule.segmentPadding?.category ?? rule.sequencePadding, segKey: 'category' },
                                { checkboxId: 'inc-sl-group', padId: 'pad-sl-group', title: 'Group Serial Code', active: { code: mapping.group.code, badge: 'badge-emerald' }, manage: { tab: 'group', label: 'in Groups' }, checked: rule.inclusions.includeGroup, pad: rule.segmentPadding?.group ?? rule.sequencePadding, segKey: 'group' },
                                { checkboxId: 'inc-sl-vendor', padId: 'pad-sl-vendor', title: 'Vendor Serial Code', active: { code: mapping.vendor.code, badge: 'badge-neutral' }, manage: { tab: 'vendor', label: 'in Vendors' }, checked: rule.inclusions.includeVendor, pad: rule.segmentPadding?.vendor ?? rule.sequencePadding, segKey: 'vendor' },
                                { checkboxId: 'inc-sl-color', padId: 'pad-sl-color', title: 'Color / Finish Code', active: { code: mapping.color.code, badge: 'badge-amber' }, manage: { tab: 'color', label: 'in Colors' }, checked: rule.inclusions.includeColor, pad: rule.segmentPadding?.color ?? rule.sequencePadding, segKey: 'color' },
                                { checkboxId: 'inc-sl-sku', padId: 'pad-sl-sku', title: 'Product SKU Segment', desc: 'Alphanumeric suffix from Product SKU', checked: rule.inclusions.includeSku, pad: rule.segmentPadding?.sku ?? rule.sequencePadding, segKey: 'sku' },
                                { checkboxId: 'inc-sl-short', padId: 'pad-sl-short', title: 'Product Short Code', desc: 'Short code from the Product master', checked: rule.inclusions.includeShortCode, pad: rule.segmentPadding?.short_code ?? rule.sequencePadding, segKey: 'short_code' },
                                { checkboxId: 'inc-sl-catalog', padId: 'pad-sl-catalog', title: 'Catalog / Part Code', desc: 'Catalog code from the Product master', checked: rule.inclusions.includeCatalogCode, pad: rule.segmentPadding?.catalog_code ?? rule.sequencePadding, segKey: 'catalog_code' }
                            ])}
                        </div>

                        <!-- CUSTOM STATIC PREFIX / SUFFIX -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px;">
                            <div class="form-group">
                                <label style="font-weight: 600; font-size: 0.8125rem;">Optional Static Prefix</label>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <input type="checkbox" id="inc-sl-prefix" ${rule.inclusions.includeCustomPrefix ? 'checked' : ''} />
                                    <input type="text" id="sl-custom-prefix" placeholder="e.g. SN" value="${rule.customPrefix || ''}" style="width: 100%; font-family: monospace;" />
                                </div>
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; font-size: 0.8125rem;">Optional Static Suffix</label>
                                <input type="text" id="sl-custom-suffix" placeholder="e.g. X" value="${rule.customSuffix || ''}" style="width: 100%; font-family: monospace;" />
                            </div>
                        </div>
                    </div>

                    <!-- SEQUENCE & LENGTH CONFIGURATION -->
                    <div class="settings-section-card" style="padding: 16px;">
                        <h3 style="font-size: 0.9375rem; font-weight: 700; margin: 0 0 12px 0; color: var(--text-primary);">
                            🔢 Sequence Number, Padding &amp; Reset Policy
                        </h3>

                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px;">
                            <div class="form-group">
                                <label style="font-weight: 700; font-size: 0.8125rem;">Sequence Digits (Padding Length)</label>
                                <select id="sl-padding" class="filter-dropdown" style="width: 100%;">
                                    <option value="3" ${rule.sequencePadding === 3 ? 'selected' : ''}>3 Digits (e.g. 001)</option>
                                    <option value="4" ${rule.sequencePadding === 4 ? 'selected' : ''}>4 Digits (e.g. 0001)</option>
                                    <option value="5" ${rule.sequencePadding === 5 ? 'selected' : ''}>5 Digits (e.g. 00001)</option>
                                    <option value="6" ${rule.sequencePadding === 6 ? 'selected' : ''}>6 Digits (e.g. 000001)</option>
                                    <option value="8" ${rule.sequencePadding === 8 ? 'selected' : ''}>8 Digits (e.g. 00000001)</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label style="font-weight: 700; font-size: 0.8125rem;">Sequence Start Number</label>
                                <input type="number" id="sl-seq-start" min="1" value="${rule.sequenceStartNumber || 1}" style="width: 100%; font-weight: 700;" />
                            </div>

                            <div class="form-group">
                                <label style="font-weight: 700; font-size: 0.8125rem;">Current Next Sequence</label>
                                <input type="number" id="sl-seq-current" min="1" value="${rule.currentSequence || 1}" style="width: 100%; font-weight: 700; color: var(--accent);" />
                            </div>

                            <div class="form-group">
                                <label style="font-weight: 700; font-size: 0.8125rem;">Auto-Reset Sequence Policy</label>
                                <select id="sl-reset-freq" class="filter-dropdown" style="width: 100%;">
                                    <option value="yearly" ${rule.resetFrequency === 'yearly' ? 'selected' : ''}>Reset Yearly on Fiscal Year (Apr 1)</option>
                                    <option value="monthly" ${rule.resetFrequency === 'monthly' ? 'selected' : ''}>Reset Monthly</option>
                                    <option value="daily" ${rule.resetFrequency === 'daily' ? 'selected' : ''}>Reset Daily</option>
                                    <option value="never" ${rule.resetFrequency === 'never' ? 'selected' : ''}>Continuous (Never Reset)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;

        this.bindSerialLogicEvents(rule);
    }

    private renderSerialBreakdownPills(rule: SerialNumberLogicRule, segs: Record<string, string>): string {
        const pills: string[] = [];
        if (rule.inclusions.includeCustomPrefix && segs.custom_prefix) {
            pills.push(`<span class="nav-item-badge badge-neutral">Prefix: <strong>${segs.custom_prefix}</strong></span>`);
        }
        if (rule.inclusions.includePlant && segs.plant) {
            pills.push(`<span class="nav-item-badge badge-neutral">Plant: <strong>${segs.plant}</strong></span>`);
        }
        if (rule.inclusions.includeVendor && segs.vendor) {
            pills.push(`<span class="nav-item-badge badge-neutral">Vendor: <strong>${segs.vendor}</strong></span>`);
        }
        if (rule.inclusions.includeFinancialYear && segs.financial_year) {
            pills.push(`<span class="nav-item-badge badge-indigo">FY: <strong>${segs.financial_year}</strong></span>`);
        }
        if (rule.inclusions.includeMonth && segs.month) {
            pills.push(`<span class="nav-item-badge badge-cyan">Month: <strong>${segs.month}</strong></span>`);
        }
        if (rule.inclusions.includeCategory && segs.category) {
            pills.push(`<span class="nav-item-badge badge-emerald">Cat: <strong>${segs.category}</strong></span>`);
        }
        if (rule.inclusions.includeGroup && segs.group) {
            pills.push(`<span class="nav-item-badge badge-emerald">Group: <strong>${segs.group}</strong></span>`);
        }
        if (rule.inclusions.includeSku && segs.sku) {
            pills.push(`<span class="nav-item-badge badge-neutral">SKU: <strong>${segs.sku}</strong></span>`);
        }
        if (rule.inclusions.includeColor && segs.color) {
            pills.push(`<span class="nav-item-badge badge-amber">Color: <strong>${segs.color}</strong></span>`);
        }
        pills.push(`<span class="nav-item-badge badge-emerald" style="border: 1px solid #10b981;">Sequence: <strong>${segs.sequence}</strong></span>`);
        return pills.join('');
    }

    private bindSerialLogicEvents(rule: SerialNumberLogicRule) {
        // Switch Plant
        this.container.querySelectorAll<HTMLButtonElement>('.btn-serial-plant-tab').forEach(b => {
            b.addEventListener('click', () => {
                this.selectedPlantForRule = b.dataset.plant || 'ALL';
                this.render();
            });
        });

        this.bindReorder('serial');

        // Quick Jump to Master Page
        this.container.querySelectorAll<HTMLButtonElement>('.btn-jump-master').forEach(b => {
            b.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const tab = b.dataset.tab as MasterDataType;
                if (tab) {
                    this.activeType = tab;
                    this.view = 'list';
                    this.render();
                }
            });
        });

        // Live preview updater on input change
        const updateLivePreview = () => {
            const currentRule: SerialNumberLogicRule = {
                ...rule,
                ruleName: (this.container.querySelector('#sl-rule-name') as HTMLInputElement).value.trim(),
                delimiter: (this.container.querySelector('#sl-delimiter') as HTMLSelectElement).value,
                customPrefix: (this.container.querySelector('#sl-custom-prefix') as HTMLInputElement).value.trim(),
                customSuffix: (this.container.querySelector('#sl-custom-suffix') as HTMLInputElement).value.trim(),
                sequencePadding: parseInt((this.container.querySelector('#sl-padding') as HTMLSelectElement).value, 10) || 4,
                sequenceStartNumber: parseInt((this.container.querySelector('#sl-seq-start') as HTMLInputElement).value, 10) || 1,
                currentSequence: parseInt((this.container.querySelector('#sl-seq-current') as HTMLInputElement).value, 10) || 1,
                resetFrequency: (this.container.querySelector('#sl-reset-freq') as HTMLSelectElement).value as any,
                segmentPadding: {
                    plant: parseInt((this.container.querySelector('#pad-sl-plant') as HTMLInputElement)?.value || '', 10),
                    financial_year: parseInt((this.container.querySelector('#pad-sl-fy') as HTMLInputElement)?.value || '', 10),
                    month: parseInt((this.container.querySelector('#pad-sl-month') as HTMLInputElement)?.value || '', 10),
                    category: parseInt((this.container.querySelector('#pad-sl-category') as HTMLInputElement)?.value || '', 10),
                    group: parseInt((this.container.querySelector('#pad-sl-group') as HTMLInputElement)?.value || '', 10),
                    vendor: parseInt((this.container.querySelector('#pad-sl-vendor') as HTMLInputElement)?.value || '', 10),
                    color: parseInt((this.container.querySelector('#pad-sl-color') as HTMLInputElement)?.value || '', 10),
                    sku: parseInt((this.container.querySelector('#pad-sl-sku') as HTMLInputElement)?.value || '', 10),
                    short_code: parseInt((this.container.querySelector('#pad-sl-short') as HTMLInputElement)?.value || '', 10),
                    catalog_code: parseInt((this.container.querySelector('#pad-sl-catalog') as HTMLInputElement)?.value || '', 10),
                    date: parseInt((this.container.querySelector('#pad-sl-date') as HTMLInputElement)?.value || '', 10)
                },
                inclusions: {
                    includePlant: (this.container.querySelector('#inc-sl-plant') as HTMLInputElement).checked,
                    includeFinancialYear: (this.container.querySelector('#inc-sl-fy') as HTMLInputElement).checked,
                    includeMonth: (this.container.querySelector('#inc-sl-month') as HTMLInputElement).checked,
                    includeDate: (this.container.querySelector('#inc-sl-date') as HTMLInputElement).checked,
                    includeCategory: (this.container.querySelector('#inc-sl-category') as HTMLInputElement).checked,
                    includeGroup: (this.container.querySelector('#inc-sl-group') as HTMLInputElement).checked,
                    includeSku: (this.container.querySelector('#inc-sl-sku') as HTMLInputElement).checked,
                    includeShortCode: (this.container.querySelector('#inc-sl-short') as HTMLInputElement).checked,
                    includeCatalogCode: (this.container.querySelector('#inc-sl-catalog') as HTMLInputElement).checked,
                    includeColor: (this.container.querySelector('#inc-sl-color') as HTMLInputElement).checked,
                    includeVendor: (this.container.querySelector('#inc-sl-vendor') as HTMLInputElement).checked,
                    includeCustomPrefix: (this.container.querySelector('#inc-sl-prefix') as HTMLInputElement).checked
                }
            };

            const preview = generateSerialNumberPreview(currentRule, { plant: this.selectedPlantForRule !== 'ALL' ? this.selectedPlantForRule : 'KSPL' });
            const codeEl = this.container.querySelector('#preview-serial-code');
            const lenEl = this.container.querySelector('#preview-serial-length');
            const pillsEl = this.container.querySelector('#preview-serial-breakdown');

            if (codeEl) codeEl.textContent = preview.code;
            if (lenEl) lenEl.textContent = `${preview.length} Characters`;
            if (pillsEl) pillsEl.innerHTML = this.renderSerialBreakdownPills(currentRule, preview.segments);
        };

        this.container.querySelectorAll('input, select').forEach(el => {
            el.addEventListener('input', updateLivePreview);
            el.addEventListener('change', updateLivePreview);
        });

        // Save
        this.container.querySelector('#btn-save-serial-logic')?.addEventListener('click', () => {
            const padOf = (id: string): number => {
                const el = this.container.querySelector<HTMLInputElement>('#' + id);
                const n = parseInt(el?.value || '', 10);
                return Number.isFinite(n) && n >= 0 ? n : rule.sequencePadding;
            };
            const updatedRule: SerialNumberLogicRule = {
                ...rule,
                plant: this.selectedPlantForRule,
                ruleName: (this.container.querySelector('#sl-rule-name') as HTMLInputElement).value.trim(),
                delimiter: (this.container.querySelector('#sl-delimiter') as HTMLSelectElement).value,
                customPrefix: (this.container.querySelector('#sl-custom-prefix') as HTMLInputElement).value.trim(),
                customSuffix: (this.container.querySelector('#sl-custom-suffix') as HTMLInputElement).value.trim(),
                sequencePadding: parseInt((this.container.querySelector('#sl-padding') as HTMLSelectElement).value, 10) || 4,
                sequenceStartNumber: parseInt((this.container.querySelector('#sl-seq-start') as HTMLInputElement).value, 10) || 1,
                currentSequence: parseInt((this.container.querySelector('#sl-seq-current') as HTMLInputElement).value, 10) || 1,
                resetFrequency: (this.container.querySelector('#sl-reset-freq') as HTMLSelectElement).value as any,
                segmentPadding: {
                    plant: padOf('pad-sl-plant'),
                    financial_year: padOf('pad-sl-fy'),
                    month: padOf('pad-sl-month'),
                    category: padOf('pad-sl-category'),
                    group: padOf('pad-sl-group'),
                    vendor: padOf('pad-sl-vendor'),
                    color: padOf('pad-sl-color'),
                    sku: padOf('pad-sl-sku'),
                    short_code: padOf('pad-sl-short'),
                    catalog_code: padOf('pad-sl-catalog'),
                    date: parseInt((this.container.querySelector('#pad-sl-date') as HTMLInputElement)?.value || '', 10)
                },
                inclusions: {
                    includePlant: (this.container.querySelector('#inc-sl-plant') as HTMLInputElement).checked,
                    includeFinancialYear: (this.container.querySelector('#inc-sl-fy') as HTMLInputElement).checked,
                    includeMonth: (this.container.querySelector('#inc-sl-month') as HTMLInputElement).checked,
                    includeDate: (this.container.querySelector('#inc-sl-date') as HTMLInputElement).checked,
                    includeCategory: (this.container.querySelector('#inc-sl-category') as HTMLInputElement).checked,
                    includeGroup: (this.container.querySelector('#inc-sl-group') as HTMLInputElement).checked,
                    includeSku: (this.container.querySelector('#inc-sl-sku') as HTMLInputElement).checked,
                    includeShortCode: (this.container.querySelector('#inc-sl-short') as HTMLInputElement).checked,
                    includeCatalogCode: (this.container.querySelector('#inc-sl-catalog') as HTMLInputElement).checked,
                    includeColor: (this.container.querySelector('#inc-sl-color') as HTMLInputElement).checked,
                    includeVendor: (this.container.querySelector('#inc-sl-vendor') as HTMLInputElement).checked,
                    includeCustomPrefix: (this.container.querySelector('#inc-sl-prefix') as HTMLInputElement).checked
                }
            };

            saveSerialLogicRule(updatedRule);
            void persistSerialLogicRulesToDb();
            this.render();
            alert(`✅ Serial Number Logic for ${this.selectedPlantForRule} saved successfully to the shared database!`);
        });

        // Reset
        this.container.querySelector('#btn-reset-serial-logic')?.addEventListener('click', () => {
            if (confirm('Reset to standard serial logic format?')) {
                const def = DEFAULT_SERIAL_RULES.find(r => r.plant === this.selectedPlantForRule) || DEFAULT_SERIAL_RULES[0];
                saveSerialLogicRule({ ...def, plant: this.selectedPlantForRule, id: `rule-serial-${this.selectedPlantForRule.toLowerCase()}` });
                void persistSerialLogicRulesToDb();
                this.render();
            }
        });

        // Master Tab Navigation
        this.container.querySelectorAll<HTMLButtonElement>('.master-type-tab').forEach(b => {
            b.addEventListener('click', () => {
                const t = b.dataset.type as MasterDataType;
                if (t && t !== this.activeType) {
                    this.activeType = t;
                    this.view = 'list';
                    this.render();
                }
            });
        });
    }

    // ── 📦 BATCH NUMBER LOGIC BUILDER ───────────────────────────────────────────
    private renderBatchLogicPage() {
        const rule = getBatchLogicRule(this.selectedPlantForRule);
        const segCount = rule.segmentOrder.length;
        const plants = getMasterData('plant');
        const targetPlant = this.selectedPlantForRule !== 'ALL' ? this.selectedPlantForRule : 'KSPL';
        const preview = generateBatchNumberPreview(rule, { plant: targetPlant });
        const mapping = getMasterCodesMapping(targetPlant, true);

        this.container.innerHTML = `
        <div class="entity-manager-root">
            <div class="master-type-nav">
                ${MASTER_DATA_TYPES.map(t => `
                    <button class="master-type-tab ${this.activeType === t.type ? 'active' : ''}" data-type="${esc(t.type)}">
                        <span>${esc(t.icon)}</span> <span>${esc(t.label)}</span>
                    </button>
                `).join('')}
            </div>

            <div class="manager-card-panel" style="max-width: 980px; margin: 0 auto; width: 100%;">
                <div class="panel-header-row" style="align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
                    <div>
                        <h2 class="panel-heading">📦 Batch Number Logic &amp; Rule Builder</h2>
                        <p class="panel-subheading">Configure manufacturing batch / lot numbering format, plant batch codes, lot sequence length, and auto-reset policies.</p>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-outline" id="btn-reset-batch-logic">🔄 Reset Defaults</button>
                        <button class="btn btn-primary" id="btn-save-batch-logic">💾 Save Batch Logic</button>
                    </div>
                </div>

                <!-- INTEGRATION CALLOUT BANNER -->
                <div style="background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.25); border-radius: 8px; padding: 12px 16px; margin-top: 14px; display: flex; align-items: flex-start; gap: 10px;">
                    <span style="font-size: 1.25rem;">🔗</span>
                    <div style="font-size: 0.8125rem; color: var(--text-primary); line-height: 1.4;">
                        <strong>Connected to Master Tables:</strong> All batch codes used in lot number generation are managed separately in their respective master pages (Plants, Financial Years, Months, Categories, etc.). Any change made in those master pages is automatically reflected here in real time.
                    </div>
                </div>

                <!-- PLANT SELECTOR TABS -->
                <div style="display: flex; gap: 8px; margin-top: 16px; border-bottom: 1px solid var(--line); padding-bottom: 12px; flex-wrap: wrap;">
                    <span style="font-size: 0.8125rem; font-weight: 700; color: var(--text-secondary); align-self: center; margin-right: 6px;">Target Plant:</span>
                    <button class="btn btn-sm ${this.selectedPlantForRule === 'ALL' ? 'btn-primary' : 'btn-outline'} btn-batch-plant-tab" data-plant="ALL">
                        🌐 All Plants (Global Default)
                    </button>
                    ${plants.map(p => `
                        <button class="btn btn-sm ${this.selectedPlantForRule === (p.label || p.code) ? 'btn-primary' : 'btn-outline'} btn-batch-plant-tab" data-plant="${esc(p.label || p.code)}">
                            🏭 ${esc(p.label)} (${esc(p.batchCode || p.code)})
                        </button>
                    `).join('')}
                </div>

                <div style="display: flex; flex-direction: column; gap: 20px; margin-top: 20px;">
                    <!-- LIVE PREVIEW CARD -->
                    <div style="background: var(--surface-muted); border: 2px solid var(--accent); border-radius: 12px; padding: 20px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                            <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--accent); letter-spacing: 0.05em;">
                                Live Generated Batch Code Preview
                            </span>
                            <span class="nav-item-badge badge-indigo" id="preview-batch-length" style="font-family: monospace; font-weight: 700;">
                                ${preview.length} Characters
                            </span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span id="preview-batch-code" style="font-size: 1.75rem; font-weight: 800; font-family: monospace; color: var(--text-primary); letter-spacing: 0.02em;">
                                ${preview.code}
                            </span>
                        </div>
                        <div id="preview-batch-breakdown" style="display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap;">
                            ${this.renderBatchBreakdownPills(rule, preview.segments)}
                        </div>
                    </div>

                    <!-- RULE DETAILS & DELIMITER -->
                    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 16px;">
                        <div class="form-group">
                            <label style="font-weight: 700; font-size: 0.8125rem;">Rule Name</label>
                            <input type="text" id="bl-rule-name" value="${rule.ruleName}" style="width: 100%; font-weight: 600;" />
                        </div>
                        <div class="form-group">
                            <label style="font-weight: 700; font-size: 0.8125rem;">Segment Delimiter</label>
                            <select id="bl-delimiter" class="filter-dropdown" style="width: 100%;">
                                <option value="-" ${rule.delimiter === '-' ? 'selected' : ''}>Hyphen (-)</option>
                                <option value="/" ${rule.delimiter === '/' ? 'selected' : ''}>Slash (/)</option>
                                <option value="_" ${rule.delimiter === '_' ? 'selected' : ''}>Underscore (_)</option>
                                <option value="" ${rule.delimiter === '' ? 'selected' : ''}>None (No Separator)</option>
                            </select>
                        </div>
                    </div>

                    <!-- CODE INCLUSIONS -->
                    <div class="settings-section-card" style="padding: 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                            <h3 style="font-size: 0.9375rem; font-weight: 700; margin: 0; color: var(--text-primary);">
                                🧩 Master Code Segment Inclusions (Batch Number)
                            </h3>
                            <span style="font-size: 0.75rem; color: var(--text-secondary);">
                                Active batch codes pulled directly from Master pages
                            </span>
                        </div>

                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px;">
                            ${this.renderOrderedSegmentCards('batch', rule, [
                                { checkboxId: 'inc-bl-prefix', padId: 'pad-bl-prefix', title: 'Prefix Tag (BAT / LOT)', desc: `Static Tag: ${rule.customPrefix || 'BAT'}`, checked: rule.inclusions.includeCustomPrefix, pad: rule.sequencePadding, noPad: true, segKey: 'custom_prefix' },
                                { checkboxId: 'inc-bl-plant', padId: 'pad-bl-plant', title: 'Plant Batch Code', active: { code: mapping.plant.code, badge: 'badge-cyan' }, manage: { tab: 'plant', label: 'in Plants Master' }, checked: rule.inclusions.includePlant, pad: rule.segmentPadding?.plant ?? rule.sequencePadding, segKey: 'plant' },
                                { checkboxId: 'inc-bl-vendor', padId: 'pad-bl-vendor', title: 'Vendor Batch Code', active: { code: mapping.vendor.code, badge: 'badge-neutral' }, manage: { tab: 'vendor', label: 'in Vendors' }, checked: rule.inclusions.includeVendor, pad: rule.segmentPadding?.vendor ?? rule.sequencePadding, segKey: 'vendor' },
                                { checkboxId: 'inc-bl-fy', padId: 'pad-bl-fy', title: 'Financial Year Batch Code', active: { code: mapping.financialYear.code, badge: 'badge-indigo' }, manage: { tab: 'financial_year', label: 'in FY Master' }, checked: rule.inclusions.includeFinancialYear, pad: rule.segmentPadding?.financial_year ?? rule.sequencePadding, segKey: 'financial_year' },
                                { checkboxId: 'inc-bl-month', padId: 'pad-bl-month', title: 'Month Batch Code', active: { code: mapping.month.code, badge: 'badge-cyan' }, manage: { tab: 'month', label: 'in Months Master' }, checked: rule.inclusions.includeMonth, pad: rule.segmentPadding?.month ?? rule.sequencePadding, segKey: 'month' },
                                { checkboxId: 'inc-bl-date', padId: 'pad-bl-date', title: 'Day Batch Code', active: { code: mapping.date.code, badge: 'badge-cyan' }, manage: { tab: 'date', label: 'in Dates Master' }, checked: rule.inclusions.includeDate, pad: rule.segmentPadding?.date ?? rule.sequencePadding, segKey: 'date' },
                                { checkboxId: 'inc-bl-category', padId: 'pad-bl-category', title: 'Category Batch Code', active: { code: mapping.category.code, badge: 'badge-emerald' }, manage: { tab: 'category', label: 'in Categories' }, checked: rule.inclusions.includeCategory, pad: rule.segmentPadding?.category ?? rule.sequencePadding, segKey: 'category' },
                                { checkboxId: 'inc-bl-group', padId: 'pad-bl-group', title: 'Group Batch Code', active: { code: mapping.group.code, badge: 'badge-emerald' }, manage: { tab: 'group', label: 'in Groups' }, checked: rule.inclusions.includeGroup, pad: rule.segmentPadding?.group ?? rule.sequencePadding, segKey: 'group' },
                                { checkboxId: 'inc-bl-shift', padId: 'pad-bl-shift', title: 'Production Shift Identifier', desc: 'Shift Tag: A / B / C', checked: rule.inclusions.includeShift, pad: rule.sequencePadding, noPad: true, segKey: 'shift' }
                            ])}
                        </div>

                        <div class="form-group" style="margin-top: 14px; max-width: 320px;">
                            <label style="font-weight: 600; font-size: 0.8125rem;">Batch Prefix Text</label>
                            <input type="text" id="bl-custom-prefix" value="${rule.customPrefix || 'BAT'}" style="width: 100%; font-family: monospace;" />
                        </div>
                    </div>

                    <!-- SEQUENCE CONFIG -->
                    <div class="settings-section-card" style="padding: 16px;">
                        <h3 style="font-size: 0.9375rem; font-weight: 700; margin: 0 0 12px 0; color: var(--text-primary);">
                            🔢 Batch Sequence &amp; Padding
                        </h3>

                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px;">
                            <div class="form-group">
                                <label style="font-weight: 700; font-size: 0.8125rem;">Sequence Digits (Padding)</label>
                                <select id="bl-padding" class="filter-dropdown" style="width: 100%;">
                                    <option value="2" ${rule.sequencePadding === 2 ? 'selected' : ''}>2 Digits (e.g. 01)</option>
                                    <option value="3" ${rule.sequencePadding === 3 ? 'selected' : ''}>3 Digits (e.g. 001)</option>
                                    <option value="4" ${rule.sequencePadding === 4 ? 'selected' : ''}>4 Digits (e.g. 0001)</option>
                                    <option value="5" ${rule.sequencePadding === 5 ? 'selected' : ''}>5 Digits (e.g. 00001)</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label style="font-weight: 700; font-size: 0.8125rem;">Sequence Start Number</label>
                                <input type="number" id="bl-seq-start" min="1" value="${rule.sequenceStartNumber || 1}" style="width: 100%; font-weight: 700;" />
                            </div>

                            <div class="form-group">
                                <label style="font-weight: 700; font-size: 0.8125rem;">Sequence Reset Frequency</label>
                                <select id="bl-reset-freq" class="filter-dropdown" style="width: 100%;">
                                    <option value="monthly" ${rule.resetFrequency === 'monthly' ? 'selected' : ''}>Reset Monthly</option>
                                    <option value="yearly" ${rule.resetFrequency === 'yearly' ? 'selected' : ''}>Reset Yearly</option>
                                    <option value="daily" ${rule.resetFrequency === 'daily' ? 'selected' : ''}>Reset Daily</option>
                                    <option value="never" ${rule.resetFrequency === 'never' ? 'selected' : ''}>Continuous (Never Reset)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;

        this.bindBatchLogicEvents(rule);
    }

    private renderBatchBreakdownPills(rule: BatchNumberLogicRule, segs: Record<string, string>): string {
        const pills: string[] = [];
        if (rule.inclusions.includeCustomPrefix && segs.custom_prefix) {
            pills.push(`<span class="nav-item-badge badge-neutral">Prefix: <strong>${segs.custom_prefix}</strong></span>`);
        }
        if (rule.inclusions.includePlant && segs.plant) {
            pills.push(`<span class="nav-item-badge badge-neutral">Plant: <strong>${segs.plant}</strong></span>`);
        }
        if (rule.inclusions.includeFinancialYear && segs.financial_year) {
            pills.push(`<span class="nav-item-badge badge-indigo">FY: <strong>${segs.financial_year}</strong></span>`);
        }
        if (rule.inclusions.includeMonth && segs.month) {
            pills.push(`<span class="nav-item-badge badge-cyan">Month: <strong>${segs.month}</strong></span>`);
        }
        if (rule.inclusions.includeCategory && segs.category) {
            pills.push(`<span class="nav-item-badge badge-emerald">Cat: <strong>${segs.category}</strong></span>`);
        }
        if (rule.inclusions.includeShift && segs.shift) {
            pills.push(`<span class="nav-item-badge badge-amber">Shift: <strong>${segs.shift}</strong></span>`);
        }
        pills.push(`<span class="nav-item-badge badge-emerald" style="border: 1px solid #10b981;">Seq: <strong>${segs.sequence}</strong></span>`);
        return pills.join('');
    }

    private bindBatchLogicEvents(rule: BatchNumberLogicRule) {
        this.container.querySelectorAll<HTMLButtonElement>('.btn-batch-plant-tab').forEach(b => {
            b.addEventListener('click', () => {
                this.selectedPlantForRule = b.dataset.plant || 'ALL';
                this.render();
            });
        });

        this.bindReorder('batch');

        // Quick Jump to Master Page
        this.container.querySelectorAll<HTMLButtonElement>('.btn-jump-master').forEach(b => {
            b.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const tab = b.dataset.tab as MasterDataType;
                if (tab) {
                    this.activeType = tab;
                    this.view = 'list';
                    this.render();
                }
            });
        });

        const updateLivePreview = () => {
            const currentRule: BatchNumberLogicRule = {
                ...rule,
                ruleName: (this.container.querySelector('#bl-rule-name') as HTMLInputElement).value.trim(),
                delimiter: (this.container.querySelector('#bl-delimiter') as HTMLSelectElement).value,
                customPrefix: (this.container.querySelector('#bl-custom-prefix') as HTMLInputElement).value.trim(),
                sequencePadding: parseInt((this.container.querySelector('#bl-padding') as HTMLSelectElement).value, 10) || 3,
                sequenceStartNumber: parseInt((this.container.querySelector('#bl-seq-start') as HTMLInputElement).value, 10) || 1,
                resetFrequency: (this.container.querySelector('#bl-reset-freq') as HTMLSelectElement).value as any,
                segmentPadding: {
                    plant: parseInt((this.container.querySelector('#pad-bl-plant') as HTMLInputElement)?.value || '', 10),
                    vendor: parseInt((this.container.querySelector('#pad-bl-vendor') as HTMLInputElement)?.value || '', 10),
                    financial_year: parseInt((this.container.querySelector('#pad-bl-fy') as HTMLInputElement)?.value || '', 10),
                    month: parseInt((this.container.querySelector('#pad-bl-month') as HTMLInputElement)?.value || '', 10),
                    category: parseInt((this.container.querySelector('#pad-bl-category') as HTMLInputElement)?.value || '', 10),
                    group: parseInt((this.container.querySelector('#pad-bl-group') as HTMLInputElement)?.value || '', 10),
                    date: parseInt((this.container.querySelector('#pad-bl-date') as HTMLInputElement)?.value || '', 10)
                },
                inclusions: {
                    includeCustomPrefix: (this.container.querySelector('#inc-bl-prefix') as HTMLInputElement).checked,
                    includePlant: (this.container.querySelector('#inc-bl-plant') as HTMLInputElement).checked,
                    includeFinancialYear: (this.container.querySelector('#inc-bl-fy') as HTMLInputElement).checked,
                    includeMonth: (this.container.querySelector('#inc-bl-month') as HTMLInputElement).checked,
                    includeDate: (this.container.querySelector('#inc-bl-date') as HTMLInputElement).checked,
                    includeCategory: (this.container.querySelector('#inc-bl-category') as HTMLInputElement).checked,
                    includeGroup: (this.container.querySelector('#inc-bl-group') as HTMLInputElement).checked,
                    includeShift: (this.container.querySelector('#inc-bl-shift') as HTMLInputElement).checked,
                    includeVendor: (this.container.querySelector('#inc-bl-vendor') as HTMLInputElement).checked
                }
            };

            const preview = generateBatchNumberPreview(currentRule, { plant: this.selectedPlantForRule !== 'ALL' ? this.selectedPlantForRule : 'KSPL' });
            const codeEl = this.container.querySelector('#preview-batch-code');
            const lenEl = this.container.querySelector('#preview-batch-length');
            const pillsEl = this.container.querySelector('#preview-batch-breakdown');

            if (codeEl) codeEl.textContent = preview.code;
            if (lenEl) lenEl.textContent = `${preview.length} Characters`;
            if (pillsEl) pillsEl.innerHTML = this.renderBatchBreakdownPills(currentRule, preview.segments);
        };

        this.container.querySelectorAll('input, select').forEach(el => {
            el.addEventListener('input', updateLivePreview);
            el.addEventListener('change', updateLivePreview);
        });

        this.container.querySelector('#btn-save-batch-logic')?.addEventListener('click', () => {
            const padOf = (id: string): number => {
                const el = this.container.querySelector<HTMLInputElement>('#' + id);
                const n = parseInt(el?.value || '', 10);
                return Number.isFinite(n) && n >= 0 ? n : rule.sequencePadding;
            };
            const updatedRule: BatchNumberLogicRule = {
                ...rule,
                plant: this.selectedPlantForRule,
                ruleName: (this.container.querySelector('#bl-rule-name') as HTMLInputElement).value.trim(),
                delimiter: (this.container.querySelector('#bl-delimiter') as HTMLSelectElement).value,
                customPrefix: (this.container.querySelector('#bl-custom-prefix') as HTMLInputElement).value.trim(),
                sequencePadding: parseInt((this.container.querySelector('#bl-padding') as HTMLSelectElement).value, 10) || 3,
                sequenceStartNumber: parseInt((this.container.querySelector('#bl-seq-start') as HTMLInputElement).value, 10) || 1,
                resetFrequency: (this.container.querySelector('#bl-reset-freq') as HTMLSelectElement).value as any,
                segmentPadding: {
                    plant: padOf('pad-bl-plant'),
                    vendor: padOf('pad-bl-vendor'),
                    financial_year: padOf('pad-bl-fy'),
                    month: padOf('pad-bl-month'),
                    category: padOf('pad-bl-category'),
                    group: padOf('pad-bl-group'),
                    date: padOf('pad-bl-date')
                },
                inclusions: {
                    includeCustomPrefix: (this.container.querySelector('#inc-bl-prefix') as HTMLInputElement).checked,
                    includePlant: (this.container.querySelector('#inc-bl-plant') as HTMLInputElement).checked,
                    includeFinancialYear: (this.container.querySelector('#inc-bl-fy') as HTMLInputElement).checked,
                    includeMonth: (this.container.querySelector('#inc-bl-month') as HTMLInputElement).checked,
                    includeDate: (this.container.querySelector('#inc-bl-date') as HTMLInputElement).checked,
                    includeCategory: (this.container.querySelector('#inc-bl-category') as HTMLInputElement).checked,
                    includeGroup: (this.container.querySelector('#inc-bl-group') as HTMLInputElement).checked,
                    includeShift: (this.container.querySelector('#inc-bl-shift') as HTMLInputElement).checked,
                    includeVendor: (this.container.querySelector('#inc-bl-vendor') as HTMLInputElement).checked
                }
            };

            saveBatchLogicRule(updatedRule);
            void persistBatchLogicRulesToDb();
            this.render();
            alert(`✅ Batch Number Logic for ${this.selectedPlantForRule} saved successfully to the shared database!`);
        });

        this.container.querySelector('#btn-reset-batch-logic')?.addEventListener('click', () => {
            if (confirm('Reset to default batch logic format?')) {
                const def = DEFAULT_BATCH_RULES.find(r => r.plant === this.selectedPlantForRule) || DEFAULT_BATCH_RULES[0];
                saveBatchLogicRule({ ...def, plant: this.selectedPlantForRule, id: `rule-batch-${this.selectedPlantForRule.toLowerCase()}` });
                void persistBatchLogicRulesToDb();
                this.render();
            }
        });

        this.container.querySelectorAll<HTMLButtonElement>('.master-type-tab').forEach(b => {
            b.addEventListener('click', () => {
                const t = b.dataset.type as MasterDataType;
                if (t && t !== this.activeType) {
                    this.activeType = t;
                    this.view = 'list';
                    this.render();
                }
            });
        });
    }

    // ── CREATE / EDIT FORM (Standard Master Data) ─────────────────────────────
    private renderFormPage(option: MasterDataOption | null) {
        const isEdit = Boolean(option);
        const def = this.typeDef();
        const hasSerialBatch = this.supportsSerialAndBatchCode();
        const plants = getMasterData('plant');

        this.container.innerHTML = `
        <div class="entity-manager-root">
            <div class="master-type-nav">
                ${MASTER_DATA_TYPES.map(t => `
                    <button class="master-type-tab ${this.activeType === t.type ? 'active' : ''}" data-type="${esc(t.type)}">
                        <span>${esc(t.icon)}</span> <span>${esc(t.label)}</span>
                    </button>
                `).join('')}
            </div>

            <div class="manager-card-panel" style="max-width:640px;margin:0 auto;width:100%;">
                <div class="panel-header-row">
                    <div>
                        <h2 class="panel-heading">${isEdit ? '✏️ Edit' : '➕ Add'} ${def.label.replace(/s$/, '')}</h2>
                        <p class="panel-subheading">Enter details for this master option.</p>
                    </div>
                </div>

                <form class="modal-form-grid" id="form-master-data" onsubmit="return false;" style="padding:20px 0;">
                    <div class="form-group">
                        <label style="font-weight:600;">Unique ID / Code *</label>
                        <input type="text" id="m-code" class="form-control-input" value="${option?.code || ''}" ${isEdit ? 'readonly style="background:var(--surface-muted);"' : ''} placeholder="e.g. KSPL" />
                        <small style="color:var(--text-secondary);font-size:0.72rem;">Unique identifier used across the application.</small>
                    </div>

                    <div class="form-group">
                        <label style="font-weight:600;">Display Name / Label *</label>
                        <input type="text" id="m-label" class="form-control-input" value="${option?.label || ''}" placeholder="e.g. KSPL" />
                    </div>

                    ${this.isPlant() ? `
                        <div class="form-group">
                            <label style="font-weight:600;">Plant Code (Numeric SAP / ERP Code)</label>
                            <input type="text" id="m-plantcode" class="form-control-input" value="${option?.plantCode || ''}" placeholder="e.g. 8600" />
                            <small style="color:var(--text-secondary);font-size:0.72rem;">Official 4-digit ERP plant code.</small>
                        </div>
                    ` : ''}

                    ${this.isVendor() ? `
                        <div class="form-group">
                            <label style="font-weight:600;">Mapped Plant Code *</label>
                            <select id="m-plantcode" class="filter-dropdown" style="width:100%;">
                                <option value="">Select Associated Plant...</option>
                                ${plants.map(p => `<option value="${esc(p.plantCode || p.code)}" ${option?.plantCode === (p.plantCode || p.code) ? 'selected' : ''}>${esc(p.label)} (Plant ${esc(p.plantCode || p.code)})</option>`).join('')}
                            </select>
                        </div>
                    ` : ''}

                    ${this.isFinancialYear() ? `
                        <div class="form-group">
                            <label style="font-weight:600;">Financial Year Structure</label>
                            <select id="m-fystructure" class="filter-dropdown" style="width:100%;">
                                <option value="April to March" ${option?.fyStructure === 'April to March' ? 'selected' : ''}>April to March (Apr – Mar)</option>
                                <option value="January to December" ${option?.fyStructure === 'January to December' ? 'selected' : ''}>January to December (Jan – Dec)</option>
                                <option value="July to June" ${option?.fyStructure === 'July to June' ? 'selected' : ''}>July to June (Jul – Jun)</option>
                                <option value="October to September" ${option?.fyStructure === 'October to September' ? 'selected' : ''}>October to September (Oct – Sep)</option>
                            </select>
                        </div>
                    ` : ''}

                    ${this.isVariable() ? `
                        <div class="form-group">
                            <label style="font-weight:600;">Default Value (Optional)</label>
                            <input type="text" id="m-default" class="form-control-input" value="${option?.defaultValue || ''}" placeholder="e.g. Standard" />
                        </div>
                    ` : ''}

                    ${hasSerialBatch ? `
                        <div class="form-group">
                            <label style="font-weight:600;">Code for Serial Number</label>
                            <input type="text" id="m-serialcode" class="form-control-input" value="${option?.serialCode || ''}" placeholder="${this.getSerialPlaceholder()}" />
                            <small style="color:var(--text-secondary);font-size:0.72rem;">Segment embedded into generated serial numbers.</small>
                        </div>
                        <div class="form-group">
                            <label style="font-weight:600;">Code for Batch Number</label>
                            <input type="text" id="m-batchcode" class="form-control-input" value="${option?.batchCode || ''}" placeholder="${this.getBatchPlaceholder()}" />
                            <small style="color:var(--text-secondary);font-size:0.72rem;">Segment embedded into generated batch numbers.</small>
                        </div>
                    ` : ''}
                </form>

                <div class="template-page-footer" style="display:flex;justify-content:flex-end;gap:10px;">
                    <button class="btn btn-outline" data-action="back-to-list">Cancel</button>
                    <button class="btn btn-primary" id="btn-save-master">${isEdit ? '💾 Save' : '➕ Add'}</button>
                </div>
            </div>
        </div>`;

        this.container.querySelectorAll('[data-action="back-to-list"]').forEach(b => b.addEventListener('click', () => { this.view = 'list'; this.render(); }));

        this.container.querySelector('#btn-save-master')?.addEventListener('click', () => {
            const code = (this.container.querySelector('#m-code') as HTMLInputElement).value.trim();
            const label = (this.container.querySelector('#m-label') as HTMLInputElement).value.trim();
            if (!code || !label) { alert('Enter both ID/Code and Label.'); return; }

            const plantCodeEl = this.container.querySelector('#m-plantcode') as HTMLInputElement | HTMLSelectElement | null;
            const plantCodeVal = plantCodeEl?.value.trim() || undefined;

            if (this.isVendor() && !plantCodeVal) {
                alert('Please select or enter a Plant Code for this vendor.');
                return;
            }

            const fyStructureEl = this.container.querySelector('#m-fystructure') as HTMLSelectElement | null;
            const fyStructureVal = this.isFinancialYear() ? fyStructureEl?.value.trim() || 'April to March' : undefined;

            const serialCodeEl = this.container.querySelector('#m-serialcode') as HTMLInputElement | null;
            const batchCodeEl = this.container.querySelector('#m-batchcode') as HTMLInputElement | null;

            const next: MasterDataOption = {
                code,
                label,
                type: this.activeType,
                plantCode: (this.isPlant() || this.isVendor()) ? plantCodeVal : undefined,
                fyStructure: fyStructureVal,
                serialCode: hasSerialBatch ? serialCodeEl?.value.trim() || undefined : undefined,
                batchCode: hasSerialBatch ? batchCodeEl?.value.trim() || undefined : undefined,
                defaultValue: this.isVariable() ? (this.container.querySelector('#m-default') as HTMLInputElement).value.trim() || undefined : undefined
            };

            let ok: boolean;
            if (isEdit) {
                ok = updateMasterData(this.activeType, code, next);
            } else {
                ok = addMasterData(next);
                if (!ok) { alert('ID / Code already exists. Use a different code.'); return; }
            }

            if (ok) void supabaseService.saveMasterData(next);
            this.view = 'list';
            this.render();
        });
    }
}
