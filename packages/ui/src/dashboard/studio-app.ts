import { QRLayoutDesigner } from '../index';
import { StickerLayout } from 'qrlayout-core';
import type { EntitySchema } from '../types';
import { PREBUILT_TEMPLATES, PrebuiltTemplate } from './templates-data';
import { QRPrintDashboard } from './print-dashboard';
import { TemplateLibraryView } from './template-library';
import { ProductManagerView } from './product-manager';
import { SerialManagerView } from './serial-manager';
import { BatchManagerView } from './batch-manager';
import { EmployeeManagerView } from './employee-manager';
import { OverviewDashboardView } from './overview-dashboard';
import { UserManagerView } from './user-manager';
import { MasterDataManagerView } from './master-data-manager';
import { mergeMasterDataFromDb } from './master-data';
import { hydrateSerialLogicRulesFromDb, hydrateBatchLogicRulesFromDb } from './serial-batch-logic';
import { hydrateRolePermissionsFromDb, hasPageAccess, hydrateRolesFromDb } from './permissions';
import type { PageKey } from './permissions';
import { AccessControlView } from './access-control';
import { AuditLogView, PrintersView, PrintJobsView } from './settings-tools';
import { AnalyticsView } from './analytics';
import { GenerateView } from './generate-view';
import { BrandingManagerView } from './branding-manager';
import { LANGS, getLang, setLang, applyTranslations } from './i18n';
import { loadCompanyProfile, logoBadgeHtml, CompanyProfile } from './branding';
import { AuthView } from './auth-view';
import { supabaseService, UserProfile, UserRole } from '../supabase';

export interface StudioAppOptions {
    mountElement: HTMLElement;
    initialLayout?: StickerLayout;
    entitySchemas?: Record<string, EntitySchema>;
    initialMode?: StudioAppMode;
}

export type StudioAppMode = 'dashboard' | 'analytics' | 'designer' | 'generate' | 'print' | 'library' | 'products' | 'serials' | 'batches' | 'employees' | 'settings' | 'users';

export class QRStudioApp {
    private mountElement: HTMLElement;
    private activeMode: StudioAppMode = 'dashboard';
    private currentLayout: StickerLayout;
    private entitySchemas: Record<string, EntitySchema>;
    private isSidebarCollapsed = false;
    private currentUser: UserProfile | null = null;

    private overviewDashboardInstance: OverviewDashboardView | null = null;
    private designerInstance: QRLayoutDesigner | null = null;
    private printDashboardInstance: QRPrintDashboard | null = null;
    private libraryInstance: TemplateLibraryView | null = null;
    private productManagerInstance: ProductManagerView | null = null;
    private serialManagerInstance: SerialManagerView | null = null;
    private batchManagerInstance: BatchManagerView | null = null;
    private employeeManagerInstance: EmployeeManagerView | null = null;
    private userManagerInstance: UserManagerView | null = null;

    private dashboardContainer!: HTMLDivElement;
    private analyticsContainer!: HTMLDivElement;
    private generateContainer!: HTMLDivElement;
    private designerContainer!: HTMLDivElement;
    private printContainer!: HTMLDivElement;
    private libraryContainer!: HTMLDivElement;
    private productsContainer!: HTMLDivElement;
    private serialsContainer!: HTMLDivElement;
    private batchesContainer!: HTMLDivElement;
    private employeesContainer!: HTMLDivElement;
    private settingsContainer!: HTMLDivElement;
    private usersContainer!: HTMLDivElement;
    private isDarkMode = false;
    private editingTemplateId: string | null = null;

    constructor(options: StudioAppOptions) {
        this.mountElement = options.mountElement;
        this.entitySchemas = options.entitySchemas || this.buildSchemasFromPresets();
        this.currentLayout = options.initialLayout || PREBUILT_TEMPLATES[0].layout;
        this.activeMode = options.initialMode || 'dashboard';

        // Check authentication state
        this.currentUser = supabaseService.getCurrentUser();

        if (!this.currentUser) {
            this.renderAuthScreen();
        } else {
            this.initDOM();
        }
    }

    private renderAuthScreen() {
        this.mountElement.innerHTML = '<div id="auth-root-container" style="width: 100%; height: 100vh;"></div>';
        const container = this.mountElement.querySelector('#auth-root-container') as HTMLElement;
        new AuthView({
            container,
            onLoginSuccess: (profile) => {
                this.currentUser = profile;
                this.initDOM();
            }
        });
    }

    private buildSchemasFromPresets(): Record<string, EntitySchema> {
        const map: Record<string, EntitySchema> = {};
        PREBUILT_TEMPLATES.forEach(t => {
            map[t.schemaKey] = t.schema;
        });
        return map;
    }

    private get userRole(): UserRole {
        return this.currentUser?.role || 'user';
    }

    /** Whether the current user may access a page (admins always can). */
    private canAccess(page: PageKey): boolean {
        return hasPageAccess(this.userRole, page);
    }

    private static readonly PAGE_BY_MODE: Record<string, PageKey> = {
        dashboard: 'dashboard', analytics: 'dashboard', generate: 'serials', designer: 'designer', print: 'print', library: 'templates',
        products: 'products', serials: 'serials', batches: 'batches', employees: 'employees',
        users: 'users', settings: 'settings'
    };

    /** Hide/show sidebar nav items (and empty groups) based on role permissions. */
    private applyNavPermissions(): void {
        if (!this.mountElement) return;
        const map = QRStudioApp.PAGE_BY_MODE;
        this.mountElement.querySelectorAll<HTMLElement>('.sidebar-nav-item').forEach(item => {
            const page = map[item.dataset.mode as string];
            const allowed = page ? this.canAccess(page) : true;
            item.style.display = allowed ? '' : 'none';
        });
        // Hide entire nav groups that have no visible items
        this.mountElement.querySelectorAll<HTMLElement>('.sidebar-nav-group').forEach(group => {
            const visible = Array.from(group.querySelectorAll<HTMLElement>('.sidebar-nav-item'))
                .some(i => i.style.display !== 'none');
            group.style.display = visible ? '' : 'none';
        });
        // If the currently-active mode is no longer allowed, fall back to Home
        const cur = this.activeMode;
        const page = map[cur];
        if (page && !this.canAccess(page)) {
            this.switchMode('dashboard');
        }
    }

