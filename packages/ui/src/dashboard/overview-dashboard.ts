// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD (Home) — simple, role-aware.
// Only shows quick actions and stats for pages the current role is allowed to
// view (driven by the access-control matrix), so users never reach pages not
// allocated to them.
// ════════════════════════════════════════════════════════════════════════════

import { PrebuiltTemplate, PREBUILT_TEMPLATES } from './templates-data';
import { esc } from '../escape';
import { hasPageAccess, roleLabel } from './permissions';
import type { PageKey } from './permissions';

export interface OverviewDashboardOptions {
    container: HTMLElement;
    onNavigate: (mode: string) => void;
    onSelectTemplate: (template: PrebuiltTemplate, action: 'designer' | 'print') => void;
    userRole?: string;
    userName?: string;
    allowedCategories?: string[];
}

interface QuickAction {
    mode: string;
    page: PageKey;
    label: string;
    icon: string;
    desc: string;
}

const QUICK_ACTIONS: QuickAction[] = [
    { mode: 'designer', page: 'designer', label: 'Designer', icon: '🎨', desc: 'Design label layouts' },
    { mode: 'print', page: 'print', label: 'Batch Print', icon: '🖨️', desc: 'Print PDF / ZPL batches' },
    { mode: 'library', page: 'templates', label: 'Templates', icon: '📁', desc: 'Browse & manage templates' },
    { mode: 'products', page: 'products', label: 'Products', icon: '📦', desc: 'Product catalog' },
    { mode: 'serials', page: 'serials', label: 'Serial Numbers', icon: '🔢', desc: 'Tracking serials' },
    { mode: 'batches', page: 'batches', label: 'Batches', icon: '📊', desc: 'Production batches' },
    { mode: 'employees', page: 'employees', label: 'People', icon: '👥', desc: 'Employee badges' },
    { mode: 'settings', page: 'settings', label: 'Settings', icon: '⚙️', desc: 'Workspace config' },
    { mode: 'users', page: 'users', label: 'Users', icon: '🔐', desc: 'User management' }
];

export class OverviewDashboardView {
    private container: HTMLElement;
    private onNavigate: (mode: string) => void;
    private onSelectTemplate: (template: PrebuiltTemplate, action: 'designer' | 'print') => void;
    private userRole: string = 'user';
    private userName: string = '';
    private allowedCategories: string[] = ['All'];

    constructor(options: OverviewDashboardOptions) {
        this.container = options.container;
        this.onNavigate = options.onNavigate;
        this.onSelectTemplate = options.onSelectTemplate;
        this.userRole = options.userRole || 'user';
        this.userName = options.userName || '';
        this.allowedCategories = options.allowedCategories || ['All'];
        this.render();
    }

    public setRolePermissions(role: string, categories: string[]) {
        this.userRole = role;
        this.allowedCategories = categories;
        this.render();
    }

    public render() {
        const role = this.userRole;
        const can = (page: PageKey) => hasPageAccess(role, page);

        // Counts (from local cache) for the data pages this role can view.
        const counts: Record<string, number> = {};
        const read = (key: string): any[] => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : []; } catch { return []; } };
        if (can('products')) counts['Products'] = read('qrlayout_db_products_v2').length || read('qrlayout_db_products').length;
        if (can('serials')) counts['Serial Numbers'] = read('qrlayout_db_serials_v2').length || read('qrlayout_db_serials').length;
        if (can('batches')) counts['Batches'] = read('qrlayout_db_batches_v2').length;
        if (can('employees')) counts['People'] = read('qrlayout_db_employees').length;
        if (can('templates')) counts['Templates'] = PREBUILT_TEMPLATES.length;

        const actions = QUICK_ACTIONS.filter(a => can(a.page));
        const name = (this.userName && this.userName.trim()) ? this.userName.trim() : 'there';
        const roleText = roleLabel(role);

        this.container.innerHTML = `
        <div class="ov-root" style="padding:8px 4px;">

            <!-- WELCOME -->
            <div style="margin-bottom:24px;">
                <div style="font-size:0.8125rem;font-weight:600;color:var(--text-secondary);">Welcome back</div>
                <h1 style="margin:4px 0 6px 0;font-size:1.5rem;font-weight:800;color:var(--text-primary);">${esc(name)}</h1>
                <div style="font-size:0.875rem;color:var(--text-secondary);">
                    You are signed in as <strong style="color:var(--text-primary);">${esc(roleText)}</strong>.
                    ${actions.length === 0 ? 'Contact your administrator if you need access to a module.' : 'Choose a module below to get started.'}
                </div>
            </div>

            <!-- QUICK ACTIONS -->
            <div class="ov-kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:14px;">
                ${actions.map(a => `
                    <div class="ov-kpi-card kpi-${this.colorFor(a.mode)} qa-card" data-mode="${esc(a.mode)}" style="cursor:pointer;">
                        <div class="ov-kpi-icon-wrap">${a.icon}</div>
                        <div class="ov-kpi-body">
                            <div class="ov-kpi-label" style="font-weight:700;">${esc(a.label)}</div>
                            <div class="ov-kpi-sub">${esc(a.desc)}</div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <!-- STATS -->
            ${Object.keys(counts).length > 0 ? `
            <div style="margin-top:24px;">
                <div style="font-size:0.9375rem;font-weight:700;color:var(--text-primary);margin-bottom:12px;">At a glance</div>
                <div class="ov-kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;">
                    ${Object.entries(counts).map(([label, n]) => `
                        <div class="ov-kpi-card kpi-${this.colorFor(label)}">
                            <div class="ov-kpi-body">
                                <div class="ov-kpi-num">${n}</div>
                                <div class="ov-kpi-label">${esc(label)}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
        </div>
        `;

        this.bindActions();
    }

    private colorFor(mode: string): string {
        const map: Record<string, string> = {
            designer: 'indigo', print: 'emerald', library: 'blue', products: 'violet',
            serials: 'blue', batches: 'emerald', employees: 'amber', settings: 'amber', users: 'violet',
            Products: 'blue', 'Serial Numbers': 'violet', Batches: 'emerald', People: 'amber', Templates: 'indigo'
        };
        return map[mode] || 'indigo';
    }

    private bindActions(): void {
        this.container.querySelectorAll<HTMLElement>('.qa-card').forEach(card => {
            card.addEventListener('click', () => { this.onNavigate(card.dataset.mode!); });
        });
    }
}
