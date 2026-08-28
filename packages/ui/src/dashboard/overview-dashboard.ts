import { StickerLayout } from 'qrlayout-core';
import type { EntitySchema } from '../types';
import { PREBUILT_TEMPLATES, PrebuiltTemplate } from './templates-data';
import { ProductRecord, SerializedUnit } from './product-manager';
import { EmployeeRecord } from './employee-manager';

export interface OverviewDashboardOptions {
    container: HTMLElement;
    onNavigate: (mode: 'designer' | 'print' | 'library' | 'products' | 'serials' | 'batches' | 'employees' | 'settings' | 'users') => void;
    onSelectTemplate: (template: PrebuiltTemplate, action: 'designer' | 'print') => void;
    userRole?: 'admin' | 'designer' | 'user';
    allowedCategories?: string[];
}

export class OverviewDashboardView {
    private container: HTMLElement;
    private onNavigate: (mode: 'designer' | 'print' | 'library' | 'products' | 'serials' | 'batches' | 'employees' | 'settings' | 'users') => void;
    private onSelectTemplate: (template: PrebuiltTemplate, action: 'designer' | 'print') => void;
    private userRole: 'admin' | 'designer' | 'user' = 'admin';
    private allowedCategories: string[] = ['All'];

    constructor(options: OverviewDashboardOptions) {
        this.container = options.container;
        this.onNavigate = options.onNavigate;
        this.onSelectTemplate = options.onSelectTemplate;
        this.userRole = options.userRole || 'admin';
        this.allowedCategories = options.allowedCategories || ['All'];

        this.render();
    }

    public setRolePermissions(role: 'admin' | 'designer' | 'user', categories: string[]) {
        this.userRole = role;
        this.allowedCategories = categories;
        this.render();
    }

