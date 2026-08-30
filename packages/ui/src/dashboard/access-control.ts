// ════════════════════════════════════════════════════════════════════════════
// ROLE & ACCESS CONTROL — Settings page (dynamic roles)
// Maps which pages (view) and actions (create/edit/delete) each role gets,
// persists to the database, and supports creating custom roles.
// ════════════════════════════════════════════════════════════════════════════

import {
    PAGES,
    PERMISSION_ACTIONS,
    RolePermissions,
    loadRolePermissions,
    saveRolePermissions,
    rolePermissionsToRows,
    DEFAULT_ROLE_PERMISSIONS,
    blankPermissions,
    RoleDef,
    loadRoles,
    saveRoles
} from './permissions';
import { supabaseService } from '../supabase';
import { esc } from '../escape';

export class AccessControlView {
    private container: HTMLElement;
    private map: RolePermissions;
    private roles: RoleDef[];
    private activeRole: string = 'designer';

    constructor(container: HTMLElement) {
        this.container = container;
        this.map = loadRolePermissions();
        this.roles = loadRoles();
        this.render();
    }

    public render(): void {
        this.map = loadRolePermissions();
        this.roles = loadRoles();
        if (!this.roles.some(r => r.id === this.activeRole)) this.activeRole = this.roles[0]?.id || 'designer';
        const role = this.activeRole;
        const isAdminRole = role === 'admin';

        this.container.innerHTML = `
        <div class="entity-manager-root">
            <div class="manager-card-panel" style="max-width: 1080px; margin: 0 auto; width: 100%;">
                <div class="panel-header-row">
                    <div>
                        <h2 class="panel-heading">🔐 Role &amp; Access Control</h2>
                        <p class="panel-subheading">Map which pages each role can view and which create / edit / delete actions they can perform.</p>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button class="btn btn-outline" id="btn-reset-permissions">🔄 Reset Defaults</button>
                        <button class="btn btn-primary" id="btn-save-permissions">💾 Save Permissions</button>
                    </div>
                </div>

                <!-- ROLE SELECTOR -->
                <div style="display:flex;gap:8px;padding:14px 18px;border-bottom:1px solid var(--border-color,#e2e8f0);background:#fbfcfe;flex-wrap:wrap;align-items:center;">
                    ${this.roles.map(r => `
                        <button class="btn btn-sm ${this.activeRole === r.id ? 'btn-primary' : 'btn-outline'} role-tab" data-role="${esc(r.id)}" title="${esc(r.description || '')}">
                            ${esc(r.name)}${r.isSystem ? '' : ' ✨'}
                        </button>
                    `).join('')}
                    <button class="btn btn-sm btn-outline" id="btn-add-role" style="margin-left:auto;">➕ New Role</button>
                </div>

                ${isAdminRole ? this.adminBlock() : this.renderMatrix(role)}

                <div style="padding:14px 18px;border-top:1px solid var(--border-color,#e2e8f0);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
                    <span style="font-size:0.75rem;color:var(--text-secondary);">Changes are saved to the shared database and applied on next load.</span>
                    <div style="display:flex;gap:8px;">
                        ${!isAdminRole ? `<button class="btn btn-outline" id="btn-delete-role" style="color:#ef4444;border-color:#fecaca;">🗑️ Delete Role</button>` : ''}
                        <button class="btn btn-primary" id="btn-save-permissions-bottom">💾 Save Permissions</button>
                    </div>
                </div>
            </div>
        </div>`;

        this.bind();
    }

    private adminBlock(): string {
        return `
        <div style="padding:24px;text-align:center;color:var(--text-secondary);font-size:0.875rem;">
            <div style="font-size:2rem;margin-bottom:8px;">👑</div>
            <div style="font-weight:700;color:var(--text-primary);">Administrator has full access</div>
            <div style="margin-top:4px;">All pages and all actions are always allowed for admins and cannot be restricted, so the system cannot be locked out.</div>
        </div>`;
    }