    private get allowedCategories(): string[] {
        return this.currentUser?.allowedTemplateCategories || ['All'];
    }

    private initDOM() {
        const role = this.userRole;
        const isAdmin = role === 'admin';
        const isDesigner = role === 'designer' || isAdmin;
        const isOperatorOnly = role === 'user';

        let roleBadgeHtml = '<span class="nav-item-badge badge-emerald">Operator</span>';
        if (isAdmin) {
            roleBadgeHtml = '<span class="nav-item-badge badge-indigo">Admin</span>';
        } else if (isDesigner) {
            roleBadgeHtml = '<span class="nav-item-badge badge-cyan">Designer</span>';
        }

        const userInitials = this.currentUser?.fullName ? this.currentUser.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'U';
        const brand = loadCompanyProfile();
        const brandTitle = brand.brandName || 'QR Studio';
        const brandSub = brand.companyName || '';

        this.mountElement.innerHTML = `
        <div class="studio-app-root sidebar-layout-active">
            <!-- ══════════════════════════════════════════════════════════ -->
            <!-- MODERN EXPANDABLE SIDEBAR NAVIGATION SYSTEM -->
            <!-- ══════════════════════════════════════════════════════════ -->
            <aside class="studio-app-sidebar" id="app-sidebar">
                <!-- SIDEBAR BRAND -->
                <div class="sidebar-brand-header">
                    <div class="sidebar-brand-left">
                        <div class="studio-logo-badge">
                            ${brand.logoDataUrl ? logoBadgeHtml(brand.logoDataUrl) : `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg>`}
                        </div>
                        <div class="brand-text sidebar-brand-text">
                            <span class="brand-title">${brandTitle}</span>
                            <span class="brand-subtitle">${brandSub}</span>
                        </div>
                    </div>
                    <button class="btn-sidebar-toggle" id="btn-sidebar-toggle" title="Collapse / Expand Sidebar">
                        <svg class="icon-collapse-left" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
                        <svg class="icon-collapse-right" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none;"><path d="m9 18 6-6-6-6"/></svg>
                    </button>
                </div>

                <!-- SIDEBAR NAVIGATION MENU (ORGANIZED IN EXPANDABLE SECTIONS) -->
                <div class="sidebar-nav-scroll">
                    
                    <!-- GROUP 1: OVERVIEW & DASHBOARD -->
                    <div class="sidebar-nav-group">
                        <div class="nav-group-label">Overview</div>

                        <button class="sidebar-nav-item ${this.activeMode === 'dashboard' ? 'active' : ''}" data-mode="dashboard" title="Dashboard">
                            <span class="nav-item-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                            </span>
                            <span class="nav-item-label" data-i18n="nav.home">Home</span>
                        </button>

                        <button class="sidebar-nav-item ${this.activeMode === 'analytics' ? 'active' : ''}" data-mode="analytics" title="Analytics">
                            <span class="nav-item-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 16v-6"/><path d="M12 16V8"/><path d="M17 16v-3"/></svg>
                            </span>
                            <span class="nav-item-label" data-i18n="nav.analytics">Analytics</span>
                        </button>
                    </div>

                    <!-- GROUP 2: CORE STUDIO APPS -->
                    <div class="sidebar-nav-group">
                        <div class="nav-group-label">Studio</div>

                        ${this.canAccess('designer') ? `
                            <button class="sidebar-nav-item ${this.activeMode === 'designer' ? 'active' : ''}" data-mode="designer" title="Visual Label Designer">
                                <span class="nav-item-icon">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                </span>
                                <span class="nav-item-label" data-i18n="nav.designer">Designer</span>
                            </button>
                        ` : ''}

                        ${this.canAccess('serials') || this.canAccess('batches') ? `
                        <button class="sidebar-nav-item ${this.activeMode === 'generate' ? 'active' : ''}" data-mode="generate" title="Generate Serial & Batch Numbers">
                            <span class="nav-item-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                            </span>
                            <span class="nav-item-label">Generate</span>
                        </button>
                        ` : ''}

                        <button class="sidebar-nav-item ${this.activeMode === 'print' ? 'active' : ''}" data-mode="print" title="Batch Print Hub">
                            <span class="nav-item-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                            </span>
                            <span class="nav-item-label" data-i18n="nav.print">Print</span>
                        </button>

                        <button class="sidebar-nav-item ${this.activeMode === 'library' ? 'active' : ''}" data-mode="library" title="Template Library">
                            <span class="nav-item-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>
                            </span>
                            <span class="nav-item-label" data-i18n="nav.templates">Templates</span>
                            ${isOperatorOnly ? '<span class="nav-item-badge badge-neutral">Assigned</span>' : ''}
                        </button>
                    </div>

                    <!-- GROUP 3: MASTER DATABASE & TRACKING -->
                    <div class="sidebar-nav-group">
                        <div class="nav-group-label">Records</div>

                        <button class="sidebar-nav-item ${this.activeMode === 'products' ? 'active' : ''}" data-mode="products" title="Products Catalog">
                            <span class="nav-item-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                            </span>
                            <span class="nav-item-label" data-i18n="nav.products">Products</span>
                        </button>

                        <button class="sidebar-nav-item ${this.activeMode === 'serials' ? 'active' : ''}" data-mode="serials" title="Serial Numbers Management">
                            <span class="nav-item-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/></svg>
                            </span>
                            <span class="nav-item-label" data-i18n="nav.serials">Serial Numbers</span>
                        </button>

                        <button class="sidebar-nav-item ${this.activeMode === 'batches' ? 'active' : ''}" data-mode="batches" title="Batch Numbers &amp; Lots">
                            <span class="nav-item-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="8" height="8" x="3" y="3" rx="2"/><path d="m7 11 4-4-4-4"/><rect width="8" height="8" x="13" y="13" rx="2"/><path d="m17 21 4-4-4-4"/></svg>
                            </span>
                            <span class="nav-item-label" data-i18n="nav.batches">Batch Numbers</span>
                        </button>

                        <button class="sidebar-nav-item ${this.activeMode === 'employees' ? 'active' : ''}" data-mode="employees" title="Employee Directory">
                            <span class="nav-item-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                            </span>
                            <span class="nav-item-label" data-i18n="nav.people">People</span>
                        </button>
                    </div>

                    <!-- GROUP 4: ADMIN & SYSTEM SETTINGS -->
                    ${(this.canAccess('users') || this.canAccess('settings')) ? `
                        <div class="sidebar-nav-group">
                            <div class="nav-group-label">Admin</div>

                            ${this.canAccess('users') ? `
                            <button class="sidebar-nav-item ${this.activeMode === 'users' ? 'active' : ''}" data-mode="users" title="User Management">
                                <span class="nav-item-icon">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
                                </span>
                                <span class="nav-item-label" data-i18n="nav.users">Users</span>
                            </button>
                            ` : ''}

                            ${this.canAccess('settings') ? `
                            <button class="sidebar-nav-item ${this.activeMode === 'settings' ? 'active' : ''}" data-mode="settings" title="Settings">
                                <span class="nav-item-icon">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                                </span>
                                <span class="nav-item-label" data-i18n="nav.settings">Settings</span>
                            </button>
                            ` : ''}
                        </div>
                    ` : ''}

                </div>

                <!-- SIDEBAR FOOTER & USER PROFILE CARD -->
                <div class="sidebar-footer-box">
                    <button class="sidebar-quick-print-btn" id="btn-quick-print-switch" title="Print Current Active Layout">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                        <span class="quick-print-label">Print layout</span>
                    </button>

                    <!-- LOGGED-IN USER BADGE & SIGNOUT -->
                    <div class="sidebar-user-profile-card">
                        <div class="user-avatar-initials-sm" style="background: ${this.getAvatarGradient(role)};">
                            ${userInitials}
                        </div>
                        <div class="sidebar-user-info">
                            <span class="sidebar-user-name">${this.currentUser?.fullName || 'User'}</span>
                            <span class="sidebar-user-role">${roleBadgeHtml}</span>
                        </div>
                        <button class="btn-sidebar-signout" id="btn-sidebar-signout" title="Sign Out of Session">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
                        </button>
                    </div>

                    <div class="sidebar-user-row">
                        <div class="theme-toggle-row" id="btn-theme-toggle" title="Toggle Dark / Light Theme">
                            <span class="theme-label-text">Appearance</span>
                            <div class="theme-pill-switch">
                                <svg class="sun-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none;"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
                                <svg class="moon-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
                            </div>
                        </div>
                    </div>
                </div>
            </aside>

            <!-- ══════════════════════════════════════════════════════════ -->
            <!-- MAIN CONTENT AREA WITH CONTEXTUAL WORKSPACE HEADER -->
            <!-- ══════════════════════════════════════════════════════════ -->
            <div class="studio-main-wrapper">
                <!-- TOP WORKSPACE CONTEXT BAR -->
                <div class="studio-top-workspace-header">
                    <div class="workspace-header-left">
                        <h1 class="workspace-page-title" id="workspace-title">Home</h1>
                        <span class="workspace-page-subtitle" id="workspace-subtitle">Operations overview</span>
                    </div>

                    <div class="workspace-header-right">
                        <div class="workspace-command-chip" title="Search">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                            <span>Search workspace…</span>
                            <kbd>⌘K</kbd>
                        </div>
                        <div class="active-layout-pill" id="active-layout-pill" title="Current active template">
                            <span class="dot-indicator"></span>
                            <span id="active-layout-name">${this.currentLayout.name || 'Untitled layout'}</span>
                        </div>
                    </div>
                </div>

                <!-- MAIN WORKSPACE VIEWPORT PANES -->
                <div class="studio-viewport-container">
                    <div class="studio-pane" id="pane-dashboard" style="display: ${this.activeMode === 'dashboard' ? 'flex' : 'none'};"></div>
                    <div class="studio-pane" id="pane-analytics" style="display: ${this.activeMode === 'analytics' ? 'flex' : 'none'};"></div>
                    <div class="studio-pane" id="pane-generate" style="display: ${this.activeMode === 'generate' ? 'flex' : 'none'};"></div>
                    <div class="studio-pane" id="pane-designer" style="display: ${this.activeMode === 'designer' ? 'flex' : 'none'};"></div>
                    <div class="studio-pane" id="pane-print" style="display: ${this.activeMode === 'print' ? 'flex' : 'none'};"></div>
                    <div class="studio-pane" id="pane-products" style="display: ${this.activeMode === 'products' ? 'flex' : 'none'};"></div>
                    <div class="studio-pane" id="pane-serials" style="display: ${this.activeMode === 'serials' ? 'flex' : 'none'};"></div>
                    <div class="studio-pane" id="pane-batches" style="display: ${this.activeMode === 'batches' ? 'flex' : 'none'};"></div>
                    <div class="studio-pane" id="pane-employees" style="display: ${this.activeMode === 'employees' ? 'flex' : 'none'};"></div>
                    <div class="studio-pane" id="pane-library" style="display: ${this.activeMode === 'library' ? 'flex' : 'none'};"></div>
                    <div class="studio-pane" id="pane-settings" style="display: ${this.activeMode === 'settings' ? 'flex' : 'none'};"></div>
                    <div class="studio-pane" id="pane-users" style="display: ${this.activeMode === 'users' ? 'flex' : 'none'};"></div>
                </div>
            </div>
        </div>
        `;

        this.dashboardContainer = this.mountElement.querySelector('#pane-dashboard') as HTMLDivElement;
        this.analyticsContainer = this.mountElement.querySelector('#pane-analytics') as HTMLDivElement;
        this.generateContainer = this.mountElement.querySelector('#pane-generate') as HTMLDivElement;
        this.designerContainer = this.mountElement.querySelector('#pane-designer') as HTMLDivElement;
        this.printContainer = this.mountElement.querySelector('#pane-print') as HTMLDivElement;
        this.productsContainer = this.mountElement.querySelector('#pane-products') as HTMLDivElement;
        this.serialsContainer = this.mountElement.querySelector('#pane-serials') as HTMLDivElement;
        this.batchesContainer = this.mountElement.querySelector('#pane-batches') as HTMLDivElement;
        this.employeesContainer = this.mountElement.querySelector('#pane-employees') as HTMLDivElement;
        this.libraryContainer = this.mountElement.querySelector('#pane-library') as HTMLDivElement;
        this.settingsContainer = this.mountElement.querySelector('#pane-settings') as HTMLDivElement;
        this.usersContainer = this.mountElement.querySelector('#pane-users') as HTMLDivElement;

        this.initDashboard();
        this.initAnalytics();
        this.initGenerate();
        if (this.canAccess('designer')) this.initDesigner();
        this.initLibrary();
        this.initPrintDashboard();
        this.initProductManager();
        this.initSerialManager();
        this.initBatchManager();
        this.initEmployeeManager();
        if (this.canAccess('settings')) {
            this.initSettings();
        }
        if (this.canAccess('users')) {
            this.initUserManager();
        }

        this.bindEvents();
        this.switchMode(this.activeMode);

        // Sync shared master data (plants, categories, colors, variables...) from DB
        void supabaseService.fetchMasterData().then(list => { if (list) mergeMasterDataFromDb(list); });

        // Sync Serial/Batch logic rules from DB so settings are identical on every device
        void hydrateSerialLogicRulesFromDb();
        void hydrateBatchLogicRulesFromDb();

        // Sync role permissions from DB so page/action access is identical everywhere.
        // After hydration, refresh nav visibility so restrictions apply immediately.
        void hydrateRolesFromDb();
        void hydrateRolePermissionsFromDb().then(() => this.applyNavPermissions());

        // Sync company branding from DB
        this.applyBranding();
        void supabaseService.fetchCompanyProfile().then(p => {
            if (p) { this.brandingProfile = p; this.applyBranding(false); }
        });
        window.addEventListener('qr-branding-updated', () => this.applyBranding());

        // Apply interface-language translations to the current DOM
        applyTranslations(this.mountElement);
    }

