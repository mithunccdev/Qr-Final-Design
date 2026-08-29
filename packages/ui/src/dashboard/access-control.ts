// ════════════════════════════════════════════════════════════════════════════
// ROLE & ACCESS CONTROL — Settings page
// Visually maps which pages (view) and actions (create/edit/delete) each role
// gets, and persists the matrix to the database (role_permissions table).
// ════════════════════════════════════════════════════════════════════════════

import {
    PAGES,
    PERMISSION_ACTIONS,
    RolePermissions,
    loadRolePermissions,
    saveRolePermissions,
    rolePermissionsToRows,
    DEFAULT_ROLE_PERMISSIONS
} from './permissions';
import { supabaseService, UserRole } from '../supabase';
import { esc } from '../escape';

const ROLES: { key: UserRole; label: string; icon: string }[] = [
    { key: 'admin', label: 'Administrator', icon: '👑' },
    { key: 'designer', label: 'Label Designer', icon: '🎨' },
    { key: 'user', label: 'Print Operator', icon: '🖨️' }
];

export class AccessControlView {
    private container: HTMLElement;
    private map: RolePermissions;
    private activeRole: UserRole = 'designer';

    constructor(container: HTMLElement) {
        this.container = container;
        this.map = loadRolePermissions();
        this.render();
    }

    public render(): void {
        const role = this.activeRole;
        const isAdminRole = role === 'admin';

        this.container.innerHTML = `
        <div class="entity-manager-root">
            <div class="manager-card-panel" style="max-width: 1080px; margin: 0 auto; width: 100%;">
                <div class="panel-header-row">
                    <div>
                        <h2 class="panel-heading">🔐 Role &amp; Access Control</h2>
                        <p class="panel-subheading">Map which pages each role can view, and which create / edit / delete actions they can perform.</p>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button class="btn btn-outline" id="btn-reset-permissions">🔄 Reset Defaults</button>
                        <button class="btn btn-primary" id="btn-save-permissions">💾 Save Permissions</button>
                    </div>
                </div>

                <!-- ROLE SELECTOR -->
                <div style="display:flex;gap:8px;padding:14px 18px;border-bottom:1px solid var(--border-color,#e2e8f0);background:#fbfcfe;flex-wrap:wrap;">
                    ${ROLES.map(r => `
                        <button class="btn btn-sm ${this.activeRole === r.key ? 'btn-primary' : 'btn-outline'} role-tab" data-role="${r.key}">
                            ${r.icon} ${esc(r.label)}
                        </button>
                    `).join('')}
                </div>

                ${isAdminRole ? `
                    <div style="padding:24px;text-align:center;color:var(--text-secondary);font-size:0.875rem;">
                        <div style="font-size:2rem;margin-bottom:8px;">👑</div>
                        <div style="font-weight:700;color:var(--text-primary);">Administrator has full access</div>
                        <div style="margin-top:4px;">All pages and all actions (view / create / edit / delete) are always allowed for admins and cannot be restricted, so the system cannot be locked out.</div>
                    </div>
                ` : this.renderMatrix(role)}

                <div style="padding:14px 18px;border-top:1px solid var(--border-color,#e2e8f0);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
                    <span style="font-size:0.75rem;color:var(--text-secondary);">Changes are saved to the shared database and applied on next load.</span>
                    <div style="display:flex;gap:8px;">
                        <button class="btn btn-outline" id="btn-cancel-permissions">Cancel</button>
                        <button class="btn btn-primary" id="btn-save-permissions-bottom">💾 Save Permissions</button>
                    </div>
                </div>
            </div>
        </div>`;

        this.bind();
    }

    private renderMatrix(role: UserRole): string {
        const perms = this.map[role] || DEFAULT_ROLE_PERMISSIONS[role];
        return `
        <div style="padding:18px;">
            <table style="width:100%;border-collapse:collapse;font-size:0.8125rem;">
                <thead>
                    <tr>
                        <th style="text-align:left;padding:10px 14px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;min-width:180px;">Page</th>
                        ${PERMISSION_ACTIONS.map(a => `
                            <th style="text-align:center;padding:10px 8px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;" title="${esc(a.label)}">
                                <label style="display:inline-flex;align-items:center;gap:5px;font-weight:700;color:#475569;cursor:pointer;">
                                    <input type="checkbox" class="perm-col-toggle" data-action="${a.key}" /> ${esc(a.label)}
                                </label>
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${PAGES.map(p => `
                        <tr>
                            <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-weight:600;color:#334155;">
                                <span style="margin-right:6px;">${p.icon}</span>${esc(p.label)}
                            </td>
                            ${PERMISSION_ACTIONS.map(a => `
                                <td style="text-align:center;padding:10px 8px;border-bottom:1px solid #f1f5f9;">
                                    <input type="checkbox" class="perm-check" data-page="${p.key}" data-action="${a.key}" ${perms[p.key]?.[a.key] ? 'checked' : ''} />
                                </td>
                            `).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
    }

    private bind(): void {
        this.container.querySelectorAll<HTMLButtonElement>('.role-tab').forEach(b => {
            b.addEventListener('click', () => {
                this.activeRole = b.dataset.role as UserRole;
                this.render();
            });
        });

        // Column toggle = set the whole column for the current role
        this.container.querySelectorAll<HTMLInputElement>('.perm-col-toggle').forEach(cb => {
            cb.addEventListener('change', () => {
                const action = cb.dataset.action as any;
                const page = PAGES[0].key;
                this.setColumnForRole(this.activeRole, action, cb.checked);
                this.render();
            });
        });

        // Individual toggles update the in-memory map
        this.container.querySelectorAll<HTMLInputElement>('.perm-check').forEach(cb => {
            cb.addEventListener('change', () => {
                const page = cb.dataset.page as any;
                const action = cb.dataset.action as any;
                if (!this.map[this.activeRole]) this.map[this.activeRole] = DEFAULT_ROLE_PERMISSIONS[this.activeRole];
                this.map[this.activeRole][page][action] = cb.checked;
            });
        });

        this.container.querySelector('#btn-reset-permissions')?.addEventListener('click', () => {
            if (confirm(`Reset all role permissions to defaults?`)) {
                this.map = JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS));
                this.render();
            }
        });

        const save = async () => {
            const rows = rolePermissionsToRows(this.map);
            const ok = await supabaseService.saveRolePermissions(rows);
            saveRolePermissions(this.map);
            alert(ok
                ? '✅ Permissions saved to the shared database!'
                : 'Permissions saved locally (database not reachable).');
        };
        this.container.querySelector('#btn-save-permissions')?.addEventListener('click', save);
        this.container.querySelector('#btn-save-permissions-bottom')?.addEventListener('click', save);

        this.container.querySelector('#btn-cancel-permissions')?.addEventListener('click', () => {
            this.map = loadRolePermissions();
            this.render();
        });
    }

    private setColumnForRole(role: UserRole, action: any, value: boolean): void {
        if (!this.map[role]) this.map[role] = DEFAULT_ROLE_PERMISSIONS[role];
        for (const p of PAGES) {
            if (this.map[role][p.key]) this.map[role][p.key][action] = value;
        }
    }
}
