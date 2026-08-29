import { StickerPrinter, StickerLayout, StickerElement } from 'qrlayout-core';
import {
    PREBUILT_TEMPLATES,
    TEMPLATE_CATEGORIES,
    PRESET_USER_ROLES,
    PrebuiltTemplate,
    TemplateCategoryType,
    UserAccessRoleProfile,
    getAssignableTemplateCategories,
    getAllTemplateCategories,
    getCategoryLabel,
    addCustomCategory,
    updateCategory,
    deleteCategory
} from './templates-data';
import {
    PRINTER_TYPES,
    PrinterId,
    getMediaForPrinter,
    getMediaById,
    formatLabelSize,
    mediaToPresetFields
} from './print-media';
import { supabaseService } from '../supabase';
import { esc } from '../escape';
import { canCurrentUser } from './permissions';
import type { EntitySchema } from '../types';

export interface TemplateLibraryOptions {
    container: HTMLElement;
    onSelectForDesigner: (template: PrebuiltTemplate) => void;
    onSelectForPrint: (template: PrebuiltTemplate) => void;
    userRole?: string;
    currentRoleId?: string;
    allowedCategories?: (TemplateCategoryType | 'All')[];
}

const STORAGE_KEY_CUSTOM_TEMPLATES = 'qrlayout_db_custom_templates_v2';
const STORAGE_KEY_TEMPLATE_OVERRIDES = 'qrlayout_template_overrides_v1';

interface TemplateOverride {
    layout: StickerLayout;
    title?: string;
}

function loadTemplateOverrides(): Record<string, TemplateOverride> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_TEMPLATE_OVERRIDES);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        console.warn('Failed loading template overrides', e);
        return {};
    }
}

function saveTemplateOverrides(overrides: Record<string, TemplateOverride>): void {
    try {
        localStorage.setItem(STORAGE_KEY_TEMPLATE_OVERRIDES, JSON.stringify(overrides));
    } catch (e) {
        console.warn('Failed saving template overrides', e);
    }
}

export class TemplateLibraryView {
    private container: HTMLElement;
    private onSelectForDesigner: (template: PrebuiltTemplate) => void;
    private onSelectForPrint: (template: PrebuiltTemplate) => void;
    private selectedCategory: TemplateCategoryType | 'All' = 'All';
    private searchQuery: string = '';
    private printer: StickerPrinter;

    // Custom & All Templates
    private customTemplates: PrebuiltTemplate[] = [];

    // RBAC & Access Control State
    private activeRole: UserAccessRoleProfile;
    private customAllowedCategories: (TemplateCategoryType | 'All')[] | null = null;

    // View navigation: list / create / view (separate pages within the Templates section)
    private lvMode: 'list' | 'view' = 'list';
    private viewingTemplate: PrebuiltTemplate | null = null;

    constructor(options: TemplateLibraryOptions) {
        this.container = options.container;
        this.onSelectForDesigner = options.onSelectForDesigner;
        this.onSelectForPrint = options.onSelectForPrint;

        const roleId = options.currentRoleId || 'admin';
        this.activeRole = PRESET_USER_ROLES.find(r => r.roleId === roleId) || PRESET_USER_ROLES[0];
        if (options.allowedCategories) {
            this.customAllowedCategories = options.allowedCategories;
        }

        this.printer = new StickerPrinter();
        this.loadCustomTemplates();
        this.render();
        void this.syncCustomTemplatesFromDb();
    }

    /** Merge templates from Supabase with the local cache (DB wins). */
    private async syncCustomTemplatesFromDb(): Promise<void> {
        const dbTemplates = await supabaseService.fetchTemplates();
        if (dbTemplates === null) return; // offline / Supabase not configured

        const map = new Map<string, PrebuiltTemplate>();
        dbTemplates.forEach(t => map.set(t.id, t));
        this.customTemplates.forEach(t => { if (!map.has(t.id)) map.set(t.id, t); });
        this.customTemplates = Array.from(map.values());
        this.saveCustomTemplates();
        this.render();
    }