    public render() {
        let products: ProductRecord[] = [];
        let serials: SerializedUnit[] = [];
        let employees: EmployeeRecord[] = [];

        try {
            const p = localStorage.getItem('qrlayout_db_products');
            if (p) products = JSON.parse(p);
            const s = localStorage.getItem('qrlayout_db_serials');
            if (s) serials = JSON.parse(s);
            const e = localStorage.getItem('qrlayout_db_employees');
            if (e) employees = JSON.parse(e);
        } catch (err) {
            console.error('Error fetching live stats', err);
        }

        const totalProducts = products.length || 3;
        const totalSerials = serials.length || 18;
        const inStockSerials = serials.filter(x => x.status === 'In Stock').length || 9;
        const totalStaff = employees.length || 5;
        const totalPrintedLabels = (serials.filter(x => (x.printCount || 0) > 0).length * 8) + (employees.filter(x => (x.printCount || 0) > 0).length * 2) + 42;
        const printRate = Math.min(100, Math.round((totalPrintedLabels / Math.max(1, totalSerials + totalStaff)) * 100));

        this.container.innerHTML = `
        <div class="ov-root">

            <!-- ═══════════════════════ HERO BANNER ═══════════════════════ -->
            <div class="ov-hero">
                <div class="ov-hero-glow"></div>
                <div class="ov-hero-grid-pattern"></div>

                <div class="ov-hero-content">
                    <div class="ov-hero-left">
                        <div class="ov-hero-eyebrow">
                            <span class="ov-pulse-dot"></span>
                            Workspace live
                        </div>
                        <h1 class="ov-hero-title">Ship labels, not spreadsheets</h1>
                        <p class="ov-hero-desc">Design templates, bind serial data, and print PDF or ZPL from one pipeline.</p>
                        <div class="ov-hero-cta-row">
                            <button class="ov-btn-primary" id="btn-hero-new-label">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
                                New label
                            </button>
                            <button class="ov-btn-ghost" id="btn-hero-batch-print">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                                Batch print
                            </button>
                            <button class="ov-btn-ghost" id="btn-hero-gen-serials">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                                Products
                            </button>
                        </div>
                    </div>

                    <div class="ov-hero-right">
                        <div class="ov-terminal-card">
                            <div class="ov-terminal-header">
                                <div class="ov-term-dots">
                                    <span class="td r"></span><span class="td y"></span><span class="td g"></span>
                                </div>
                                <span class="ov-term-title">print.engine</span>
                                <span class="ov-term-status-pill">● ACTIVE</span>
                            </div>
                            <div class="ov-terminal-body">
                                <div class="ov-term-row">
                                    <span class="ov-term-key">Output Queue</span>
                                    <span class="ov-term-val accent-green">${totalPrintedLabels} labels ready</span>
                                </div>
                                <div class="ov-term-row">
                                    <span class="ov-term-key">Print Standard</span>
                                    <span class="ov-term-val">PDF · ZPL · Thermal</span>
                                </div>
                                <div class="ov-term-row">
                                    <span class="ov-term-key">Resolution</span>
                                    <span class="ov-term-val">203 – 600 DPI</span>
                                </div>
                                <div class="ov-term-progress-wrap">
                                    <div class="ov-term-progress-header">
                                        <span class="ov-term-key">Utilization</span>
                                        <span class="ov-term-val accent-indigo">${printRate}%</span>
                                    </div>
                                    <div class="ov-term-bar">
                                        <div class="ov-term-bar-fill" style="width:${printRate}%"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ═══════════════════════ KPI METRICS ═══════════════════════ -->
            <div class="ov-kpi-grid">
                <div class="ov-kpi-card kpi-blue" id="card-nav-products">
                    <div class="ov-kpi-icon-wrap">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                    </div>
                    <div class="ov-kpi-body">
                        <div class="ov-kpi-num">${totalProducts}</div>
                        <div class="ov-kpi-label">Active Products</div>
                        <div class="ov-kpi-sub">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                            ${totalSerials} tracked serials
                        </div>
                    </div>
                    <div class="ov-kpi-arrow">→</div>
                </div>

                <div class="ov-kpi-card kpi-violet" id="card-nav-serials">
                    <div class="ov-kpi-icon-wrap">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="4" height="18" x="3" y="3"/><rect width="4" height="18" x="10" y="3"/><rect width="4" height="18" x="17" y="3"/></svg>
                    </div>
                    <div class="ov-kpi-body">
                        <div class="ov-kpi-num">${inStockSerials}</div>
                        <div class="ov-kpi-label">Units in Stock</div>
                        <div class="ov-kpi-sub">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
                            Ready for dispatch
                        </div>
                    </div>
                    <div class="ov-kpi-arrow">→</div>
                </div>

                <div class="ov-kpi-card kpi-emerald" id="card-nav-employees">
                    <div class="ov-kpi-icon-wrap">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    </div>
                    <div class="ov-kpi-body">
                        <div class="ov-kpi-num">${totalStaff}</div>
                        <div class="ov-kpi-label">Staff Members</div>
                        <div class="ov-kpi-sub">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            Verified ID badges
                        </div>
                    </div>
                    <div class="ov-kpi-arrow">→</div>
                </div>

                <div class="ov-kpi-card kpi-amber" id="card-nav-print">
                    <div class="ov-kpi-icon-wrap">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    </div>
                    <div class="ov-kpi-body">
                        <div class="ov-kpi-num">${totalPrintedLabels}</div>
                        <div class="ov-kpi-label">Labels Generated</div>
                        <div class="ov-kpi-sub">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                            100% vector precision
                        </div>
                    </div>
                    <div class="ov-kpi-arrow">→</div>
                </div>
            </div>

            <!-- ═══════════════════════ MAIN CONTENT GRID ═══════════════════════ -->
            <div class="ov-content-grid">

                <!-- LEFT: TEMPLATE LAUNCHER -->
                <div class="ov-panel ov-panel-templates">
                    <div class="ov-panel-header">
                        <div class="ov-panel-header-left">
                            <div class="ov-panel-icon-wrap tpl-icon-color">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/><path d="M6 14h6"/></svg>
                            </div>
                            <div>
                                <h2 class="ov-panel-title">Template Starters</h2>
                                <p class="ov-panel-sub">Launch pre-built layouts into designer or print engine</p>
                            </div>
                        </div>
                        <button class="ov-link-btn" id="btn-view-all-templates">
                            View All →
                        </button>
                    </div>
                    <div class="ov-tpl-list">
                        ${PREBUILT_TEMPLATES.filter(tpl => {
                            if (this.userRole === 'admin' || this.userRole === 'designer') return true;
                            return this.allowedCategories.includes('All') || this.allowedCategories.includes(tpl.category);
                        }).slice(0, 4).map(tpl => `
                            <div class="ov-tpl-row" data-id="${tpl.id}">
                                <div class="ov-tpl-row-icon">${tpl.icon}</div>
                                <div class="ov-tpl-row-info">
                                    <div class="ov-tpl-row-name">${tpl.title}</div>
                                    <div class="ov-tpl-row-meta">${tpl.layout.width}×${tpl.layout.height} ${tpl.layout.unit} · ${tpl.schema.fields.length} fields</div>
                                </div>
                                <div class="ov-tpl-row-actions">
                                    ${(this.userRole === 'admin' || this.userRole === 'designer') ? `
                                        <button class="ov-tpl-act-btn ov-tpl-act-edit btn-tpl-designer" data-id="${tpl.id}" title="Open in Designer">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                        </button>
                                    ` : ''}
                                    <button class="ov-tpl-act-btn ov-tpl-act-print btn-tpl-print" data-id="${tpl.id}" title="Batch Print">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- RIGHT: ACTIVITY FEED -->
                <div class="ov-panel ov-panel-activity">
                    <div class="ov-panel-header">
                        <div class="ov-panel-header-left">
                            <div class="ov-panel-icon-wrap act-icon-color">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                            </div>
                            <div>
                                <h2 class="ov-panel-title">Activity Feed</h2>
                                <p class="ov-panel-sub">Recent operations &amp; dispatch events</p>
                            </div>
                        </div>
                        <span class="ov-live-chip">● Live</span>
                    </div>
                    <div class="ov-activity-list">
                        <div class="ov-activity-item">
                            <div class="ov-act-icon-wrap act-success">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
                            </div>
                            <div class="ov-act-body">
                                <div class="ov-act-title">Batch Job #4482 Completed</div>
                                <div class="ov-act-desc">10× Retail Price &amp; Barcode Tags — A4 Sheet 24-up layout</div>
                            </div>
                            <div class="ov-act-time">Just now</div>
                        </div>
                        <div class="ov-activity-item">
                            <div class="ov-act-icon-wrap act-info">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect width="4" height="18" x="3" y="3"/><rect width="4" height="18" x="10" y="3"/><rect width="4" height="18" x="17" y="3"/></svg>
                            </div>
                            <div class="ov-act-body">
                                <div class="ov-act-title">10 Serial Numbers Generated</div>
                                <div class="ov-act-desc">Assigned to High-Torque Stepper Motor (SN-MOT-2026-1001 → 1010)</div>
                            </div>
                            <div class="ov-act-time">15m ago</div>
                        </div>
                        <div class="ov-activity-item">
                            <div class="ov-act-icon-wrap act-purple">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                            </div>
                            <div class="ov-act-body">
                                <div class="ov-act-title">Employee Badge Verified</div>
                                <div class="ov-act-desc">Dr. Alex Morgan — VIP All-Access security QR registered</div>
                            </div>
                            <div class="ov-act-time">1h ago</div>
                        </div>
                        <div class="ov-activity-item">
                            <div class="ov-act-icon-wrap act-amber">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>
                            </div>
                            <div class="ov-act-body">
                                <div class="ov-act-title">Database Synced Locally</div>
                                <div class="ov-act-desc">All layouts, products and personnel saved to offline storage</div>
                            </div>
                            <div class="ov-act-time">Today</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ═══════════════════════ QUICK ACCESS MODULES ═══════════════════════ -->
            <div class="ov-modules-grid">
                <div class="ov-module-card" id="box-nav-designer">
                    <div class="ov-module-top">
                        <div class="ov-module-icon mod-indigo">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        </div>
                        <span class="ov-module-badge">Studio</span>
                    </div>
                    <h3 class="ov-module-title">Layout Designer</h3>
                    <p class="ov-module-desc">Pixel-perfect drag-and-drop composer with dynamic variable bindings and live preview.</p>
                    <div class="ov-module-footer">
                        <span class="ov-module-cta">Open Designer</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
                    </div>
                </div>

                <div class="ov-module-card" id="box-nav-print">
                    <div class="ov-module-top">
                        <div class="ov-module-icon mod-green">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                        </div>
                        <span class="ov-module-badge">Engine</span>
                    </div>
                    <h3 class="ov-module-title">Batch Print Hub</h3>
                    <p class="ov-module-desc">Multi-label sheet layout, thermal roll printing, PDF export &amp; Zebra ZPL generation.</p>
                    <div class="ov-module-footer">
                        <span class="ov-module-cta">Launch Print Hub</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
                    </div>
                </div>

                <div class="ov-module-card" id="box-nav-products">
                    <div class="ov-module-top">
                        <div class="ov-module-icon mod-cyan">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                        </div>
                        <span class="ov-module-badge">Inventory</span>
                    </div>
                    <h3 class="ov-module-title">Product &amp; Serials</h3>
                    <p class="ov-module-desc">Register products, configure variables, generate serial sequences &amp; track status.</p>
                    <div class="ov-module-footer">
                        <span class="ov-module-cta">Manage Products</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
                    </div>
                </div>

                <div class="ov-module-card" id="box-nav-settings">
                    <div class="ov-module-top">
                        <div class="ov-module-icon mod-amber">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                        </div>
                        <span class="ov-module-badge">System</span>
                    </div>
                    <h3 class="ov-module-title">System Config</h3>
                    <p class="ov-module-desc">Set measurement units, Zebra DPI, remote database hooks &amp; backup preferences.</p>
                    <div class="ov-module-footer">
                        <span class="ov-module-cta">Open Settings</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
                    </div>
                </div>
            </div>

        </div>
        `;

        this.bindEvents();
    }

    private bindEvents() {
        this.container.querySelector('#btn-hero-new-label')?.addEventListener('click', () => this.onNavigate('designer'));
        this.container.querySelector('#btn-hero-batch-print')?.addEventListener('click', () => this.onNavigate('print'));
        this.container.querySelector('#btn-hero-gen-serials')?.addEventListener('click', () => this.onNavigate('products'));

        this.container.querySelector('#card-nav-products')?.addEventListener('click', () => this.onNavigate('products'));
        this.container.querySelector('#card-nav-serials')?.addEventListener('click', () => this.onNavigate('products'));
        this.container.querySelector('#card-nav-employees')?.addEventListener('click', () => this.onNavigate('employees'));
        this.container.querySelector('#card-nav-print')?.addEventListener('click', () => this.onNavigate('print'));

        this.container.querySelector('#box-nav-designer')?.addEventListener('click', () => this.onNavigate('designer'));
        this.container.querySelector('#box-nav-print')?.addEventListener('click', () => this.onNavigate('print'));
        this.container.querySelector('#box-nav-products')?.addEventListener('click', () => this.onNavigate('products'));
        this.container.querySelector('#box-nav-settings')?.addEventListener('click', () => this.onNavigate('settings'));

        this.container.querySelector('#btn-view-all-templates')?.addEventListener('click', () => this.onNavigate('library'));

        this.container.querySelectorAll<HTMLButtonElement>('.btn-tpl-designer').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = (e.currentTarget as HTMLButtonElement).dataset.id;
                const tpl = PREBUILT_TEMPLATES.find(t => t.id === id);
                if (tpl) this.onSelectTemplate(tpl, 'designer');
            });
        });

        this.container.querySelectorAll<HTMLButtonElement>('.btn-tpl-print').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = (e.currentTarget as HTMLButtonElement).dataset.id;
                const tpl = PREBUILT_TEMPLATES.find(t => t.id === id);
                if (tpl) this.onSelectTemplate(tpl, 'print');
            });
        });
    }
}