    private brandingProfile: CompanyProfile | null = null;

    /** Apply the white-label brand to the document title + sidebar chrome. */
    private applyBranding(fromLocal = true) {
        const brand = fromLocal ? loadCompanyProfile() : (this.brandingProfile || loadCompanyProfile());
        const name = brand.brandName || 'QR Studio';
        document.title = name;

        const titleEl = this.mountElement.querySelector<HTMLElement>('.brand-title');
        const subEl = this.mountElement.querySelector<HTMLElement>('.brand-subtitle');
        if (titleEl) titleEl.textContent = name;
        if (subEl) subEl.textContent = brand.companyName || '';

        const badge = this.mountElement.querySelector<HTMLElement>('.studio-logo-badge');
        if (badge) {
            if (brand.logoDataUrl) {
                badge.innerHTML = logoBadgeHtml(brand.logoDataUrl);
            } else {
                badge.querySelector('img')?.remove();
            }
        }
    }

    private getAvatarGradient(role: UserRole): string {
        // Single-accent avatar tiles — muted tint per role, all over the theme accent.
        if (role === 'admin') return '#4f46e5';
        if (role === 'designer') return '#0ea5e9';
        return '#10b981';
    }

    private initAnalytics() {
        if (this.analyticsContainer) new AnalyticsView({ container: this.analyticsContainer });
    }

