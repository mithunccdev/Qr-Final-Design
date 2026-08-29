import { supabaseService, UserProfile, UserRole } from '../supabase';
import { getAssignableTemplateCategories } from './templates-data';
import { getMasterData } from './master-data';
import { esc } from '../escape';

export class UserManagerView {
    private container: HTMLElement;
    private users: UserProfile[] = [];
    private searchQuery = '';
    private roleFilter: string = 'All';
    private editingUser: UserProfile | null = null;

    constructor(container: HTMLElement) {
        this.container = container;
        this.loadUsers();
    }

    public async loadUsers() {
        this.users = await supabaseService.fetchUserProfiles();
        this.render();
    }

    public render() {
        const totalUsers = this.users.length;
        const adminCount = this.users.filter(u => u.role === 'admin').length;
        const designerCount = this.users.filter(u => u.role === 'designer').length;
        const operatorCount = this.users.filter(u => u.role === 'user').length;

        const filtered = this.users.filter(u => {
            const matchRole = this.roleFilter === 'All' || u.role === this.roleFilter;
            const q = this.searchQuery.toLowerCase();
            const matchSearch = !this.searchQuery ||
                u.fullName.toLowerCase().includes(q) ||
                u.email.toLowerCase().includes(q) ||
                u.role.toLowerCase().includes(q);
            return matchRole && matchSearch;
        });

        this.container.innerHTML = `
        <div class="entity-manager-root user-manager-root">
            <!-- TOP STATS BAR -->
            <div class="stats-overview-grid">
                <div class="stat-card">
                    <div class="stat-icon bg-indigo-100 text-indigo-600">👥</div>
                    <div class="stat-content">
                        <span class="stat-label">Total Accounts</span>
                        <span class="stat-value">${totalUsers}</span>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-icon bg-purple-100 text-purple-600">👑</div>
                    <div class="stat-content">
                        <span class="stat-label">Administrators</span>
                        <span class="stat-value">${adminCount}</span>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-icon bg-cyan-100 text-cyan-600">🎨</div>
                    <div class="stat-content">
                        <span class="stat-label">Label Designers</span>
                        <span class="stat-value">${designerCount}</span>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-icon bg-emerald-100 text-emerald-600">🖨️</div>
                    <div class="stat-content">
                        <span class="stat-label">Print Operators</span>
                        <span class="stat-value">${operatorCount}</span>
                    </div>
                </div>
            </div>

            <!-- MAIN USER DIRECTORY PANEL -->
            <div class="manager-card-panel">
                <div class="panel-header-row">
                    <div>
                        <h2 class="panel-heading">🔐 User Accounts &amp; Role-Based Access Control</h2>
                        <p class="panel-subheading">Manage team accounts, assign designer/operator permissions, set passwords, and restrict accessible template categories.</p>
                    </div>

                    <div class="panel-actions-group">
                        <button class="btn btn-primary" id="btn-create-user-modal">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
                            <span>Create New User</span>
                        </button>
                    </div>
                </div>

                <!-- FILTER & SEARCH BAR -->
                <div class="table-filter-bar">
                    <div class="search-input-wrapper">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                        <input type="text" id="user-search-input" placeholder="Search by name, email, or role..." value="${this.searchQuery}" />
                    </div>

                    <div class="filter-dropdown-wrapper">
                        <select id="user-role-filter">
                            <option value="All" ${this.roleFilter === 'All' ? 'selected' : ''}>All Roles</option>
                            <option value="admin" ${this.roleFilter === 'admin' ? 'selected' : ''}>Admins</option>
                            <option value="designer" ${this.roleFilter === 'designer' ? 'selected' : ''}>Designers</option>
                            <option value="user" ${this.roleFilter === 'user' ? 'selected' : ''}>Print Operators</option>
                        </select>
                    </div>
                </div>

                <!-- USERS TABLE -->
                <div class="table-responsive-container">
                    <table class="manager-data-table">
                        <thead>
                            <tr>
                                <th>User Profile</th>
                                <th>Assigned Role</th>
                                <th>Template Permissions</th>
                                <th>Allocated Plants</th>
                                <th>Status</th>
                                <th>Created</th>
                                <th style="text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filtered.map(user => this.renderUserRow(user)).join('')}
                            ${filtered.length === 0 ? `
                                <tr>
                                    <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                                        No users found matching your search.
                                    </td>
                                </tr>
                            ` : ''}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- MODAL DIALOG CONTAINER -->
            <div id="user-modal-container"></div>
        </div>
        `;

        this.bindEvents();
    }

