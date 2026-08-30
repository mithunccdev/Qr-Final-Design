// ════════════════════════════════════════════════════════════════════════════
// SETTINGS TOOLS — Audit Log, Printers (device presets), Print History
// ════════════════════════════════════════════════════════════════════════════

import { supabaseService } from '../supabase';
import { esc } from '../escape';
import { canCurrentUser } from './permissions';

// ── AUDIT LOG ─────────────────────────────────────────────────────────────────
export class AuditLogView {
    private container: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container;
        this.render();
    }

    public render(): void {
        this.container.innerHTML = `
        <div class="entity-manager-root">
            <div class="manager-card-panel" style="max-width:1080px;margin:0 auto;width:100%;">
                <div class="panel-header-row">
                    <div>
                        <h2 class="panel-heading">📋 Audit Trail</h2>
                        <p class="panel-subheading">Who changed what, and when — create / edit / delete / print actions.</p>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button class="btn btn-outline" id="btn-refresh-audit">↻ Refresh</button>
                        ${canCurrentUser('settings', 'delete') ? `<button class="btn btn-outline" id="btn-clear-audit" style="color:#ef4444;border-color:#fecaca;">🧹 Clear</button>` : ''}
                    </div>
                </div>
                <div id="audit-list" style="padding:8px;">
                    <p style="padding:24px;text-align:center;color:var(--text-secondary);font-size:0.875rem;">Loading…</p>
                </div>
            </div>
        </div>`;

        this.load();
        this.container.querySelector('#btn-refresh-audit')?.addEventListener('click', () => this.load());
        this.container.querySelector('#btn-clear-audit')?.addEventListener('click', async () => {
            if (confirm('Clear the entire audit log?')) {
                await supabaseService.clearAuditLogs();
                this.load();
            }
        });
    }

    private async load(): Promise<void> {
        const list = this.container.querySelector('#audit-list');
        if (!list) return;
        const rows = await supabaseService.fetchAuditLogs(300);
        if (!rows || rows.length === 0) {
            list.innerHTML = `<div class="master-empty-state"><div class="empty-icon">📋</div><div class="empty-title">No audit entries</div></div>`;
            return;
        }
        const color = (a: string) => a === 'delete' ? '#ef4444' : a === 'create' ? '#059669' : '#4f46e5';
        list.innerHTML = `
        <div style="overflow-x:auto;">
        <table class="manager-data-table">
            <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody>
                ${rows.map(r => `
                    <tr>
                        <td style="white-space:nowrap;font-size:0.75rem;color:var(--text-secondary);">${esc(new Date(r.created_at).toLocaleString())}</td>
                        <td><strong>${esc(r.actor_email)}</strong><div style="font-size:0.72rem;color:var(--text-secondary);">${esc(r.actor_role)}</div></td>
                        <td><span class="nav-item-badge badge-neutral" style="color:${color(r.action)};font-weight:700;">${esc(r.action.toUpperCase())}</span></td>
                        <td><span class="sku-badge">${esc(r.entity_type)}</span> <span style="font-size:0.75rem;color:var(--text-secondary);">${esc(r.entity_id)}</span></td>
                        <td style="font-size:0.75rem;color:var(--text-secondary);">${esc(r.entity_label || '—')}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        </div>`;
    }
}

// ── PRINTERS (device presets) ─────────────────────────────────────────────────
export class PrintersView {
    private container: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container;
        this.render();
    }

    public render(): void {
        const canWrite = canCurrentUser('settings', 'create');
        this.container.innerHTML = `
        <div class="entity-manager-root">
            <div class="manager-card-panel" style="max-width:1080px;margin:0 auto;width:100%;">
                <div class="panel-header-row">
                    <div>
                        <h2 class="panel-heading">🖨️ Printers &amp; Label Devices</h2>
                        <p class="panel-subheading">Register label printers (DPI + label size) used for ZPL output.</p>
                    </div>
                    ${canWrite ? `<button class="btn btn-primary" id="btn-add-printer">➕ Add Printer</button>` : ''}
                </div>
                <div id="printer-body" style="padding:12px;"><p style="padding:20px;text-align:center;color:var(--text-secondary);">Loading…</p></div>
            </div>
        </div>`;
        this.load();
        this.container.querySelector('#btn-add-printer')?.addEventListener('click', () => this.openModal(null));
    }

    private async load(): Promise<void> {
        const body = this.container.querySelector('#printer-body');
        const rows = await supabaseService.fetchPrinters();
        if (!body) return;
        if (!rows || rows.length === 0) {
            body.innerHTML = `<div class="master-empty-state"><div class="empty-icon">🖨️</div><div class="empty-title">No printers added</div></div>`;
            return;
        }
        const canWrite = canCurrentUser('settings', 'edit') || canCurrentUser('settings', 'delete');
        body.innerHTML = `
        <div style="overflow-x:auto;">
        <table class="manager-data-table">
            <thead><tr><th>Name</th><th>Brand / Model</th><th>DPI</th><th>Label Size</th><th>Default</th>${canWrite ? '<th style="text-align:right;">Actions</th>' : ''}</thead>
            <tbody>
                ${rows.map(p => `
                    <tr>
                        <td><strong>${esc(p.name)}</strong></td>
                        <td>${esc(p.brand)} ${esc(p.model)}</td>
                        <td>${esc(String(p.dpi))} DPI</td>
                        <td>${esc(String(p.label_width_mm))} × ${esc(String(p.label_height_mm))} mm</td>
                        <td>${p.is_default ? '⭐ Default' : '—'}</td>
                        ${canWrite ? `
                        <td style="text-align:right;">
                            <div style="display:flex;gap:6px;justify-content:flex-end;">
                                <button class="btn btn-sm btn-outline btn-edit-printer" data-id="${esc(p.id)}" title="Edit">✏️</button>
                                ${canCurrentUser('settings', 'delete') ? `<button class="btn btn-sm btn-outline btn-del-printer" data-id="${esc(p.id)}" title="Delete" style="color:#ef4444;border-color:#fee2e2;">🗑️</button>` : ''}
                            </div>
                        </td>` : ''}
                    </tr>
                `).join('')}
            </tbody>
        </table>
        </div>`;
        this.container.querySelectorAll<HTMLButtonElement>('.btn-edit-printer').forEach(b => b.addEventListener('click', () => {
            const p = rows.find(x => x.id === b.dataset.id);
            if (p) this.openModal(p);
        }));
        this.container.querySelectorAll<HTMLButtonElement>('.btn-del-printer').forEach(b => b.addEventListener('click', async () => {
            if (confirm('Delete this printer?')) { await supabaseService.deletePrinter(b.dataset.id!); this.load(); }
        }));
    }

    private openModal(p: any): void {
        const body = this.container.querySelector('#printer-body') as HTMLElement;
        const isEdit = !!p;
        body.innerHTML = `
        <div class="dashboard-modal-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;">
            <div class="dashboard-modal-box" style="background:var(--surface);border-radius:14px;width:520px;max-width:90vw;padding:22px;">
                <h3 style="margin:0 0 16px 0;">${isEdit ? 'Edit Printer' : 'Add Printer'}</h3>
                <div class="modal-form-grid">
                    <div class="form-group col-span-2"><label>Name *</label><input id="pr-name" value="${esc(p?.name || '')}" placeholder="e.g. Warehouse Zebra 300" required/></div>
                    <div class="form-group"><label>Brand</label><input id="pr-brand" value="${esc(p?.brand || 'Zebra')}" /></div>
                    <div class="form-group"><label>Model</label><input id="pr-model" value="${esc(p?.model || '')}" /></div>
                    <div class="form-group"><label>DPI</label><select id="pr-dpi"><option value="203" ${p?.dpi === 203 ? 'selected' : ''}>203 DPI</option><option value="300" ${p?.dpi === 300 ? 'selected' : ''}>300 DPI</option><option value="600" ${p?.dpi === 600 ? 'selected' : ''}>600 DPI</option></select></div>
                    <div class="form-group"><label>Default</label><label style="display:flex;gap:6px;align-items:center;"><input type="checkbox" id="pr-default" ${p?.is_default ? 'checked' : ''} style="margin:0;" /> Set as default</label></div>
                    <div class="form-group"><label>Label width (mm)</label><input id="pr-w" type="number" value="${esc(String(p?.label_width_mm || 100))}" /></div>
                    <div class="form-group"><label>Label height (mm)</label><input id="pr-h" type="number" value="${esc(String(p?.label_height_mm || 50))}" /></div>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
                    <button class="btn btn-outline" id="pr-cancel">Cancel</button>
                    <button class="btn btn-primary" id="pr-save">💾 Save</button>
                </div>
            </div>
        </div>`;
        body.querySelector('#pr-cancel')?.addEventListener('click', () => this.load());
        body.querySelector('#pr-save')?.addEventListener('click', async () => {
            const id = p?.id || `prn-dev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
            await supabaseService.savePrinter({
                id,
                name: (body.querySelector('#pr-name') as HTMLInputElement).value.trim(),
                brand: (body.querySelector('#pr-brand') as HTMLInputElement).value.trim() || 'Zebra',
                model: (body.querySelector('#pr-model') as HTMLInputElement).value.trim(),
                dpi: Number((body.querySelector('#pr-dpi') as HTMLSelectElement).value),
                labelWidthMm: Number((body.querySelector('#pr-w') as HTMLInputElement).value) || 100,
                labelHeightMm: Number((body.querySelector('#pr-h') as HTMLInputElement).value) || 50,
                isDefault: (body.querySelector('#pr-default') as HTMLInputElement).checked
            });
            this.load();
            alert('✅ Printer saved.');
        });
    }
}