    private initGenerate() {
        if (this.generateContainer) {
            new GenerateView({
                container: this.generateContainer,
                onNavigateToPrint: (records) => {
                    if (this.printDashboardInstance) this.printDashboardInstance.setBatchData(records);
                    this.switchMode('print');
                }
            });
        }
    }

    private initDashboard() {
        this.overviewDashboardInstance = new OverviewDashboardView({
            container: this.dashboardContainer,
            userRole: this.userRole,
            userName: this.currentUser?.fullName || this.currentUser?.email || '',
            allowedCategories: this.allowedCategories,
            onNavigate: (mode) => this.switchMode(mode as StudioAppMode),
            onSelectTemplate: (tpl, action) => {
                this.currentLayout = JSON.parse(JSON.stringify(tpl.layout));
                this.entitySchemas[tpl.schemaKey] = tpl.schema;
                if (action === 'designer' && (this.userRole === 'admin' || this.userRole === 'designer')) {
                    this.designerContainer.innerHTML = '';
                    this.initDesigner();
                    this.switchMode('designer');
                } else {
                    if (this.printDashboardInstance) {
                        this.printDashboardInstance.setLayout(this.currentLayout);
                        this.printDashboardInstance.setBatchData(tpl.sampleBatch);
                    }
                    this.switchMode('print');
                }
            }
        });
    }

    private initDesigner() {
        this.designerInstance = new QRLayoutDesigner({
            element: this.designerContainer,
            initialLayout: this.currentLayout,
            entitySchemas: this.entitySchemas,
            onSave: (layout) => {
                this.currentLayout = JSON.parse(JSON.stringify(layout));
                if (this.printDashboardInstance) {
                    this.printDashboardInstance.setLayout(this.currentLayout);
                }
                // Persist the edit back into the source template so the change
                // is reflected in the Templates library.
                if (this.editingTemplateId) {
                    this.libraryInstance?.updateTemplate(this.editingTemplateId, this.currentLayout, layout.name);
                }
                const nameEl = this.mountElement.querySelector('#active-layout-name');
                if (nameEl) nameEl.textContent = layout.name;
                alert('Layout saved successfully! Ready for printing or batch dispatch.');
            }
        });
    }

