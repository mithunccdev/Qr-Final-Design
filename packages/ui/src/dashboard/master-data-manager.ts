import {
    MasterDataType,
    MasterDataOption,
    MASTER_DATA_TYPES,
    getMasterData,
    addMasterData,
    updateMasterData,
    deleteMasterData
} from './master-data';
import { supabaseService } from '../supabase';

type ViewMode = 'list' | 'create' | 'edit';

export class MasterDataManagerView {
    private container: HTMLElement;
    private activeType: MasterDataType = 'plant';
    private view: ViewMode = 'list';
    private editingCode: string | null = null;

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

    /** Types that support Code for Serial number and Code for Batch number */
    private supportsSerialAndBatchCode(): boolean {
        return ['plant', 'vendor', 'financial_year', 'month', 'category', 'group'].includes(this.activeType);
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
            case 'category':
                return 'Product categories with serial and batch code segments.';
            case 'group':
                return 'Product groups with serial and batch code segments.';
            case 'variable':
                return 'Common variables shared by all products.';
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
            case 'category': return 'e.g. BFC / BSW';
            case 'group': return 'e.g. BSH / BMX';
            default: return 'e.g. BT-01';
        }
    }

    private render() {
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

        // Calculate columns for empty row colspan
        let colCount = 3; // ID, Label, Actions
        if (hasPlantCode) colCount += 1;
        if (this.isFinancialYear()) colCount += 1;
        if (hasSerialBatch) colCount += 2;
        if (this.isVariable()) colCount += 1;

        this.container.innerHTML = `
        <div class="entity-manager-root">
            <div class="master-type-nav">
                ${MASTER_DATA_TYPES.map(t => `
                    <button class="master-type-tab ${this.activeType === t.type ? 'active' : ''}" data-type="${t.type}">
                        <span>${t.icon}</span> <span>${t.label}</span>
                    </button>
                `).join('')}
            </div>

            <div class="manager-card-panel">
                <div class="panel-header-row">
                    <div>
                        <h3 class="panel-heading">${def.icon} ${def.label}</h3>
                        <p class="panel-subheading">${this.getSubheading()}</p>
                    </div>
                    <div class="panel-actions-group">
                        <button class="btn btn-primary" id="btn-add-master">➕ Add ${def.label}</button>
                    </div>
                </div>

                <div class="table-filter-bar" style="padding: 12px 18px;">
                    <label class="config-label">${records.length} record(s)</label>
                </div>

                <div class="table-responsive-container">
                    <table class="manager-data-table">
                        <thead>
                            <tr>
                                <th>ID (Code)</th>
                                <th>Label</th>
                                ${hasPlantCode ? '<th>Plant Code</th>' : ''}
                                ${this.isFinancialYear() ? '<th>FY Structure</th>' : ''}
                                ${hasSerialBatch ? '<th>Code for Serial No.</th><th>Code for Batch No.</th>' : ''}
                                ${this.isVariable() ? '<th>Default Value</th>' : ''}
                                <th style="text-align:right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${records.length === 0 ? `
                                <tr><td colspan="${colCount}" style="text-align:center;padding:32px;color:var(--text-secondary);">No records yet. Click "Add" to create one.</td></tr>
                            ` : records.map(r => this.renderRow(r)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;

        this.bindTypeNav();
        this.bindListActions();
    }

    private renderRow(r: MasterDataOption): string {
        const code = r.code.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const label = r.label.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const hasSerialBatch = this.supportsSerialAndBatchCode();
        const hasPlantCode = this.isPlant() || this.isVendor();

        return `
        <tr class="table-row-item" data-code="${code}">
            <td><span class="sku-badge">${code}</span></td>
            <td class="item-title-bold">${label}</td>
            ${hasPlantCode ? `<td><span class="serial-code-text">${r.plantCode ?? '—'}</span></td>` : ''}
            ${this.isFinancialYear() ? `<td><span class="sku-badge" style="background:var(--accent-subtle);color:var(--accent-primary);font-weight:600;">${r.fyStructure || 'April to March'}</span></td>` : ''}
            ${hasSerialBatch ? `
                <td><span class="serial-code-text">${r.serialCode || '—'}</span></td>
                <td><span class="serial-code-text">${r.batchCode || '—'}</span></td>
            ` : ''}
            ${this.isVariable() ? `<td>${r.defaultValue ?? '—'}</td>` : ''}
            <td style="text-align:right;">
                <div class="row-actions-group" style="justify-content:flex-end;">
                    <button class="btn btn-outline btn-xs btn-edit-master" data-code="${code}" title="Edit">✏️ Edit</button>
                    <button class="btn btn-danger-soft btn-xs btn-del-master" data-code="${code}" title="Delete">🗑️</button>
                </div>
            </td>
        </tr>`;
    }

    private bindTypeNav() {
        this.container.querySelectorAll<HTMLButtonElement>('.master-type-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                this.activeType = btn.dataset.type as MasterDataType;
                this.view = 'list';
                this.render();
            });
        });
    }

    private bindListActions() {
        this.container.querySelector('#btn-add-master')?.addEventListener('click', () => {
            this.editingCode = null;
            this.view = 'create';
            this.render();
        });
        this.container.querySelectorAll<HTMLButtonElement>('.btn-edit-master').forEach(btn => {
            btn.addEventListener('click', () => {
                this.editingCode = btn.dataset.code!;
                this.view = 'edit';
                this.render();
            });
        });
        this.container.querySelectorAll<HTMLButtonElement>('.btn-del-master').forEach(btn => {
            btn.addEventListener('click', () => {
                const code = btn.dataset.code!;
                const option = getMasterData(this.activeType).find(o => o.code === code);
                if (option && confirm(`Delete "${option.label}"?`)) {
                    deleteMasterData(this.activeType, code);
                    void supabaseService.deleteMasterData(this.activeType, code);
                    this.render();
                }
            });
        });
    }

    // ── CREATE / EDIT PAGE ─────────────────────────────────────────────────────
    private renderFormPage(option: MasterDataOption | null) {
        const def = this.typeDef();
        const isEdit = option !== null;
        const plants = getMasterData('plant');
        const hasSerialBatch = this.supportsSerialAndBatchCode();

        this.container.innerHTML = `
        <div class="entity-manager-root">
            <div class="template-page-header">
                <button class="btn btn-outline btn-sm" data-action="back-to-list">← Back to ${def.label}</button>
                <div>
                    <h3 class="library-main-title">${isEdit ? '✏️ Edit' : '➕ Add'} ${def.label}</h3>
                    <p style="font-size: 0.75rem; color: var(--ink-muted); margin: 2px 0 0 0;">${this.getSubheading()}</p>
                </div>
            </div>

            <div class="template-create-page-shell">
                <form id="form-master" class="modal-form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
                    <div class="form-group">
                        <label style="font-weight:600;">${this.isVariable() ? 'Variable Key *' : 'ID / Code *'}</label>
                        <input type="text" id="m-code" class="form-control-input" required value="${option?.code || ''}" placeholder="${this.isVendor() ? 'e.g. VEN-001' : this.isFinancialYear() ? 'e.g. 2025-26' : this.isMonth() ? 'e.g. 01' : this.isPlant() ? 'e.g. KSPL' : this.isVariable() ? 'e.g. batchNo' : 'e.g. W / faucet'}" ${isEdit ? 'readonly style="background:var(--surface-muted);"' : ''} />
                    </div>
                    <div class="form-group">
                        <label style="font-weight:600;">Label *</label>
                        <input type="text" id="m-label" class="form-control-input" required value="${option?.label || ''}" placeholder="${this.isVendor() ? 'e.g. Apex Bath Fittings Pvt Ltd' : this.isFinancialYear() ? 'e.g. FY 2025-2026' : this.isMonth() ? 'e.g. January' : this.isPlant() ? 'e.g. KSPL — Unit 1' : 'e.g. Rose Gold'}" />
                    </div>

                    ${this.isVariable() ? `
                        <div class="form-group col-span-2" style="grid-column:1 / -1;">
                            <label style="font-weight:600;">Default Value</label>
                            <input type="text" id="m-default" class="form-control-input" value="${option?.defaultValue || ''}" placeholder="e.g. BATCH-01" />
                        </div>
                    ` : ''}

                    ${this.isFinancialYear() ? `
                        <div class="form-group col-span-2" style="grid-column:1 / -1;">
                            <label style="font-weight:600;">Financial Year Structure *</label>
                            <select id="m-fystructure" class="form-control-input" required>
                                <option value="April to March" ${(!option?.fyStructure || option?.fyStructure === 'April to March') ? 'selected' : ''}>📅 April to March (Apr – Mar)</option>
                                <option value="January to December" ${option?.fyStructure === 'January to December' ? 'selected' : ''}>📅 January to December (Jan – Dec)</option>
                                <option value="July to June" ${option?.fyStructure === 'July to June' ? 'selected' : ''}>📅 July to June (Jul – Jun)</option>
                                <option value="October to September" ${option?.fyStructure === 'October to September' ? 'selected' : ''}>📅 October to September (Oct – Sep)</option>
                            </select>
                            <small style="color:var(--text-secondary);font-size:0.72rem;">Fiscal cycle period structure for accounting and batch tracking.</small>
                        </div>
                    ` : ''}

                    ${this.isVendor() ? `
                        <div class="form-group col-span-2" style="grid-column:1 / -1;">
                            <label style="font-weight:600;">Plant Code *</label>
                            ${plants.length > 0 ? `
                                <select id="m-plantcode" class="form-control-input" required>
                                    <option value="">-- Select Plant --</option>
                                    ${plants.map(p => {
                                        const val = p.plantCode || p.code;
                                        const selected = option?.plantCode === val || option?.plantCode === p.code || option?.plantCode === p.label;
                                        return `<option value="${val}" ${selected ? 'selected' : ''}>🏭 ${p.label} (${p.plantCode || p.code})</option>`;
                                    }).join('')}
                                    ${option?.plantCode && !plants.some(p => (p.plantCode || p.code) === option.plantCode || p.code === option.plantCode || p.label === option.plantCode) ? `
                                        <option value="${option.plantCode}" selected>🏭 ${option.plantCode}</option>
                                    ` : ''}
                                </select>
                            ` : `
                                <input type="text" id="m-plantcode" class="form-control-input" required value="${option?.plantCode || ''}" placeholder="e.g. 8600 / KSPL" />
                            `}
                            <small style="color:var(--text-secondary);font-size:0.72rem;">Select the plant that this vendor is associated with.</small>
                        </div>
                    ` : ''}

                    ${this.isPlant() ? `
                        <div class="form-group col-span-2" style="grid-column:1 / -1;">
                            <label style="font-weight:600;">Plant Code (Numeric)</label>
                            <input type="text" id="m-plantcode" class="form-control-input" value="${option?.plantCode || ''}" placeholder="e.g. 8600" />
                            <small style="color:var(--text-secondary);font-size:0.72rem;">Numeric ERP / Plant identifier.</small>
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