    private renderUserRow(user: UserProfile): string {
        const initials = user.fullName ? user.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'U';
        
        let roleBadge = '<span class="tier-badge role-badge-user">🖨️ Print Operator</span>';
        if (user.role === 'admin') {
            roleBadge = '<span class="tier-badge role-badge-admin">👑 Administrator</span>';
        } else if (user.role === 'designer') {
            roleBadge = '<span class="tier-badge role-badge-designer">🎨 Label Designer</span>';
        }

        const isAllCategories = user.allowedTemplateCategories.includes('All') || user.role === 'admin' || user.role === 'designer';
        const categoriesDisplay = isAllCategories
            ? '<span class="var-pill">All Templates (Full Access)</span>'
            : user.allowedTemplateCategories.map(cat => `<span class="var-pill">🏷️ ${esc(cat)}</span>`).join(' ');

        const userPlants = user.allowedPlants || ['All'];
        const isAllPlants = userPlants.includes('All') || user.role === 'admin';
        const plantsDisplay = isAllPlants
            ? '<span class="var-pill" style="background: var(--color-emerald-100, #d1fae5); color: var(--color-emerald-700, #065f46);">🏭 All Plants</span>'
            : userPlants.map(p => `<span class="var-pill" style="background: var(--color-blue-100, #dbeafe); color: var(--color-blue-700, #1d4ed8);">🏭 ${esc(p)}</span>`).join(' ');

        return `
        <tr class="table-row-item">
            <td>
                <div class="user-cell-wrap">
                    <div class="user-avatar-initials">${esc(initials)}</div>
                    <div>
                        <div class="item-title-bold">${esc(user.fullName)}</div>
                        <div class="item-desc-sub">${esc(user.email)}</div>
                    </div>
                </div>
            </td>
            <td>${roleBadge}</td>
            <td>
                <div class="var-pills-wrap">${categoriesDisplay}</div>
            </td>
            <td>
                <div class="var-pills-wrap">${plantsDisplay}</div>
            </td>
            <td>
                <span class="status-badge ${user.isActive ? 'status-active' : 'status-dispatched'}">
                    ${user.isActive ? '● Active' : 'Deactivated'}
                </span>
            </td>
            <td style="font-size: 0.75rem; color: var(--text-secondary);">
                ${new Date(user.createdAt).toLocaleDateString()}
            </td>
            <td style="text-align: right;">
                <div class="row-actions-group" style="justify-content: flex-end;">
                    <button class="btn btn-outline btn-xs btn-edit-user" data-id="${user.id}" title="Edit User & Permissions">
                        ✏️ Edit
                    </button>
                    ${this.canManageRow(user) ? `
                        <button class="btn btn-outline btn-xs btn-toggle-status" data-id="${user.id}" title="${user.isActive ? 'Deactivate' : 'Activate'}">
                            ${user.isActive ? '⏸️ Suspend' : '▶️ Activate'}
                        </button>
                        <button class="btn btn-outline btn-xs btn-danger-soft btn-delete-user" data-id="${user.id}" title="Delete User">
                            🗑️
                        </button>
                    ` : ''}
                </div>
            </td>
        </tr>
        `;
    }

    /** Prevent an admin from locking themselves / the system out.
     *  Guards against editing, suspending, or deleting: (a) your own account,
     *  and (b) the last remaining active admin. */
    private canManageRow(user: UserProfile): boolean {
        const current = supabaseService.getCurrentUser();
        if (current && user.id === current.id) return false;
        if (user.role === 'admin' && user.isActive) {
            const otherActiveAdmin = this.users.some(u => u.id !== user.id && u.role === 'admin' && u.isActive);
            if (!otherActiveAdmin) return false;
        }
        return true;
    }