    private initPrintDashboard() {
        this.printDashboardInstance = new QRPrintDashboard({
            container: this.printContainer,
            initialLayout: this.currentLayout,
            entitySchemas: this.entitySchemas,
            availableTemplates: this.libraryInstance?.getAllTemplates() || undefined,
            allowedCategories: this.userRole === 'admin' ? ['All'] : this.allowedCategories,
            currentUser: this.currentUser || undefined,
            onOpenDesigner: (layout) => {
                if (this.userRole === 'admin' || this.userRole === 'designer') {
                    this.currentLayout = layout;
                    this.switchMode('designer');
                }
            }
        });
    }

    private initProductManager() {
        this.productManagerInstance = new ProductManagerView({
            container: this.productsContainer,
            onPrintProductSerials: (layout, schema, records) => {
                this.currentLayout = layout;
                this.entitySchemas['product'] = schema;
                if (this.printDashboardInstance) {
                    this.printDashboardInstance.setLayout(layout);
                    this.printDashboardInstance.setBatchData(records);
                }
                this.switchMode('print');
            },
            onOpenInDesigner: (layout, schema) => {
                if (this.userRole === 'admin' || this.userRole === 'designer') {
                    this.currentLayout = layout;
                    this.entitySchemas['product'] = schema;
                    this.editingTemplateId = null;
                    this.designerContainer.innerHTML = '';
                    this.initDesigner();
                    this.switchMode('designer');
                }
            }
        });
    }

    private initSerialManager() {
        this.serialManagerInstance = new SerialManagerView({
            container: this.serialsContainer,
            onPrintSerials: (layout, schema, records) => {
                this.currentLayout = layout;
                this.entitySchemas['product'] = schema;
                if (this.printDashboardInstance) {
                    this.printDashboardInstance.setLayout(layout);
                    this.printDashboardInstance.setBatchData(records);
                }
                this.switchMode('print');
            },
            onOpenInDesigner: (layout, schema) => {
                if (this.userRole === 'admin' || this.userRole === 'designer') {
                    this.currentLayout = layout;
                    this.entitySchemas['product'] = schema;
                    this.editingTemplateId = null;
                    this.designerContainer.innerHTML = '';
                    this.initDesigner();
                    this.switchMode('designer');
                }
            }
        });
    }

    private initBatchManager() {
        this.batchManagerInstance = new BatchManagerView({
            container: this.batchesContainer,
            onPrintBatchLabels: (layout, schema, records) => {
                this.currentLayout = layout;
                this.entitySchemas['warehouse'] = schema;
                if (this.printDashboardInstance) {
                    this.printDashboardInstance.setLayout(layout);
                    this.printDashboardInstance.setBatchData(records);
                }
                this.switchMode('print');
            },
            onOpenInDesigner: (layout, schema) => {
                if (this.userRole === 'admin' || this.userRole === 'designer') {
                    this.currentLayout = layout;
                    this.entitySchemas['warehouse'] = schema;
                    this.editingTemplateId = null;
                    this.designerContainer.innerHTML = '';
                    this.initDesigner();
                    this.switchMode('designer');
                }
            },
            onGenerateSerialsForBatch: (batchNumber, productId) => {
                this.switchMode('serials');
                this.serialManagerInstance?.openGenerateModal(productId, batchNumber);
            }
        });
    }

    private initEmployeeManager() {
        this.employeeManagerInstance = new EmployeeManagerView({
            container: this.employeesContainer,
            onPrintEmployeeBadges: (layout, schema, records) => {
                this.currentLayout = layout;
                this.entitySchemas['employee'] = schema;
                if (this.printDashboardInstance) {
                    this.printDashboardInstance.setLayout(layout);
                    this.printDashboardInstance.setBatchData(records);
                }
                this.switchMode('print');
            },
            onOpenInDesigner: (layout, schema) => {
                if (this.userRole === 'admin' || this.userRole === 'designer') {
                    this.currentLayout = layout;
                    this.entitySchemas['employee'] = schema;
                    this.editingTemplateId = null;
                    this.designerContainer.innerHTML = '';
                    this.initDesigner();
                    this.switchMode('designer');
                }
            }
        });
    }

    private initLibrary() {
        this.libraryInstance = new TemplateLibraryView({
            container: this.libraryContainer,
            userRole: this.userRole,
            allowedCategories: this.allowedCategories,
            onSelectForDesigner: (tpl) => {
                if (this.userRole === 'admin' || this.userRole === 'designer') {
                    this.currentLayout = JSON.parse(JSON.stringify(tpl.layout));
                    this.entitySchemas[tpl.schemaKey] = tpl.schema;
                    this.editingTemplateId = tpl.id;
                    this.designerContainer.innerHTML = '';
                    this.initDesigner();
                    this.switchMode('designer');
                }
            },
            onSelectForPrint: (tpl) => {
                this.currentLayout = JSON.parse(JSON.stringify(tpl.layout));
                this.entitySchemas[tpl.schemaKey] = tpl.schema;
                if (this.printDashboardInstance) {
                    this.printDashboardInstance.setLayout(this.currentLayout);
                    this.printDashboardInstance.setBatchData(tpl.sampleBatch);
                }
                this.switchMode('print');
            }
        });
    }

    private initUserManager() {
        this.userManagerInstance = new UserManagerView(this.usersContainer);
    }