    private loadCustomTemplates() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_TEMPLATES);
            if (raw) {
                this.customTemplates = JSON.parse(raw);
            } else {
                this.customTemplates = [];
            }
        } catch (e) {
            console.error('Failed loading custom templates from storage', e);
            this.customTemplates = [];
        }
    }

    private saveCustomTemplates() {
        try {
            localStorage.setItem(STORAGE_KEY_CUSTOM_TEMPLATES, JSON.stringify(this.customTemplates));
        } catch (e) {
            console.error('Failed saving custom templates', e);
        }
    }

    public getAllTemplates(): PrebuiltTemplate[] {
        const overrides = loadTemplateOverrides();
        const builtIn = PREBUILT_TEMPLATES.map(t => {
            const ov = overrides[t.id];
            if (!ov) return t;
            return {
                ...t,
                title: ov.title || t.title,
                layout: JSON.parse(JSON.stringify(ov.layout))
            } as PrebuiltTemplate;
        });
        return [...this.customTemplates, ...builtIn];
    }

    /**
     * Persist an edited layout back to a template in the library.
     * Custom templates are written to localStorage; built-in templates are
     * stored as an override so the edit survives reloads.
     */
    public updateTemplate(id: string, layout: StickerLayout, title?: string): void {
        const custom = this.customTemplates.find(c => c.id === id);
        if (custom) {
            custom.layout = JSON.parse(JSON.stringify(layout));
            if (title?.trim()) custom.title = title.trim();
            this.saveCustomTemplates();
            void supabaseService.saveTemplate({ ...custom });
            return;
        }
        if (PREBUILT_TEMPLATES.some(t => t.id === id)) {
            const overrides = loadTemplateOverrides();
            overrides[id] = {
                layout: JSON.parse(JSON.stringify(layout)),
                title: title?.trim() ? title.trim() : undefined
            };
            saveTemplateOverrides(overrides);
        }
    }

    /** Re-render the library (call when returning to it after an edit). */
    public refresh(): void {
        this.render();
    }

    /**
     * Programmatic API for setting user role / category permissions
     * Can be invoked directly from the User Creation & Access Management section
     */
    public setUserRole(roleId: string) {
        const found = PRESET_USER_ROLES.find(r => r.roleId === roleId);
        if (found) {
            this.activeRole = found;
            this.customAllowedCategories = null;
            this.selectedCategory = 'All';
            this.render();
        }
    }

    public setCustomAccessPermissions(allowedCategories: (TemplateCategoryType | 'All')[]) {
        this.customAllowedCategories = allowedCategories;
        this.selectedCategory = 'All';
        this.render();
    }

    public getEffectiveAllowedCategories(): (TemplateCategoryType | 'All')[] {
        if (this.customAllowedCategories) return this.customAllowedCategories;
        return this.activeRole.allowedCategories;
    }

    private get filteredTemplates(): PrebuiltTemplate[] {
        const allowed = this.getEffectiveAllowedCategories();
        const isAdmin = allowed.includes('All');
        const allTemplates = this.getAllTemplates();

        return allTemplates.filter(t => {
            // Role & Access category authorization check
            const hasCategoryAccess = isAdmin || allowed.includes(t.category);
            if (!hasCategoryAccess) return false;

            // Category tab filter
            const matchesCat = this.selectedCategory === 'All' || t.category === this.selectedCategory;

            // Search query filter
            const q = this.searchQuery.toLowerCase().trim();
            const matchesSearch = !q ||
                t.title.toLowerCase().includes(q) ||
                t.description.toLowerCase().includes(q) ||
                t.category.toLowerCase().includes(q) ||
                (t.categoryKey && t.categoryKey.toLowerCase().includes(q));

            return matchesCat && matchesSearch;
        });
    }

    public render() {
        if (this.lvMode === 'view' && this.viewingTemplate) {
            this.renderViewPage();
            return;
        }
        this.renderListPage();
    }

    private renderListPage() {
        const allowed = this.getEffectiveAllowedCategories();
        const isFullAdmin = allowed.includes('All');
        const allTemplates = this.getAllTemplates();

        // Only display category tabs that the user is permitted to see
        const visibleCategoryTabs = getAllTemplateCategories().filter(cat => {
            if (cat.id === 'All') return true;
            if (isFullAdmin) return true;
            return allowed.includes(cat.id);
        });

        // Compute count for each category
        const categoryCounts: Record<string, number> = { All: 0 };
        allTemplates.forEach(t => {
            const hasAccess = isFullAdmin || allowed.includes(t.category);
            if (hasAccess) {
                categoryCounts['All'] = (categoryCounts['All'] || 0) + 1;
                categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
            }
        });

        const templateList = this.filteredTemplates;

        this.container.innerHTML = `
        <div class="template-library-container">
            <!-- TOP ACCESS CONTROL SIMULATOR & STATUS BAR -->
            <div class="template-rbac-banner">
                <div class="rbac-status-info">
                    <span class="rbac-role-pill">${this.activeRole.badge}</span>
                    <div>
                        <strong class="rbac-user-title">${this.activeRole.roleName}</strong>
                        <p class="rbac-user-desc">${this.activeRole.description}</p>
                    </div>
                </div>

                <div class="rbac-right-actions">
                    <div class="rbac-role-selector-wrap">
                        <label for="select-simulate-role" class="rbac-select-label">Access Simulator:</label>
                        <select id="select-simulate-role" class="rbac-role-dropdown" title="Simulate Category Access for User Roles">
                            ${PRESET_USER_ROLES.map(r => `
                                <option value="${r.roleId}" ${this.activeRole.roleId === r.roleId ? 'selected' : ''}>
                                    ${r.badge} — ${r.roleName}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    ${canCurrentUser('templates', 'create') ? `
                    <button class="btn btn-primary btn-create-template-primary" id="btn-open-create-template-modal">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
                        <span>Create Template</span>
                    </button>
                    ` : ''}
                </div>
            </div>

            <!-- LIBRARY HEADER -->
            <div class="library-header">
                <div class="library-header-text">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                        <h2 class="library-main-title">📁 Template Library &amp; Access Master</h2>
                    </div>
                    <p class="library-sub-text">
                        Category-governed sticker layouts for automated batch printing and visual customization.
                        Authorized templates: <strong>${templateList.length}</strong> available.
                    </p>
                </div>

                <div class="library-toolbar">
                    <!-- SEARCH INPUT -->
                    <div class="search-box">
                        <svg class="search-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                        <input type="text" id="lib-search-input" placeholder="Search templates..." value="${this.searchQuery}" />
                        ${this.searchQuery ? `<button class="btn-clear-search" id="btn-clear-template-search">✕</button>` : ''}
                    </div>

                    <button class="btn btn-outline btn-sm" id="btn-open-manage-categories" title="Create, rename, or delete template categories">
                        <span>⚙️ Manage Categories</span>
                    </button>
                </div>

                <!-- CATEGORY NAVIGATION PILLS -->
                <div class="category-pills-scroll">
                    ${visibleCategoryTabs.map(cat => {
                        const count = categoryCounts[cat.id] || 0;
                        const isActive = this.selectedCategory === cat.id;
                        return `
                        <button class="cat-pill ${isActive ? 'active' : ''}" data-cat="${esc(cat.id)}">
                            <span class="cat-pill-icon">${esc(cat.icon)}</span>
                            <span class="cat-pill-label">${esc(cat.label)}</span>
                            <span class="cat-pill-count">${count}</span>
                        </button>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- TEMPLATE LIST (LINE ITEMS) -->
            <div class="template-list-table-wrap">
                ${templateList.length === 0 ? this.renderNoAccessState() : `
                <table class="template-list-table">
                    <thead>
                        <tr>
                            <th style="width:44%;">Template</th>
                            <th style="width:16%;">Category</th>
                            <th style="width:14%;">Label Size</th>
                            <th style="width:12%;">Fields</th>
                            <th style="text-align:right;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${templateList.map(t => this.renderLineItem(t)).join('')}
                    </tbody>
                </table>`}
            </div>

            <!-- CREATE TEMPLATE MODAL CONTAINER -->
            <div id="create-template-modal-container"></div>
            <!-- MANAGE CATEGORIES MODAL CONTAINER -->
            <div id="manage-categories-modal-container"></div>
        </div>
        `;

        this.bindEvents();
        this.renderCardThumbnails();
    }

    private renderLineItem(t: PrebuiltTemplate): string {
        const isCustom = this.customTemplates.some(ct => ct.id === t.id);
        const canDesign = this.activeRole.roleId === 'admin' || this.activeRole.roleId.startsWith('plant-');
        return `
        <tr class="template-line-item" data-id="${t.id}">
            <td>
                <div class="line-item-cell">
                    <span class="line-item-icon">${esc(t.icon || '🏷️')}</span>
                    <div>
                        <div class="line-item-title">${esc(t.title)}${isCustom ? ' <span class="custom-badge-pill">✨ User</span>' : ''}</div>
                        <div class="line-item-desc">${esc(t.description)}</div>
                    </div>
                </div>
            </td>
            <td><span class="template-cat-pill">${esc(getCategoryLabel(t.category))}</span></td>
            <td class="line-size">${esc(String(t.layout.width))} × ${esc(String(t.layout.height))} ${esc(t.layout.unit)}</td>
            <td class="line-fields">${t.schema.fields.length} fields</td>
            <td>
                <div class="line-item-actions">
                    <button class="btn btn-outline btn-xs btn-view-template" data-id="${t.id}" title="View template details">👁 View</button>
                    ${canDesign ? `<button class="btn btn-outline btn-xs btn-edit-template" data-id="${t.id}" title="Edit in Designer">✏️ Edit</button>` : ''}
                    ${isCustom ? `<button class="btn btn-danger-soft btn-xs btn-delete-tpl" data-id="${t.id}" title="Delete custom template">🗑️</button>` : ''}
                </div>
            </td>
        </tr>`;
    }

    private renderTemplateCard(t: PrebuiltTemplate): string {
        const canDesign = this.activeRole.roleId === 'admin' || this.activeRole.roleId.startsWith('plant-');
        const isCustom = this.customTemplates.some(ct => ct.id === t.id);

        return `
        <div class="template-card ${isCustom ? 'custom-template-card' : ''}" data-id="${t.id}">
            <div class="card-preview-box">
                <canvas class="card-thumb-canvas" data-id="${t.id}"></canvas>
                <div class="card-badges-row">
                    <span class="card-category-badge">${getCategoryLabel(t.category)}</span>
                    <span class="card-access-badge badge-${t.accessLevel.toLowerCase().replace(/[^a-z0-9]/g, '-')}">${t.accessLevel}</span>
                </div>
                ${isCustom ? `<span class="custom-badge-pill">✨ User Created</span>` : ''}
            </div>

            <div class="card-content">
                <div class="card-title-row">
                    <span class="card-icon">${esc(t.icon || '🏷️')}</span>
                    <h3 class="card-title">${esc(t.title)}</h3>
                </div>

                <p class="card-desc">${esc(t.description)}</p>

                <div class="card-meta-row">
                    <span class="meta-tag">📐 ${esc(String(t.layout.width))} × ${esc(String(t.layout.height))} ${esc(t.layout.unit)}</span>
                    <span class="meta-tag">🏷️ ${esc(String(t.schema.fields.length))} Dynamic Fields</span>
                </div>

                <div class="card-fields-chips">
                    ${t.schema.fields.slice(0, 4).map(f => `<span class="field-chip">{{${esc(f.name)}}}</span>`).join('')}
                    ${t.schema.fields.length > 4 ? `<span class="field-chip-more">+${esc(String(t.schema.fields.length - 4))} more</span>` : ''}
                </div>

                <div class="card-actions" style="grid-template-columns: ${canDesign ? '1fr 1fr' : '1fr'};">
                    ${canDesign ? `
                        <button class="btn btn-outline btn-sm btn-open-designer" data-id="${t.id}">
                            🎨 Edit in Designer
                        </button>
                    ` : ''}
                    <button class="btn btn-primary btn-sm btn-open-print" data-id="${t.id}">
                        🖨️ Batch Print (${t.sampleBatch?.length || 1} Sample)
                    </button>
                </div>

                ${isCustom ? `
                    <div style="margin-top: 8px; display: flex; justify-content: flex-end;">
                        <button class="btn-delete-custom-tpl" data-id="${t.id}" title="Delete this custom template">
                            🗑️ Delete Custom Template
                        </button>
                    </div>
                ` : ''}
            </div>
        </div>
        `;
    }

    private renderNoAccessState(): string {
        return `
        <div class="empty-template-access-state" style="grid-column: 1/-1;">
            <div class="empty-access-card">
                <div class="empty-access-icon">🔒</div>
                <h3 class="empty-access-title">Category Access Restricted</h3>
                <p class="empty-access-desc">
                    Your current role (<strong>${this.activeRole.roleName}</strong>) does not have access permissions for 
                    <strong>"${this.selectedCategory}"</strong>.
                </p>
                <div class="empty-access-actions">
                    <button class="btn btn-primary btn-sm btn-reset-category-filter">
                        View Permitted Categories
                    </button>
                </div>
            </div>
        </div>
        `;
    }

    private bindEvents() {
        // Create Template Button
        this.container.querySelector('#btn-open-create-template-modal')?.addEventListener('click', () => {
            this.openCreateTemplateModal();
        });

        // Manage Categories Button
        this.container.querySelector('#btn-open-manage-categories')?.addEventListener('click', () => {
            this.openManageCategoriesModal();
        });

        // Role Simulator dropdown
        const roleSelect = this.container.querySelector<HTMLSelectElement>('#select-simulate-role');
        roleSelect?.addEventListener('change', (e) => {
            const roleId = (e.target as HTMLSelectElement).value;
            this.setUserRole(roleId);
        });

        // Category Pills
        this.container.querySelectorAll<HTMLButtonElement>('.cat-pill').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.selectedCategory = (e.currentTarget as HTMLButtonElement).dataset.cat as any || 'All';
                this.render();
            });
        });

        // Search Input
        this.container.querySelector<HTMLInputElement>('#lib-search-input')?.addEventListener('input', (e) => {
            this.searchQuery = (e.target as HTMLInputElement).value;
            this.render();
        });

        this.container.querySelector('#btn-clear-template-search')?.addEventListener('click', () => {
            this.searchQuery = '';
            this.render();
        });

        // Reset Category Filter
        this.container.querySelector('.btn-reset-category-filter')?.addEventListener('click', () => {
            this.selectedCategory = 'All';
            this.render();
        });

        this.bindListActions();
    }

    private bindListActions() {
        // View a template (separate detail page)
        this.container.querySelectorAll<HTMLButtonElement>('.btn-view-template').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLButtonElement).dataset.id;
                const template = this.getAllTemplates().find(t => t.id === id);
                if (template) this.openViewPage(template);
            });
        });

        // Edit a template (open in the visual Designer)
        this.container.querySelectorAll<HTMLButtonElement>('.btn-edit-template').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLButtonElement).dataset.id;
                const template = this.getAllTemplates().find(t => t.id === id);
                if (template) this.onSelectForDesigner(template);
            });
        });

        // Batch print a template (from the View page)
        this.container.querySelectorAll<HTMLButtonElement>('.btn-open-print').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLButtonElement).dataset.id;
                const template = this.getAllTemplates().find(t => t.id === id);
                if (template) this.onSelectForPrint(template);
            });
        });

        this.container.querySelectorAll<HTMLButtonElement>('.btn-open-designer').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLButtonElement).dataset.id;
                const template = this.getAllTemplates().find(t => t.id === id);
                if (template) this.onSelectForDesigner(template);
            });
        });

        this.container.querySelectorAll<HTMLButtonElement>('.btn-delete-tpl').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLButtonElement).dataset.id;
                const tpl = this.customTemplates.find(c => c.id === id);
                if (id && tpl && confirm(`Are you sure you want to delete template "${tpl.title}"?`)) {
                    this.customTemplates = this.customTemplates.filter(c => c.id !== id);
                    this.saveCustomTemplates();
                    void supabaseService.deleteTemplate(id);
                    this.render();
                }
            });
        });
    }

    private renderCardThumbnails() {
        this.container.querySelectorAll<HTMLCanvasElement>('.card-thumb-canvas').forEach(async canvas => {
            const id = canvas.dataset.id;
            const template = this.getAllTemplates().find(t => t.id === id);
            if (template) {
                try {
                    await this.printer.renderToCanvas(template.layout, template.schema.sampleData || {}, canvas);
                } catch (e) {
                    console.error('Failed to render thumbnail for', id, e);
                }
            }
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // MANAGE CATEGORIES MODAL & WORKFLOW (create / rename / delete)
    // ──────────────────────────────────────────────────────────────────────────
    public openManageCategoriesModal() {
        const modalContainer = this.container.querySelector('#manage-categories-modal-container');
        if (!modalContainer) return;

        modalContainer.innerHTML = `
        <div class="studio-modal-backdrop">
            <div class="studio-modal-dialog" style="max-width: 720px;">
                <div class="modal-header">
                    <div>
                        <h3 class="modal-title">⚙️ Manage Template Categories</h3>
                        <p style="font-size: 0.75rem; color: var(--ink-muted); margin: 2px 0 0 0;">Create new categories, or rename / restyle existing ones. Changes apply everywhere categories are listed.</p>
                    </div>
                    <button class="btn btn-icon btn-close-cat-mgmt">✕</button>
                </div>

                <div class="modal-body-scroll" style="padding: 16px 24px;">
                    <div class="category-editor-head" style="display:flex; gap:8px; padding: 0 0 6px 0; font-size:0.6875rem; font-weight:600; color: var(--ink-muted); text-transform: uppercase; letter-spacing:0.04em;">
                        <span style="width:48px;">Icon</span>
                        <span style="flex:1;">Category Name *</span>
                        <span style="flex:1.6;">Description</span>
                        <span style="width:120px;">Actions</span>
                    </div>
                    <div id="category-list-editor"></div>

                    <div id="category-create-row" style="display:flex; gap:8px; margin-top:14px; align-items:center; border:1px dashed var(--line-strong); padding:12px; border-radius:10px;">
                        <input id="new-cat-icon" maxlength="4" placeholder="📂" title="Icon (emoji)" style="width:44px; text-align:center; border:1px solid var(--line); border-radius:8px; padding:8px; font-size:0.875rem; background:var(--surface); color:var(--ink);" />
                        <input id="new-cat-name" placeholder="New category name (e.g. Chemicals & Packaging)" style="flex:1; border:1px solid var(--line); border-radius:8px; padding:8px 12px; font-size:0.875rem; background:var(--surface); color:var(--ink);" />
                        <input id="new-cat-desc" placeholder="Description (optional)" style="flex:1.4; border:1px solid var(--line); border-radius:8px; padding:8px 12px; font-size:0.8125rem; background:var(--surface); color:var(--ink);" />
                        <button type="button" class="btn btn-primary btn-sm" id="btn-add-category">➕ Add</button>
                    </div>
                </div>

                <div class="modal-footer" style="display:flex; justify-content:flex-end;">
                    <button class="btn btn-primary btn-close-cat-mgmt">Done</button>
                </div>
            </div>
        </div>
        `;

        const listEl = modalContainer.querySelector('#category-list-editor') as HTMLElement;
        const close = () => { modalContainer.innerHTML = ''; this.render(); };
        modalContainer.querySelectorAll('.btn-close-cat-mgmt').forEach(b => b.addEventListener('click', close));

        const renderList = () => {
            const cats = getAllTemplateCategories().filter(c => c.id !== 'All');
            listEl.innerHTML = cats.map(def => {
                const isBuiltIn = TEMPLATE_CATEGORIES.some(c => c.id === def.id);
                const id = def.id;
                const escapeAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
                return `
                <div class="category-edit-row" data-id="${escapeAttr(id)}" style="display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid var(--line);">
                    <input class="cat-icon-input" value="${escapeAttr(def.icon)}" maxlength="4" title="Icon (emoji)" style="width:44px; text-align:center; border:1px solid var(--line); border-radius:8px; padding:6px 2px; background:var(--surface); color:var(--ink);" />
                    <input class="cat-label-input" value="${escapeAttr(def.label)}" placeholder="Category name" style="flex:1; border:1px solid var(--line); border-radius:8px; padding:8px 12px; background:var(--surface); color:var(--ink);" />
                    <input class="cat-desc-input" value="${escapeAttr(def.description)}" placeholder="Description" style="flex:1.6; border:1px solid var(--line); border-radius:8px; padding:8px 12px; background:var(--surface); color:var(--ink); font-size:0.8125rem;" />
                    <button class="btn btn-outline btn-xs btn-save-cat-row" data-id="${escapeAttr(id)}">Save</button>
                    ${isBuiltIn ? '' : `<button class="btn btn-danger-soft btn-xs btn-del-cat-row" data-id="${escapeAttr(id)}" title="Delete category">🗑️</button>`}
                </div>`;
            }).join('');
        };
        renderList();

        // Add new category
        modalContainer.querySelector('#btn-add-category')?.addEventListener('click', () => {
            const name = (modalContainer.querySelector('#new-cat-name') as HTMLInputElement).value;
            const icon = (modalContainer.querySelector('#new-cat-icon') as HTMLInputElement).value;
            const desc = (modalContainer.querySelector('#new-cat-desc') as HTMLInputElement).value;
            const def = addCustomCategory(name, icon);
            if (def) {
                if (desc.trim()) updateCategory(def.id, { description: desc.trim() });
                (modalContainer.querySelector('#new-cat-name') as HTMLInputElement).value = '';
                (modalContainer.querySelector('#new-cat-icon') as HTMLInputElement).value = '';
                (modalContainer.querySelector('#new-cat-desc') as HTMLInputElement).value = '';
                renderList();
            } else {
                alert('Enter a unique category name that is not already in use.');
            }
        });

        // Save (rename/restyle) an existing category
        listEl.querySelectorAll<HTMLButtonElement>('.btn-save-cat-row').forEach(btn => {
            btn.addEventListener('click', () => {
                const row = btn.closest('.category-edit-row') as HTMLElement;
                if (!row) return;
                const id = row.dataset.id!;
                const label = (row.querySelector('.cat-label-input') as HTMLInputElement).value ?? '';
                const icon = (row.querySelector('.cat-icon-input') as HTMLInputElement).value ?? '';
                const description = (row.querySelector('.cat-desc-input') as HTMLInputElement).value ?? '';
                if (!label.trim()) { alert('Category name cannot be empty.'); return; }
                updateCategory(id, { label, icon, description });
                renderList();
            });
        });

        // Delete a custom category
        listEl.querySelectorAll<HTMLButtonElement>('.btn-del-cat-row').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id!;
                const label = getCategoryLabel(id);
                if (confirm(`Delete the category "${label}"? Existing templates keep their category, but it will no longer be listed.`)) {
                    deleteCategory(id);
                    renderList();
                }
            });
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ──────────────────────────────────────────────────────────────────────────
    // TEMPLATE VIEW (separate read-only detail page)
    // ──────────────────────────────────────────────────────────────────────────
    private openViewPage(template: PrebuiltTemplate) {
        this.viewingTemplate = template;
        this.lvMode = 'view';
        this.render();
    }

    private goBackToList() {
        this.lvMode = 'list';
        this.viewingTemplate = null;
        this.render();
    }

    private renderViewPage() {
        const t = this.viewingTemplate!;
        const canDesign = this.activeRole.roleId === 'admin' || this.activeRole.roleId.startsWith('plant-');
        const fields = t.schema.fields.map(f => `<li><code>{{${esc(f.name)}}}</code> — ${esc(f.label)}</li>`).join('');
        const size = `${esc(String(t.layout.width))} × ${esc(String(t.layout.height))} ${esc(t.layout.unit)}`;

        this.container.innerHTML = `
        <div class="template-library-container template-page">
            <div class="template-page-header">
                <button class="btn btn-outline btn-sm" data-action="back-to-list">← Back to Templates</button>
                <div>
                    <h3 class="library-main-title">${esc(t.icon || '🏷️')} ${esc(t.title)}</h3>
                    <p style="font-size: 0.8125rem; color: var(--ink-muted); margin: 4px 0 0 0;">${esc(t.description)}</p>
                </div>
            </div>

            <div class="template-view-grid">
                <div class="view-preview-panel">
                    <div class="view-preview-box"><canvas id="view-thumb-canvas" class="view-thumb-canvas"></canvas></div>
                    <div class="view-meta-row">
                        <span class="template-cat-pill">${getCategoryLabel(t.category)}</span>
                        <span class="meta-tag">📐 ${size}</span>
                        <span class="meta-tag">🏷️ ${t.schema.fields.length} Dynamic Fields</span>
                    </div>
                </div>

                <div class="view-details-panel">
                    <div class="view-details-head">
                        <h4 class="view-sub-title">Template Information</h4>
                        <span class="meta-tag access-badge badge-${t.accessLevel.toLowerCase().replace(/[^a-z0-9]/g, '-')}">${t.accessLevel}</span>
                    </div>

                    <div class="view-detail-line"><span>Label Size</span><strong>${size}</strong></div>
                    <div class="view-detail-line"><span>Sheet Preset</span><strong>${t.defaultSheetPreset || '—'}</strong></div>
                    <div class="view-detail-line"><span>Schema Key</span><strong>${t.schemaKey}</strong></div>
                    <div class="view-detail-line"><span>Category Key</span><strong>${t.categoryKey}</strong></div>

                    <h4 class="view-sub-title" style="margin-top: 18px;">Dynamic Fields ({{variables}})</h4>
                    <ul class="view-fields-list">${fields || '<li>No dynamic fields</li>'}</ul>

                    <div class="view-actions">
                        ${canDesign ? `<button class="btn btn-primary" id="btn-view-design">🎨 Edit in Designer</button>` : ''}
                        <button class="btn btn-secondary" id="btn-view-print">🖨️ Batch Print</button>
                    </div>
                </div>
            </div>
        </div>`;

        this.container.querySelectorAll('[data-action="back-to-list"]').forEach(b => b.addEventListener('click', () => this.goBackToList()));

        const canvas = this.container.querySelector<HTMLCanvasElement>('#view-thumb-canvas');
        if (canvas) {
            void this.printer.renderToCanvas(t.layout, t.schema.sampleData || {}, canvas).catch(() => {});
        }

        this.container.querySelector('#btn-view-design')?.addEventListener('click', () => this.onSelectForDesigner(t));
        this.container.querySelector('#btn-view-print')?.addEventListener('click', () => this.onSelectForPrint(t));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // CREATE TEMPLATE MODAL & WORKFLOW
    // ──────────────────────────────────────────────────────────────────────────
    public openCreateTemplateModal() {
        const container = this.container;
        this.lvMode = 'list';
        this.viewingTemplate = null;

        const categories = getAssignableTemplateCategories();

        container.innerHTML = `
        <div class="template-library-container template-page">
            <div class="template-page-header">
                <button class="btn btn-outline btn-sm" data-action="back-to-list">← Back to Templates</button>
                <div>
                    <h3 class="library-main-title">✨ Create New Layout Template</h3>
                    <p style="font-size: 0.75rem; color: var(--ink-muted); margin: 2px 0 0 0;">Define label dimensions, category permissions, dynamic schema, and starter elements.</p>
                </div>
            </div>

            <div class="template-create-page-shell">
                <div class="modal-body-scroll" style="padding: 0;">
                    <form id="form-create-template-master" class="modal-form-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                        <!-- ROW 1: Template Title & Icon -->
                        <div class="form-group col-span-2" style="grid-column: 1 / -1;">
                            <label class="form-field-label">Template Title *</label>
                            <input type="text" name="title" class="form-control-input" required placeholder="e.g. KSPL Outer Carton Master Barcode Tag" />
                        </div>

                        <!-- ROW 2: Category & Access Level -->
                        <div class="form-group">
                            <label class="form-field-label">Category *</label>
                            <select name="category" id="create-tpl-category" class="form-control-select" required>
                                ${categories.map(c => `
                                    <option value="${c.id}">${c.icon} ${c.label}</option>
                                `).join('')}
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="form-field-label">Access Level Scope *</label>
                            <select name="accessLevel" class="form-control-select" required>
                                <option value="Plant Restricted" selected>Plant Restricted (KSPL / KGPL / KBPL)</option>
                                <option value="Warehouse & Logistics">Warehouse & Logistics</option>
                                <option value="Retail Only">Retail Only</option>
                                <option value="Admin & Security">Admin & Security</option>
                                <option value="Public">Public (All Roles)</option>
                            </select>
                        </div>

                        <!-- ROW 3a: Printer Type & Label Media (paper/roll) -->
                        <div class="form-group col-span-2" style="grid-column: 1 / -1;">
                            <label class="form-field-label">Printer &amp; Label Media (auto-fills size)</label>
                            <select id="create-tpl-printer" class="form-control-select">
                                ${PRINTER_TYPES.map(p => `<option value="${p.id}">${p.vendor} — ${p.name} (${p.dpiLabel})</option>`).join('')}
                            </select>
                            <select id="create-tpl-media" class="form-control-select" style="margin-top:6px;">
                                ${getMediaForPrinter('zebra-desktop').map(m => `
                                    <option value="${m.id}">${m.name} · ${m.mediaType} — ${formatLabelSize(m.labelWidthMm, m.labelHeightMm)}</option>
                                `).join('')}
                            </select>
                            <small class="form-field-help" style="font-size:0.72rem;color:var(--ink-muted);display:block;margin-top:4px;" data-el="create-media-size"></small>
                        </div>

                        <!-- ROW 3: Dimension Presets -->
                        <div class="form-group col-span-2" style="grid-column: 1 / -1;">
                            <label class="form-field-label">Label Size Preset</label>
                            <select id="select-dimension-preset" class="form-control-select">
                                <option value="70x38" selected>70 × 38 mm — Product Box Serial Label (Standard)</option>
                                <option value="100x60">100 × 60 mm — Sanitaryware Master Carton & Pallet Tag</option>
                                <option value="70x36">70 × 36 mm — Retail Shelf Price Tag</option>
                                <option value="101.6x152.4">101.6 × 152.4 mm — 4" × 6" Thermal Courier Parcel Label</option>
                                <option value="100x65">100 × 65 mm — Warehouse Bin & Rack Inventory Tag</option>
                                <option value="90x55">90 × 55 mm — Corporate Employee ID Badge</option>
                                <option value="custom">Custom Dimensions</option>
                            </select>
                        </div>

                        <!-- ROW 4: Width, Height & Unit -->
                        <div class="form-group">
                            <label class="form-field-label">Width (mm) *</label>
                            <input type="number" step="0.1" min="10" max="300" name="width" id="create-tpl-width" class="form-control-input" value="70" required />
                        </div>

                        <div class="form-group">
                            <label class="form-field-label">Height (mm) *</label>
                            <input type="number" step="0.1" min="10" max="300" name="height" id="create-tpl-height" class="form-control-input" value="38" required />
                        </div>

                        <!-- ROW 5: Target Entity / Schema & Sheet Preset -->
                        <div class="form-group">
                            <label class="form-field-label">Target Data Entity</label>
                            <select name="targetEntity" id="create-tpl-target-entity" class="form-control-select">
                                <option value="product" selected>Product Serial (SKU, Name, Plant, Color, Warranty, DP, MRP, S/N)</option>
                                <option value="sanitaryware">Sanitaryware Unit (Code, Name, Plant, Grade, Batch, MRP)</option>
                                <option value="shipping">Logistics Parcel (Tracking #, Recipient, Address, Hub)</option>
                                <option value="warehouse">Warehouse Bin (Location Code, Part #, Zone, Min Qty)</option>
                                <option value="asset">IT Asset (Asset Tag, Serial, Model, Owner, Dept)</option>
                                <option value="employee">Employee Badge (Name, Emp ID, Dept, Designation, Blood Group)</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="form-field-label">Print Sheet Preset</label>
                            <select name="sheetPreset" class="form-control-select">
                                <option value="a4-24up" selected>A4 — 24 Labels per Sheet (3 × 8 grid)</option>
                                <option value="a4-8up">A4 — 8 Labels per Sheet (2 × 4 grid)</option>
                                <option value="a4-10up">A4 — 10 Badges per Sheet (2 × 5 grid)</option>
                                <option value="thermal-4x6">Thermal Roll (4" × 6" Single Feed)</option>
                                <option value="custom">Custom Roll / Sheet Feed</option>
                            </select>
                        </div>

                        <!-- ROW 6: Description -->
                        <div class="form-group col-span-2" style="grid-column: 1 / -1;">
                            <label class="form-field-label">Template Description</label>
                            <textarea name="description" class="form-control-textarea" rows="2" placeholder="Brief description of application, factory line, and packaging specifications..."></textarea>
                        </div>

                        <!-- ROW 7: Starter Layout Style -->
                        <div class="form-group col-span-2" style="grid-column: 1 / -1;">
                            <label class="form-field-label">Starter Elements Layout</label>
                            <select name="starterStyle" id="create-tpl-starter-style" class="form-control-select">
                                <option value="standard" selected>Standard Industrial: Header Banner + QR Code + Barcode + Title + S/N + Price</option>
                                <option value="qr-dense">High Density QR: Large Centered QR Code + Code + Plant Code + Specs</option>
                                <option value="barcode-heavy">Barcode Centered: Large 1D Barcode + SKU + Item Description</option>
                                <option value="blank">Blank Canvas (Design from scratch in Visual Designer)</option>
                            </select>
                        </div>
                    </form>
                </div>

                <div class="template-page-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px;">
                    <button class="btn btn-outline" data-action="back-to-list">Cancel</button>

                    <div style="display: flex; gap: 10px;">
                        <button type="button" class="btn btn-outline" id="btn-save-tpl-library-only">
                            💾 Save to Library
                        </button>
                        <button type="button" class="btn btn-primary" id="btn-create-and-open-designer" style="background: #7c3aed; border-color: #7c3aed;">
                            🎨 Create &amp; Open Designer
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `;

        const closeModal = () => { this.goBackToList(); };
        container.querySelectorAll('.btn-close-modal, [data-action="back-to-list"]').forEach(b => b.addEventListener('click', closeModal));

        // Preset Dimension change handler
        const presetSelect = container.querySelector<HTMLSelectElement>('#select-dimension-preset');
        const widthInput = container.querySelector<HTMLInputElement>('#create-tpl-width');
        const heightInput = container.querySelector<HTMLInputElement>('#create-tpl-height');

        presetSelect?.addEventListener('change', () => {
            const val = presetSelect.value;
            if (val === '70x38' && widthInput && heightInput) {
                widthInput.value = '70'; heightInput.value = '38';
            } else if (val === '100x60' && widthInput && heightInput) {
                widthInput.value = '100'; heightInput.value = '60';
            } else if (val === '70x36' && widthInput && heightInput) {
                widthInput.value = '70'; heightInput.value = '36';
            } else if (val === '101.6x152.4' && widthInput && heightInput) {
                widthInput.value = '101.6'; heightInput.value = '152.4';
            } else if (val === '100x65' && widthInput && heightInput) {
                widthInput.value = '100'; heightInput.value = '65';
            } else if (val === '90x55' && widthInput && heightInput) {
                widthInput.value = '90'; heightInput.value = '55';
            }
        });

        // Printer & Label Media handlers — auto-fill width/height from chosen media
        const printerSel = container.querySelector<HTMLSelectElement>('#create-tpl-printer');
        const mediaSel = container.querySelector<HTMLSelectElement>('#create-tpl-media');
        const mediaSizeEl = container.querySelector<HTMLElement>('[data-el="create-media-size"]');

        const refreshMediaOptions = () => {
            if (!printerSel || !mediaSel) return;
            const pid = printerSel.value as PrinterId;
            const opts = getMediaForPrinter(pid);
            mediaSel.innerHTML = opts.map(m => {
                const sel = m.id === mediaSel.value ? 'selected' : '';
                return `<option value="${m.id}" ${sel}>${m.name} · ${m.mediaType} — ${formatLabelSize(m.labelWidthMm, m.labelHeightMm)}</option>`;
            }).join('');
            applySelectedMedia();
        };

        const applySelectedMedia = () => {
            if (!mediaSel || !widthInput || !heightInput) return;
            const media = getMediaById(mediaSel.value);
            if (!media) return;
            widthInput.value = String(media.labelWidthMm);
            heightInput.value = String(media.labelHeightMm);
            if (mediaSizeEl) {
                mediaSizeEl.textContent = `Media: ${media.name} · ${media.mediaType} — Label size ${formatLabelSize(media.labelWidthMm, media.labelHeightMm)}${media.rollWidthMm ? ` (roll ${media.rollWidthMm} mm)` : ''}`;
            }
        };

        printerSel?.addEventListener('change', refreshMediaOptions);
        mediaSel?.addEventListener('change', applySelectedMedia);
        refreshMediaOptions();

        // Builder function to create PrebuiltTemplate object
        const buildTemplateFromForm = (): PrebuiltTemplate | null => {
            const form = container.querySelector('#form-create-template-master') as HTMLFormElement;
            if (!form.checkValidity()) {
                form.reportValidity();
                return null;
            }

            const formData = new FormData(form);
            const title = (formData.get('title') as string).trim();
            const category = formData.get('category') as TemplateCategoryType;
            const accessLevel = formData.get('accessLevel') as any;
            const width = parseFloat(formData.get('width') as string) || 70;
            const height = parseFloat(formData.get('height') as string) || 38;
            const targetEntity = (formData.get('targetEntity') as string) || 'product';
            const sheetPreset = (formData.get('sheetPreset') as string) || 'a4-24up';
            const description = (formData.get('description') as string).trim() || `${title} (${width}x${height}mm) layout template.`;
            const starterStyle = formData.get('starterStyle') as string;

            const id = `custom-tpl-${Date.now()}`;
            const categoryDef = getAllTemplateCategories().find(c => c.id === category);

            // Generate Schema & Sample Batch based on target entity
            const { schema, sampleBatch } = this.generateSchemaForEntity(targetEntity, title);

            // Generate Layout Elements based on Starter Style
            const elements = this.generateStarterElements(starterStyle, width, height, targetEntity);

            const layout: StickerLayout = {
                id,
                name: title,
                targetEntity,
                width,
                height,
                unit: 'mm',
                backgroundColor: '#ffffff',
                elements
            };

            return {
                id,
                title,
                description,
                category,
                categoryKey: categoryDef?.permissionKey.replace('templates:', '') || 'custom',
                accessScope: categoryDef?.defaultRoles || ['admin'],
                accessLevel,
                icon: categoryDef?.icon || '🏷️',
                schemaKey: targetEntity,
                schema,
                layout,
                sampleBatch,
                defaultSheetPreset: sheetPreset
            };
        };

        // Save to Library Only
        container.querySelector('#btn-save-tpl-library-only')?.addEventListener('click', () => {
            const newTpl = buildTemplateFromForm();
            if (newTpl) {
                this.customTemplates.unshift(newTpl);
                this.saveCustomTemplates();
                void supabaseService.saveTemplate({ ...newTpl });
                closeModal();
                this.render();
                alert(`✅ Template "${newTpl.title}" has been created and saved to the Template Library!`);
            }
        });

        // Create & Open Designer Immediately
        container.querySelector('#btn-create-and-open-designer')?.addEventListener('click', () => {
            const newTpl = buildTemplateFromForm();
            if (newTpl) {
                this.customTemplates.unshift(newTpl);
                this.saveCustomTemplates();
                void supabaseService.saveTemplate({ ...newTpl });
                closeModal();
                this.onSelectForDesigner(newTpl);
            }
        });
    }

    private generateSchemaForEntity(entity: string, title: string): { schema: EntitySchema; sampleBatch: Record<string, any>[] } {
        if (entity === 'sanitaryware') {
            return {
                schema: {
                    label: title,
                    fields: [
                        { name: 'productCode', label: 'Item Code' },
                        { name: 'productName', label: 'Product Description' },
                        { name: 'plant', label: 'Plant Unit' },
                        { name: 'grade', label: 'Quality Grade' },
                        { name: 'batchNo', label: 'Batch No' },
                        { name: 'color', label: 'Finish / Color' },
                        { name: 'mrp', label: 'MRP (INR)' }
                    ],
                    sampleData: {
                        productCode: 'CW8820-WHT',
                        productName: 'Wall Hung Water Closet Rimless Soft Close',
                        plant: 'KBPL',
                        grade: 'PREMIUM GRADE A',
                        batchNo: 'BAT-2026-08',
                        color: 'Alpine White (W)',
                        mrp: '₹14,200.00'
                    }
                },
                sampleBatch: [
                    { productCode: 'CW8820-WHT', productName: 'Wall Hung Water Closet Rimless Soft Close', plant: 'KBPL', grade: 'PREMIUM GRADE A', batchNo: 'BAT-2026-08', color: 'Alpine White (W)', mrp: '₹14,200.00' },
                    { productCode: 'WB3002-MAT', productName: 'Table Top Ceramic Washbasin Rectangular', plant: 'KSPL', grade: 'PREMIUM GRADE A', batchNo: 'BAT-2026-07', color: 'Matte Black (MB)', mrp: '₹8,900.00' }
                ]
            };
        }

        if (entity === 'shipping') {
            return {
                schema: {
                    label: title,
                    fields: [
                        { name: 'trackingNumber', label: 'Tracking #' },
                        { name: 'recipientName', label: 'Recipient Name' },
                        { name: 'recipientAddress', label: 'Address' },
                        { name: 'recipientCity', label: 'City/Zip' },
                        { name: 'weight', label: 'Weight' },
                        { name: 'hubCode', label: 'Sort Hub' }
                    ],
                    sampleData: {
                        trackingNumber: 'TRK-984210984IN',
                        recipientName: 'Vikas Kumar',
                        recipientAddress: 'Plot 44, Okhla Phase III',
                        recipientCity: 'New Delhi, DL 110020',
                        weight: '4.85 kg',
                        hubCode: 'DEL-04-A'
                    }
                },
                sampleBatch: [
                    { trackingNumber: 'TRK-984210984IN', recipientName: 'Vikas Kumar', recipientAddress: 'Plot 44, Okhla Phase III', recipientCity: 'New Delhi, DL 110020', weight: '4.85 kg', hubCode: 'DEL-04-A' }
                ]
            };
        }

        // Default: Product Serial Unit
        return {
            schema: {
                label: title,
                fields: [
                    { name: 'sku', label: 'Product Code' },
                    { name: 'title', label: 'Product Name' },
                    { name: 'plant', label: 'Plant (KSPL/KGPL/KBPL)' },
                    { name: 'color', label: 'Color / Finish' },
                    { name: 'warranty', label: 'Warranty' },
                    { name: 'serialNumber', label: 'Serial Number' },
                    { name: 'dp', label: 'DP Price (₹)' },
                    { name: 'mrp', label: 'MRP Price (₹)' }
                ],
                sampleData: {
                    sku: 'KA570027-RG',
                    title: 'CeilingShower400mmx400mm(BrassRG)',
                    plant: 'KSPL',
                    color: 'RG',
                    warranty: '10 Years',
                    serialNumber: 'SHW-RG-01001',
                    dp: '₹21,250.00',
                    mrp: '₹21,250.00'
                }
            },
            sampleBatch: [
                { sku: 'KA570027-RG', title: 'CeilingShower400mmx400mm(BrassRG)', plant: 'KSPL', color: 'RG', warranty: '10 Years', serialNumber: 'SHW-RG-01001', dp: '₹21,250.00', mrp: '₹21,250.00' },
                { sku: 'AU/KIT', title: 'AURUM TOOL KIT', plant: 'KGPL', color: 'CP', warranty: '2 Years', serialNumber: 'KIT-01001', dp: '₹250.00', mrp: '₹500.00' }
            ]
        };
    }

    private generateStarterElements(style: string, width: number, height: number, entity: string): StickerElement[] {
        if (style === 'blank') return [];

        if (style === 'qr-dense') {
            return [
                {
                    id: 'header-brand',
                    type: 'text',
                    x: 2,
                    y: 2,
                    w: width - 4,
                    h: 6,
                    content: 'KAJARIA • {{plant}}',
                    style: { textAlign: 'center', fontWeight: 'bold', fontSize: 8, color: '#6d28d9' }
                },
                {
                    id: 'qr-center',
                    type: 'qr',
                    x: (width - 24) / 2,
                    y: 10,
                    w: 24,
                    h: 24,
                    content: 'https://kajariabathware.in/verify?sn={{serialNumber}}&sku={{sku}}'
                },
                {
                    id: 'sku-footer',
                    type: 'text',
                    x: 2,
                    y: height - 8,
                    w: width - 4,
                    h: 6,
                    content: 'CODE: {{sku}} | S/N: {{serialNumber}}',
                    style: { textAlign: 'center', fontWeight: 'bold', fontSize: 7, color: '#0f172a' }
                }
            ];
        }

        // Standard Industrial Starter Elements
        return [
            {
                id: 'header-banner',
                type: 'text',
                x: 0,
                y: 0,
                w: width,
                h: 7,
                content: 'KAJARIA ENTERPRISE • PLANT {{plant}}',
                style: { textAlign: 'center', fontWeight: 'bold', fontSize: 7.5, color: '#ffffff', backgroundColor: '#6d28d9' }
            },
            {
                id: 'code-tag',
                type: 'text',
                x: 3,
                y: 9,
                w: width - 26,
                h: 6,
                content: 'CODE: {{sku}}',
                style: { textAlign: 'left', fontWeight: 'bold', fontSize: 8.5, color: '#0f172a' }
            },
            {
                id: 'title-tag',
                type: 'text',
                x: 3,
                y: 15,
                w: width - 26,
                h: 6,
                content: '{{title}}',
                style: { textAlign: 'left', fontSize: 6.5, color: '#475569' }
            },
            {
                id: 'specs-tag',
                type: 'text',
                x: 3,
                y: 21,
                w: width - 26,
                h: 5,
                content: 'Color: {{color}} | Warranty: {{warranty}}',
                style: { textAlign: 'left', fontSize: 6, color: '#64748b' }
            },
            {
                id: 'sn-tag',
                type: 'text',
                x: 3,
                y: 26,
                w: width - 26,
                h: 5,
                content: 'S/N: {{serialNumber}}',
                style: { textAlign: 'left', fontWeight: 'bold', fontSize: 7, color: '#0284c7' }
            },
            {
                id: 'qr-tag',
                type: 'qr',
                x: width - 22,
                y: 9,
                w: 19,
                h: 19,
                content: 'https://kajariabathware.in/verify?sn={{serialNumber}}&sku={{sku}}'
            },
            {
                id: 'mrp-tag',
                type: 'text',
                x: width - 24,
                y: 29,
                w: 22,
                h: 6,
                content: 'MRP {{mrp}}',
                style: { textAlign: 'center', fontWeight: 'bold', fontSize: 7.5, color: '#dc2626' }
            }
        ];
    }
}