    private bindEvents() {
        // Search
        this.container.querySelector<HTMLInputElement>('#user-search-input')?.addEventListener('input', (e) => {
            this.searchQuery = (e.target as HTMLInputElement).value;
            this.render();
        });

        // Role Filter
        this.container.querySelector<HTMLSelectElement>('#user-role-filter')?.addEventListener('change', (e) => {
            this.roleFilter = (e.target as HTMLSelectElement).value;
            this.render();
        });

        // Create Modal Open
        this.container.querySelector('#btn-create-user-modal')?.addEventListener('click', () => {
            this.openUserModal(null);
        });

        // Edit User
        this.container.querySelectorAll<HTMLButtonElement>('.btn-edit-user').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLButtonElement).dataset.id;
                const found = this.users.find(u => u.id === id);
                if (found) this.openUserModal(found);
            });
        });

        // Toggle Active
        this.container.querySelectorAll<HTMLButtonElement>('.btn-toggle-status').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = (e.currentTarget as HTMLButtonElement).dataset.id;
                const found = this.users.find(u => u.id === id);
                if (found) {
                    found.isActive = !found.isActive;
                    await supabaseService.updateUser(found);
                    this.loadUsers();
                }
            });
        });

        // Delete User
        this.container.querySelectorAll<HTMLButtonElement>('.btn-delete-user').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = (e.currentTarget as HTMLButtonElement).dataset.id;
                const found = this.users.find(u => u.id === id);
                if (found && confirm(`Are you sure you want to permanently delete the user account for ${found.fullName} (${found.email})?`)) {
                    await supabaseService.deleteUser(id!);
                    this.loadUsers();
                }
            });
        });
    }

    private openUserModal(user: UserProfile | null) {
        const modalWrap = this.container.querySelector('#user-modal-container') as HTMLElement;
        if (!modalWrap) return;

        const isEdit = user !== null;
        const currentCategories = user ? user.allowedTemplateCategories : ['All'];
        const currentPlants = user ? (user.allowedPlants || ['All']) : ['All'];

        // Resolve available plants from master data
        const availablePlants = getMasterData('plant');

        modalWrap.innerHTML = `
        <div class="dashboard-modal-backdrop">
            <div class="dashboard-modal-box" style="width: 640px; max-height: 90vh; overflow-y: auto;">
                <div class="panel-header-row">
                    <div>
                        <h2 class="panel-heading">${isEdit ? '✏️ Edit User Account &amp; Permissions' : '➕ Create New Workspace User'}</h2>
                        <p class="panel-subheading">Assign role privileges, passwords, plant allocations, and template category restrictions.</p>
                    </div>
                    <button class="btn btn-outline btn-xs" id="btn-close-user-modal" style="font-weight: 600;">✕</button>
                </div>

                <form id="form-user-modal" style="padding: 20px 24px; display: flex; flex-direction: column; gap: 16px;">
                    <div class="modal-form-grid" style="padding: 0;">
                        <div class="form-group">
                            <label style="font-weight: 700;">Full Name</label>
                            <input type="text" id="modal-user-name" required placeholder="e.g. John Doe" value="${user ? user.fullName : ''}" />
                        </div>

                        <div class="form-group">
                            <label style="font-weight: 700;">Work Email Address</label>
                            <input type="email" id="modal-user-email" required placeholder="user@kajariabathware.in" value="${user ? user.email : ''}" ${isEdit ? 'readonly style="background: var(--surface-muted);"' : ''} />
                        </div>

                        <div class="form-group col-span-2">
                            <label style="font-weight: 700;">User Role &amp; Access Tier</label>
                            <select id="modal-user-role" style="font-weight: 600;">
                                <option value="admin" ${user && user.role === 'admin' ? 'selected' : ''}>👑 Administrator (Full System &amp; User Control)</option>
                                <option value="designer" ${user && user.role === 'designer' ? 'selected' : ''}>🎨 Label Designer (Create &amp; Modify All Templates)</option>
                                <option value="user" ${!user || user.role === 'user' ? 'selected' : ''}>🖨️ Print Operator (Print-Only, Restricted Templates)</option>
                            </select>
                        </div>

                        <div class="form-group ${isEdit ? 'col-span-2' : ''}">
                            <label style="font-weight: 700;">${isEdit ? 'Reset Password (Leave blank to keep current)' : 'Account Password'}</label>
                            <input type="password" id="modal-user-pass" ${isEdit ? '' : 'required'} placeholder="••••••••••••" />
                        </div>

                        ${!isEdit ? `
                            <div class="form-group">
                                <label style="font-weight: 700;">Confirm Password</label>
                                <input type="password" id="modal-user-pass-confirm" required placeholder="••••••••••••" />
                            </div>
                        ` : ''}
                    </div>

                    <!-- PLANT ALLOCATION -->
                    <div class="settings-section-card" style="background: var(--surface-muted); padding: 14px;">
                        <label style="font-weight: 600; font-size: 0.8125rem; color: var(--text-primary); display: block; margin-bottom: 6px;">
                            🏭 Allocated Manufacturing Plants:
                        </label>
                        <p style="font-size: 0.72rem; color: var(--text-secondary); margin: 0 0 10px 0;">
                            Only products from the selected plants will appear in this user's print job dropdown.
                        </p>
                        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
                            <label class="checkbox-item" style="font-weight: 700;">
                                <input type="checkbox" id="plant-all" value="All" ${currentPlants.includes('All') ? 'checked' : ''} />
                                <span>⭐ All Plants</span>
                            </label>
                            ${availablePlants.map(p => `
                                <label class="checkbox-item">
                                    <input type="checkbox" class="plant-checkbox" value="${esc(p.code)}" ${currentPlants.includes(p.code) || currentPlants.includes('All') ? 'checked' : ''} />
                                    <span>🏭 ${esc(p.label)}${p.plantCode ? ` (${esc(p.plantCode)})` : ''}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>

                    <!-- TEMPLATE ACCESS RESTRICTIONS -->
                    <div id="template-restrictions-box" class="settings-section-card" style="background: var(--surface-muted); padding: 14px;">
                        <label style="font-weight: 600; font-size: 0.8125rem; color: var(--text-primary); display: block; margin-bottom: 6px;">
                            🏷️ Accessible Template Categories (For Print Operators):
                        </label>
                        <p style="font-size: 0.72rem; color: var(--text-secondary); margin: 0 0 10px 0;">
                            Specify which types of label templates this user is allowed to batch print.
                        </p>

                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                            <label class="checkbox-item" style="font-weight: 700;">
                                <input type="checkbox" id="cat-all" value="All" ${currentCategories.includes('All') ? 'checked' : ''} />
                                <span>⭐ All Templates</span>
                            </label>
                            ${getAssignableTemplateCategories().map(cat => `
                                <label class="checkbox-item">
                                    <input type="checkbox" class="cat-checkbox" value="${esc(cat.id)}" ${currentCategories.includes(cat.id) || currentCategories.includes('All') ? 'checked' : ''} />
                                    <span>${esc(cat.icon)} ${esc(cat.label)}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>

                    <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
                        <button type="button" class="btn btn-outline" id="btn-cancel-user-modal">Cancel</button>
                        <button type="submit" class="btn btn-primary" id="btn-save-user-submit">
                            ${isEdit ? '💾 Update Account' : '✨ Create User Account'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
        `;

        // Bind Modal Events
        const closeBtn = modalWrap.querySelector('#btn-close-user-modal');
        const cancelBtn = modalWrap.querySelector('#btn-cancel-user-modal');
        const close = () => { modalWrap.innerHTML = ''; };
        closeBtn?.addEventListener('click', close);
        cancelBtn?.addEventListener('click', close);

        // "All Templates" checkbox logic
        const catAll = modalWrap.querySelector<HTMLInputElement>('#cat-all');
        const checkboxes = modalWrap.querySelectorAll<HTMLInputElement>('.cat-checkbox');
        catAll?.addEventListener('change', () => {
            checkboxes.forEach(cb => { cb.checked = catAll.checked; });
        });

        // "All Plants" checkbox logic
        const plantAll = modalWrap.querySelector<HTMLInputElement>('#plant-all');
        const plantCheckboxes = modalWrap.querySelectorAll<HTMLInputElement>('.plant-checkbox');
        plantAll?.addEventListener('change', () => {
            plantCheckboxes.forEach(cb => { cb.checked = plantAll.checked; });
        });

        // Form Submit
        const form = modalWrap.querySelector('#form-user-modal') as HTMLFormElement;
        form?.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = (modalWrap.querySelector('#modal-user-name') as HTMLInputElement).value.trim();
            const email = (modalWrap.querySelector('#modal-user-email') as HTMLInputElement).value.trim().toLowerCase();
            const role = (modalWrap.querySelector('#modal-user-role') as HTMLSelectElement).value as UserRole;
            const pass = (modalWrap.querySelector('#modal-user-pass') as HTMLInputElement).value;
            
            if (!isEdit) {
                const passConfirm = (modalWrap.querySelector('#modal-user-pass-confirm') as HTMLInputElement).value;
                if (pass !== passConfirm) {
                    alert('Passwords do not match! Please check and try again.');
                    return;
                }
            }

            // Gather selected categories
            const selectedCategories: string[] = [];
            if (catAll?.checked) {
                selectedCategories.push('All');
            } else {
                checkboxes.forEach(cb => {
                    if (cb.checked) selectedCategories.push(cb.value);
                });
            }
            if (selectedCategories.length === 0) selectedCategories.push('All');

            // Gather selected plants
            const selectedPlants: string[] = [];
            if (plantAll?.checked) {
                selectedPlants.push('All');
            } else {
                plantCheckboxes.forEach(cb => {
                    if (cb.checked) selectedPlants.push(cb.value);
                });
            }
            if (selectedPlants.length === 0) selectedPlants.push('All');

            if (isEdit && user) {
                user.fullName = name;
                user.role = role;
                user.allowedTemplateCategories = selectedCategories;
                user.allowedPlants = selectedPlants;
                await supabaseService.updateUser(user);
                alert(`User ${name} updated successfully!`);
            } else {
                const newProfile: UserProfile = {
                    id: `usr-${Date.now()}`,
                    email: email,
                    fullName: name,
                    role: role,
                    allowedTemplateCategories: selectedCategories,
                    allowedPlants: selectedPlants,
                    isActive: true,
                    createdAt: new Date().toISOString()
                };
                const result = await supabaseService.createUser(newProfile, pass);
                alert(result.success
                    ? `User account for ${name} (${email}) created successfully!`
                    : `Could not create user:\n${result.message}`);
                if (!result.success) return;
            }

            close();
            this.loadUsers();
        });
    }
}