    private renderMatrix(role: string): string {
        const perms = this.map[role] || blankPermissions();
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
            b.addEventListener('click', () => { this.activeRole = b.dataset.role!; this.render(); });
        });

        this.container.querySelector('#btn-add-role')?.addEventListener('click', () => this.openAddRoleModal());
        this.container.querySelector('#btn-delete-role')?.addEventListener('click', async () => {
            if (!confirm(`Delete role "${this.activeRole}"? Users assigned to it will fall back to 'user'.`)) return;
            await supabaseService.deleteRole(this.activeRole);
            saveRoles(this.roles.filter(r => r.id !== this.activeRole));
            const m = loadRolePermissions(); delete m[this.activeRole]; saveRolePermissions(m);
            this.activeRole = 'user';
            this.render();
        });

        this.container.querySelectorAll<HTMLInputElement>('.perm-col-toggle').forEach(cb => {
            cb.addEventListener('change', () => {
                const action = cb.dataset.action as any;
                this.setColumnForRole(this.activeRole, action, cb.checked);
                this.render();
            });
        });

        this.container.querySelectorAll<HTMLInputElement>('.perm-check').forEach(cb => {
            cb.addEventListener('change', () => {
                const page = cb.dataset.page as any;
                const action = cb.dataset.action as any;
                if (!this.map[this.activeRole]) this.map[this.activeRole] = blankPermissions();
                this.map[this.activeRole][page][action] = cb.checked;
            });
        });

        this.container.querySelector('#btn-reset-permissions')?.addEventListener('click', () => {
            if (confirm('Reset all role permissions to the built-in defaults?')) {
                this.map = JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS));
                this.render();
            }
        });

        const save = async () => {
            const rows = rolePermissionsToRows(this.map);
            const ok = await supabaseService.saveRolePermissions(rows);
            saveRolePermissions(this.map);
            alert(ok ? '✅ Permissions saved to the shared database!' : 'Permissions saved locally (database not reachable).');
        };
        this.container.querySelector('#btn-save-permissions')?.addEventListener('click', save);
        this.container.querySelector('#btn-save-permissions-bottom')?.addEventListener('click', save);
    }

    private setColumnForRole(role: string, action: any, value: boolean): void {
        if (!this.map[role]) this.map[role] = blankPermissions();
        for (const p of PAGES) {
            if (this.map[role][p.key]) this.map[role][p.key][action] = value;
        }
    }

    private openAddRoleModal(): void {
        const panel = this.container.querySelector('.panel-header-row')?.parentElement as HTMLElement;
        const body = this.container.querySelector('.manager-card-panel') as HTMLElement;
        if (!body) return;
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `
        <div style="background:var(--surface);border-radius:14px;width:420px;max-width:94vw;padding:20px;">
            <h3 style="margin:0 0 14px 0;">➕ Create Custom Role</h3>
            <div class="form-group"><label style="font-weight:600;">Role Name *</label><input id="new-role-name" placeholder="e.g. Warehouse, QC, Dispatch" /></div>
            <div class="form-group" style="margin-top:10px;"><label style="font-weight:600;">Description</label><input id="new-role-desc" placeholder="Optional" /></div>
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
                <button class="btn btn-outline" id="role-add-cancel">Cancel</button>
                <button class="btn btn-primary" id="role-add-save">✨ Create</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#role-add-cancel')?.addEventListener('click', () => overlay.remove());
        overlay.querySelector('#role-add-save')?.addEventListener('click', async () => {
            const name = (overlay.querySelector('#new-role-name') as HTMLInputElement).value.trim();
            const desc = (overlay.querySelector('#new-role-desc') as HTMLInputElement).value.trim();
            if (!name) { alert('Enter a role name.'); return; }
            const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
            if (this.roles.some(r => r.id === id)) { alert('A role with this name already exists.'); return; }
            const role: RoleDef = { id, name, description: desc, isSystem: false };
            await supabaseService.saveRole(role);
            saveRoles([...this.roles, role]);
            this.map[id] = blankPermissions();
            saveRolePermissions(this.map);
            this.activeRole = id;
            this.roles = loadRoles();
            overlay.remove();
            this.render();
        });
    }
}