    private initSettings() {
        this.settingsContainer.innerHTML = `
        <div class="entity-manager-root">
            <div class="settings-sub-nav">
                <button class="settings-sub-tab active" data-sub="api">🔌 API</button>
                <button class="settings-sub-tab" data-sub="master">🗃️ Master Data</button>
                <button class="settings-sub-tab" data-sub="branding">🏷️ Company</button>
                <button class="settings-sub-tab" data-sub="access">🔐 Access Control</button>
                <button class="settings-sub-tab" data-sub="audit">📋 Audit</button>
                <button class="settings-sub-tab" data-sub="printers">🖨️ Printers</button>
                <button class="settings-sub-tab" data-sub="printjobs">🖨️ Print Jobs</button>
            </div>
            <div id="settings-page-api" style="display:block;"></div>
            <div id="settings-page-master" style="display:none;"></div>
            <div id="settings-page-branding" style="display:none;"></div>
            <div id="settings-page-access" style="display:none;"></div>
            <div id="settings-page-audit" style="display:none;"></div>
            <div id="settings-page-printers" style="display:none;"></div>
            <div id="settings-page-printjobs" style="display:none;"></div>
        </div>`;

        this.settingsContainer.querySelectorAll<HTMLButtonElement>('.settings-sub-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                const sub = btn.dataset.sub;
                this.settingsContainer.querySelectorAll('.settings-sub-tab').forEach(b => b.classList.toggle('active', b === btn));
                const pages = ['api', 'master', 'branding', 'access', 'audit', 'printers', 'printjobs'];
                pages.forEach(p => {
                    const el = this.settingsContainer.querySelector(`#settings-page-${p}`) as HTMLElement;
                    if (el) el.style.display = sub === p ? 'block' : 'none';
                });
                const els: Record<string, (host: HTMLElement) => void> = {
                    access: h => { if (!h.dataset.init) { h.dataset.init = '1'; new AccessControlView(h); } },
                    audit: h => { if (!h.dataset.init) { h.dataset.init = '1'; new AuditLogView(h); } },
                    printers: h => { if (!h.dataset.init) { h.dataset.init = '1'; new PrintersView(h); } },
                    printjobs: h => { if (!h.dataset.init) { h.dataset.init = '1'; new PrintJobsView(h); } }
                };
                const host = this.settingsContainer.querySelector(`#settings-page-${sub}`) as HTMLElement;
                if (host && els[sub]) els[sub](host);
            });
        });

        const masterHost = this.settingsContainer.querySelector('#settings-page-master') as HTMLElement;
        if (masterHost) new MasterDataManagerView(masterHost);
        const brandingHost = this.settingsContainer.querySelector('#settings-page-branding') as HTMLElement;
        if (brandingHost) new BrandingManagerView(brandingHost);

        this.renderSettingsApiPage();
    }

    private renderSettingsApiPage() {
        const config = supabaseService.getConfig();
        const apiEl = this.settingsContainer.querySelector('#settings-page-api') as HTMLElement;
        if (!apiEl) return;

        apiEl.innerHTML = `
        <div class="entity-manager-root">
            <div class="manager-card-panel" style="max-width: 860px; margin: 0 auto; width: 100%;">
                <div class="panel-header-row">
                    <div>
                        <h2 class="panel-heading">🔌 API — Cloud Database &amp; Studio Connection</h2>
                        <p class="panel-subheading">Configure the self-hosted Supabase API connection, printing units, Zebra DPI presets and auto-sequence numbering.</p>
                    </div>
                </div>

                <div style="padding: 24px; display: flex; flex-direction: column; gap: 24px;">
                    <!-- SECTION 0: LANGUAGE -->
                    <div class="settings-section-card">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                            <span style="font-size: 1.25rem;">🌐</span>
                            <h3 style="font-size: 1rem; font-weight: 700; margin: 0; color: var(--text-primary);">Workspace Language</h3>
                        </div>
                        <div class="modal-form-grid" style="padding: 0;">
                            <div class="form-group">
                                <label style="font-weight: 700;">Interface Language</label>
                                <select id="setting-lang">
                                    ${LANGS.map(l => `<option value="${l.key}" ${getLang() === l.key ? 'selected' : ''}>${l.label}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group" style="display:flex;align-items:flex-end;">
                                <button class="btn btn-primary" id="btn-save-lang">💾 Apply Language</button>
                            </div>
                        </div>
                    </div>

                    <!-- SECTION 1: SUPABASE CLOUD & SELF-HOSTED DATABASE -->
                    <div class="settings-section-card">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 1.25rem;">⚡</span>
                                <h3 style="font-size: 1rem; font-weight: 700; margin: 0; color: var(--text-primary);">Supabase Cloud Database Sync</h3>
                            </div>
                            <span class="nav-item-badge badge-indigo" id="supabase-status-badge">● Configured</span>
                        </div>
                        <p style="font-size: 0.8125rem; color: var(--text-secondary); margin: 0 0 16px 0; line-height: 1.5;">
                            Connected to your self-hosted Supabase instance. Products, serial tracking numbers, and staff badges will automatically synchronize in real time.
                        </p>

                        <div class="modal-form-grid" style="padding: 0;">
                            <div class="form-group col-span-2">
                                <label style="font-weight: 700;">Project URL / API Endpoint</label>
                                <input type="text" id="setting-supabase-url" placeholder="https://supabase2.kajariabathware.in" value="${config.url}" style="font-family: monospace; font-size: 0.8125rem;" />
                            </div>
                            <div class="form-group col-span-2">
                                <label style="font-weight: 700;">Anon Public Key / JWT Secret</label>
                                <input type="password" id="setting-supabase-key" placeholder="eyJhbGci..." value="${config.anonKey}" style="font-family: monospace; font-size: 0.8125rem;" />
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 700;">Database Sync Status</label>
                                <select id="setting-supabase-enabled">
                                    <option value="true" ${config.enabled ? 'selected' : ''}>Active (Supabase Real-Time Sync)</option>
                                    <option value="false" ${!config.enabled ? 'selected' : ''}>Disabled (Local Offline Storage Only)</option>
                                </select>
                            </div>
                            <div class="form-group" style="display: flex; align-items: flex-end;">
                                <button class="btn btn-outline" id="btn-test-supabase" style="width: 100%; font-weight: 600;">
                                    🔍 Test Connection
                                </button>
                            </div>
                        </div>

                        <div id="supabase-test-result" style="margin-top: 14px; display: none; font-size: 0.8125rem; padding: 10px 14px; border-radius: 8px;"></div>
                    </div>

                    <!-- SECTION 2: DEFAULT PRINT UNITS & DPI -->
                    <div class="settings-section-card">
                        <h3 style="font-size: 1rem; font-weight: 700; margin: 0 0 12px 0; color: var(--text-primary);">🖨️ Printer &amp; Physical Label Standards</h3>
                        <div class="modal-form-grid" style="padding: 0;">
                            <div class="form-group">
                                <label style="font-weight: 700;">Default Measurement Unit</label>
                                <select id="setting-default-unit">
                                    <option value="mm" selected>Millimeters (mm) - Industrial Standard</option>
                                    <option value="in">Inches (in) - US Standard</option>
                                    <option value="px">Pixels (px) - Digital</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 700;">Zebra ZPL Printer DPI Target</label>
                                <select id="setting-default-dpi">
                                    <option value="203" selected>203 DPI (8 dots/mm) - Standard Desktop Printers</option>
                                    <option value="300">300 DPI (12 dots/mm) - High Density / Small Tags</option>
                                    <option value="600">600 DPI (24 dots/mm) - Ultra Precision Micro-QR</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- SECTION 3: SYSTEM ACTIONS & RESET -->
                    <div class="settings-section-card" style="border-color: #fca5a5; background: #fff5f5;">
                        <h3 style="font-size: 0.9375rem; font-weight: 700; color: #dc2626; margin: 0 0 6px 0;">⚠️ Danger Zone &amp; Database Reset</h3>
                        <p style="font-size: 0.8125rem; color: #991b1b; margin: 0 0 14px 0;">Clear all locally cached layouts, products, serial sequences, and employee records.</p>
                        <button class="btn btn-outline btn-sm" id="btn-settings-clear-all" style="border-color:#dc2626; color:#dc2626;">
                            🗑️ Reset Local Database Cache
                        </button>
                    </div>

                    <div style="display: flex; justify-content: flex-end; gap: 10px;">
                        <button class="btn btn-primary" id="btn-save-settings">
                            💾 Save API &amp; Studio Settings
                        </button>
                    </div>
                </div>
            </div>
        </div>`;

        // Test Supabase Connection
        this.settingsContainer.querySelector('#btn-test-supabase')?.addEventListener('click', async () => {
            const btn = this.settingsContainer.querySelector('#btn-test-supabase') as HTMLButtonElement;
            const resEl = this.settingsContainer.querySelector('#supabase-test-result') as HTMLElement;
            if (!btn || !resEl) return;

            btn.disabled = true;
            btn.textContent = '⏳ Testing connection...';
            resEl.className = 'status-alert status-alert-running';
            resEl.style.display = 'block';
            resEl.textContent = 'Connecting to Supabase at ' + (this.settingsContainer.querySelector('#setting-supabase-url') as HTMLInputElement).value + '...';

            const url = (this.settingsContainer.querySelector('#setting-supabase-url') as HTMLInputElement).value.trim();
            const key = (this.settingsContainer.querySelector('#setting-supabase-key') as HTMLInputElement).value.trim();
            const enabled = (this.settingsContainer.querySelector('#setting-supabase-enabled') as HTMLSelectElement).value === 'true';

            supabaseService.saveConfig({ url, anonKey: key, enabled });
            const result = await supabaseService.testConnection();

            btn.disabled = false;
            btn.textContent = '🔍 Test Supabase Connection';

            if (result.success) {
                resEl.className = 'status-alert status-alert-success';
                resEl.innerHTML = '<strong>✅ Success!</strong> ' + result.message;
            } else {
                resEl.className = 'status-alert status-alert-error';
                resEl.innerHTML = '<strong>❌ Connection Issue:</strong> ' + result.message;
            }
        });

        // Save Settings
        this.settingsContainer.querySelector('#btn-save-lang')?.addEventListener('click', () => {
            const lang = (this.settingsContainer.querySelector('#setting-lang') as HTMLSelectElement).value as any;
            setLang(lang);
            alert('Language updated. Reloading the workspace…');
            setTimeout(() => window.location.reload(), 600);
        });

        this.settingsContainer.querySelector('#btn-save-settings')?.addEventListener('click', () => {
            const url = (this.settingsContainer.querySelector('#setting-supabase-url') as HTMLInputElement).value.trim();
            const key = (this.settingsContainer.querySelector('#setting-supabase-key') as HTMLInputElement).value.trim();
            const enabled = (this.settingsContainer.querySelector('#setting-supabase-enabled') as HTMLSelectElement).value === 'true';

            supabaseService.saveConfig({ url, anonKey: key, enabled });
            alert('API & Studio configuration saved successfully!');
        });

        this.settingsContainer.querySelector('#btn-settings-clear-all')?.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset local database cache?')) {
                localStorage.clear();
                window.location.reload();
            }
        });
    }

    private bindEvents() {
        // Navigation Buttons
        this.mountElement.querySelectorAll<HTMLButtonElement>('.sidebar-nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = (e.currentTarget as HTMLButtonElement).dataset.mode as StudioAppMode;
                if (mode) this.switchMode(mode);
            });
        });

        // Sidebar Collapse / Expand Toggle
        this.mountElement.querySelector('#btn-sidebar-toggle')?.addEventListener('click', () => {
            this.toggleSidebarCollapse();
        });

        // Quick Print
        this.mountElement.querySelector('#btn-quick-print-switch')?.addEventListener('click', () => {
            this.switchMode('print');
        });

        // Sign Out
        this.mountElement.querySelector('#btn-sidebar-signout')?.addEventListener('click', async () => {
            if (confirm('Are you sure you want to sign out of your account?')) {
                await supabaseService.logout();
                this.currentUser = null;
                this.renderAuthScreen();
            }
        });

        // Theme Toggle
        this.mountElement.querySelector('#btn-theme-toggle')?.addEventListener('click', () => {
            this.toggleTheme();
        });
    }

    private toggleSidebarCollapse() {
        this.isSidebarCollapsed = !this.isSidebarCollapsed;
        const sidebar = this.mountElement.querySelector('#app-sidebar');
        sidebar?.classList.toggle('collapsed', this.isSidebarCollapsed);

        const leftIcon = this.mountElement.querySelector('.icon-collapse-left') as HTMLElement;
        const rightIcon = this.mountElement.querySelector('.icon-collapse-right') as HTMLElement;
        if (leftIcon && rightIcon) {
            leftIcon.style.display = this.isSidebarCollapsed ? 'none' : 'inline';
            rightIcon.style.display = this.isSidebarCollapsed ? 'inline' : 'none';
        }
    }

    public switchMode(mode: StudioAppMode) {
        // Role check (based on the access-control matrix; admins always can)
        if (mode === 'users' && !this.canAccess('users')) {
            mode = 'dashboard';
        } else if (mode === 'settings' && !this.canAccess('settings')) {
            mode = 'dashboard';
        } else if (mode === 'designer' && !this.canAccess('designer')) {
            mode = 'print';
        } else if (mode === 'generate' && !(this.canAccess('serials') || this.canAccess('batches'))) {
            mode = 'dashboard';
        }

        this.activeMode = mode;

        this.mountElement.querySelectorAll('.sidebar-nav-item').forEach(btn => {
            btn.classList.toggle('active', (btn as HTMLElement).dataset.mode === mode);
        });

        if (this.dashboardContainer) this.dashboardContainer.style.display = mode === 'dashboard' ? 'flex' : 'none';
        if (this.analyticsContainer) this.analyticsContainer.style.display = mode === 'analytics' ? 'flex' : 'none';
        if (this.generateContainer) this.generateContainer.style.display = mode === 'generate' ? 'flex' : 'none';
        if (this.designerContainer) this.designerContainer.style.display = mode === 'designer' ? 'flex' : 'none';
        if (this.printContainer) this.printContainer.style.display = mode === 'print' ? 'flex' : 'none';
        if (this.productsContainer) this.productsContainer.style.display = mode === 'products' ? 'flex' : 'none';
        if (this.serialsContainer) this.serialsContainer.style.display = mode === 'serials' ? 'flex' : 'none';
        if (this.batchesContainer) this.batchesContainer.style.display = mode === 'batches' ? 'flex' : 'none';
        if (this.employeesContainer) this.employeesContainer.style.display = mode === 'employees' ? 'flex' : 'none';
        if (this.libraryContainer) this.libraryContainer.style.display = mode === 'library' ? 'flex' : 'none';
        if (mode === 'library') this.libraryInstance?.refresh();
        if (mode === 'serials') this.serialManagerInstance?.refresh();
        if (mode === 'batches') this.batchManagerInstance?.refresh();
        if (this.settingsContainer) this.settingsContainer.style.display = mode === 'settings' ? 'flex' : 'none';
        if (this.usersContainer) this.usersContainer.style.display = mode === 'users' ? 'flex' : 'none';

        if (mode === 'dashboard' && this.overviewDashboardInstance) {
            this.overviewDashboardInstance.render();
        } else if (mode === 'users' && this.userManagerInstance) {
            this.userManagerInstance.loadUsers();
        }

        // Update Contextual Workspace Header
        const titleEl = this.mountElement.querySelector('#workspace-title');
        const subtitleEl = this.mountElement.querySelector('#workspace-subtitle');

        const titleMap: Record<StudioAppMode, { title: string; sub: string }> = {
            dashboard: {
                title: 'Home',
                sub: 'Metrics, templates, and print activity'
            },
            analytics: {
                title: 'Analytics',
                sub: 'Operational metrics & print activity'
            },
            generate: {
                title: 'Generate',
                sub: 'Create serial & batch numbers'
            },
            designer: {
                title: 'Designer',
                sub: 'Compose labels with live data binding'
            },
            print: {
                title: 'Print',
                sub: 'Sheet layout, PDF, and ZPL export'
            },
            products: {
                title: 'Products',
                sub: 'Catalog, variables, and serial configuration'
            },
            serials: {
                title: 'Serial Numbers',
                sub: 'Individual tracking codes, QR inspections, and label generator'
            },
            batches: {
                title: 'Batch Numbers',
                sub: 'Manufacturing lots, production shifts, and master carton tags'
            },
            employees: {
                title: 'People',
                sub: 'Directory and badge records'
            },
            library: {
                title: 'Templates',
                sub: 'Ready-made layouts for common label jobs'
            },
            users: {
                title: 'Users',
                sub: 'Accounts, roles, and template access'
            },
            settings: {
                title: 'Settings',
                sub: 'Printer defaults and workspace config'
            }
        };

        if (titleEl && subtitleEl && titleMap[mode]) {
            titleEl.textContent = titleMap[mode].title;
            subtitleEl.textContent = titleMap[mode].sub;
        }

        if (mode === 'print' && this.printDashboardInstance) {
            this.printDashboardInstance.setLayout(this.currentLayout);
        }
    }

    private toggleTheme() {
        this.isDarkMode = !this.isDarkMode;
        this.mountElement.querySelector('.studio-app-root')?.classList.toggle('dark-mode', this.isDarkMode);
        this.mountElement.querySelector('.qrlayout-designer')?.classList.toggle('dark-mode', this.isDarkMode);

        const sun = this.mountElement.querySelector('.sun-icon') as HTMLElement;
        const moon = this.mountElement.querySelector('.moon-icon') as HTMLElement;
        if (sun && moon) {
            sun.style.display = this.isDarkMode ? 'inline' : 'none';
            moon.style.display = this.isDarkMode ? 'none' : 'inline';
        }
    }
}