// ── PRINT HISTORY ─────────────────────────────────────────────────────────────
export class PrintJobsView {
    private container: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container;
        this.render();
    }

    public render(): void {
        this.container.innerHTML = `
        <div class="entity-manager-root">
            <div class="manager-card-panel" style="max-width:1080px;margin:0 auto;width:100%;">
                <div class="panel-header-row">
                    <div>
                        <h2 class="panel-heading">🖨️ Print History</h2>
                        <p class="panel-subheading">Recent print jobs (ZPL / PDF / PNG) for reprint &amp; tracking.</p>
                    </div>
                    <button class="btn btn-outline" id="btn-refresh-pj">↻ Refresh</button>
                </div>
                <div id="pj-list" style="padding:8px;"><p style="padding:20px;text-align:center;color:var(--text-secondary);">Loading…</p></div>
            </div>
        </div>`;
        this.load();
        this.container.querySelector('#btn-refresh-pj')?.addEventListener('click', () => this.load());
    }

    private async load(): Promise<void> {
        const list = this.container.querySelector('#pj-list');
        const rows = await supabaseService.fetchPrintJobs(150);
        if (!list) return;
        if (!rows || rows.length === 0) {
            list.innerHTML = `<div class="master-empty-state"><div class="empty-icon">🖨️</div><div class="empty-title">No print jobs yet</div></div>`;
            return;
        }
        list.innerHTML = `
        <div style="overflow-x:auto;">
        <table class="manager-data-table">
            <thead><tr><th>Time</th><th>Actor</th><th>Entity</th><th>Format</th><th>DPI</th><th>Qty</th><th>Printer</th></tr></thead>
            <tbody>
                ${rows.map(r => `
                    <tr>
                        <td style="white-space:nowrap;font-size:0.75rem;color:var(--text-secondary);">${esc(new Date(r.created_at).toLocaleString())}</td>
                        <td>${esc(r.actor_email)}</td>
                        <td><span class="sku-badge">${esc(r.entity_type)}</span> <span style="font-size:0.75rem;color:var(--text-secondary);">${esc(r.entity_label)}</span></td>
                        <td>${esc(r.format)}</td>
                        <td>${esc(String(r.dpi))}</td>
                        <td>${esc(String(r.quantity))}</td>
                        <td>${esc(r.printer_name || '—')}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        </div>`;
    }
}
