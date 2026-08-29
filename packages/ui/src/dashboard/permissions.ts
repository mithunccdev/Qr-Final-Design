// ════════════════════════════════════════════════════════════════════════════
// ROLE & ACCESS CONTROL MODEL
// Defines which pages (view) and actions (create/edit/delete) each role gets.
// Persisted to Supabase `role_permissions` table; cached in localStorage.
// ════════════════════════════════════════════════════════════════════════════

import { UserRole } from '../supabase';
import { supabaseService } from '../supabase';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';

export type PageKey =
    | 'dashboard'
    | 'designer'
    | 'print'
    | 'templates'
    | 'products'
    | 'serials'
    | 'batches'
    | 'employees'
    | 'settings'
    | 'users';

// role -> page -> action -> allowed
export type RolePermissions = Record<string, Record<PageKey, Record<PermissionAction, boolean>>>;

export const PAGES: { key: PageKey; label: string; icon: string }[] = [
    { key: 'dashboard', label: 'Home / Dashboard', icon: '🏠' },
    { key: 'designer', label: 'Label Designer', icon: '🎨' },
    { key: 'print', label: 'Batch Print Hub', icon: '🖨️' },
    { key: 'templates', label: 'Template Library', icon: '📁' },
    { key: 'products', label: 'Products Catalog', icon: '📦' },
    { key: 'serials', label: 'Serial Numbers', icon: '🔢' },
    { key: 'batches', label: 'Batch Numbers', icon: '📊' },
    { key: 'employees', label: 'People / Employees', icon: '👥' },
    { key: 'settings', label: 'Settings', icon: '⚙️' },
    { key: 'users', label: 'User Management', icon: '🔐' },
];

const ACTIONS: { key: PermissionAction; label: string }[] = [
    { key: 'view', label: 'View' },
    { key: 'create', label: 'Create' },
    { key: 'edit', label: 'Edit' },
    { key: 'delete', label: 'Delete' },
];

const STORAGE_KEY = 'qrlayout_role_permissions_v1';

/** Admin is ALWAYS full access (never stored / never editable) to prevent lock-out. */
export const ADMIN_FULL: boolean = true;

function fullAll(): Record<PageKey, Record<PermissionAction, boolean>> {
    const m = {} as Record<PageKey, Record<PermissionAction, boolean>>;
    for (const p of PAGES) {
        const a = {} as Record<PermissionAction, boolean>;
        for (const act of ACTIONS) a[act.key] = true;
        m[p.key] = a;
    }
    return m;
}

function allFalse(): Record<PageKey, Record<PermissionAction, boolean>> {
    const m = {} as Record<PageKey, Record<PermissionAction, boolean>>;
    for (const p of PAGES) {
        const a = {} as Record<PermissionAction, boolean>;
        for (const act of ACTIONS) a[act.key] = false;
        m[p.key] = a;
    }
    return m;
}

/** Sensible defaults that mirror the previous hardcoded behaviour. */
export const DEFAULT_ROLE_PERMISSIONS: RolePermissions = (() => {
    const rp: RolePermissions = {};
    rp['admin'] = fullAll();

    // Designer: full studio read/write except System settings & user management.
    const designer = allFalse();
    for (const key of ['dashboard', 'designer', 'print', 'templates', 'products', 'serials', 'batches', 'employees'] as PageKey[]) {
        designer[key].view = true;
        designer[key].create = true;
        designer[key].edit = true;
    }
    designer['templates'].delete = true;
    designer['products'].delete = true;
    designer['employees'].delete = true;
    rp['designer'] = designer;

    // Operator / user: read-only on operational pages (incl. print), no designer/settings/users.
    const user = allFalse();
    for (const key of ['dashboard', 'print', 'templates', 'products', 'serials', 'batches', 'employees'] as PageKey[]) {
        user[key].view = true;
    }
    // Operators can create serials & batches (core production flow).
    user['serials'].create = true;
    user['batches'].create = true;
    rp['user'] = user;

    return rp;
})();

export function loadRolePermissions(): RolePermissions {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                // Ensure admin is always full
                parsed['admin'] = fullAll();
                return parsed;
            }
        }
    } catch (e) {
        console.warn('Failed loading role permissions', e);
    }
    return { ...DEFAULT_ROLE_PERMISSIONS, admin: fullAll() };
}

export function saveRolePermissions(map: RolePermissions): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch (e) {
        console.warn('Failed saving role permissions', e);
    }
}

/** True when the role has the given action on the given page (admin = always). */
export function hasPermission(role: string | undefined, page: PageKey, action: PermissionAction): boolean {
    if ((role || 'user') === 'admin') return true;
    const map = loadRolePermissions();
    return map[role || 'user']?.[page]?.[action] === true;
}

/** True when the role may at least view a page. */
export function hasPageAccess(role: string | undefined, page: PageKey): boolean {
    if ((role || 'user') === 'admin') return true;
    const map = loadRolePermissions();
    return map[role || 'user']?.[page]?.view === true;
}

/** True when the currently-logged-in user may perform an action on a page. */
export function canCurrentUser(page: PageKey, action: PermissionAction): boolean {
    const role = supabaseService.getCurrentUser()?.role;
    return hasPermission(role, page, action);
}

export { ACTIONS as PERMISSION_ACTIONS };

/** Convert DB rows → nested map. rows: {role,page,can_view,can_create,can_edit,can_delete}. */
export function rolePermissionsFromRows(rows: any[]): RolePermissions {
    const map: RolePermissions = { admin: fullAll() };
    for (const r of rows || []) {
        const role = r.role;
        if (role === 'admin') continue; // admin forced full
        const base = map[role] || allFalse();
        if (base[r.page]) {
            base[r.page] = {
                view: !!r.can_view,
                create: !!r.can_create,
                edit: !!r.can_edit,
                delete: !!r.can_delete
            };
        }
        map[role] = base;
    }
    return map;
}

/** Convert nested map → flattened DB rows. */
export function rolePermissionsToRows(map: RolePermissions): { role: string; page: string; can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }[] {
    const rows: { role: string; page: string; can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }[] = [];
    for (const [role, pages] of Object.entries(map)) {
        if (role === 'admin') continue; // admin enforced in-app
        for (const [page, acts] of Object.entries(pages) as any) {
            rows.push({
                role,
                page,
                can_view: !!(acts as any).view,
                can_create: !!(acts as any).create,
                can_edit: !!(acts as any).edit,
                can_delete: !!(acts as any).delete
            });
        }
    }
    return rows;
}

/** Hydrate the local cache from the DB (DB wins, respects a provided role list). */
export async function hydrateRolePermissionsFromDb(): Promise<void> {
    const rows = await supabaseService.fetchRolePermissions();
    if (rows && rows.length > 0) {
        saveRolePermissions(rolePermissionsFromRows(rows));
    }
}

export type { UserRole };
