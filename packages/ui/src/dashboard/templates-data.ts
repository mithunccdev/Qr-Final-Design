import { StickerLayout } from 'qrlayout-core';
import type { EntitySchema } from '../types';

export type TemplateCategoryType =
    | 'Faucets & Fittings'
    | 'Sanitaryware & Bathware'
    | 'Retail Pricing & Shelf Tags'
    | 'Logistics & Shipping'
    | 'Warehouse & Inventory'
    | 'Asset & Equipment'
    | 'Badges & Identification'
    | (string & {}); // allow user-created custom categories

export interface TemplateCategoryDef {
    id: TemplateCategoryType | 'All';
    label: string;
    icon: string;
    description: string;
    permissionKey: string; // Used in User Creation & Access Management
    defaultRoles: string[]; // Standard roles with access to this category
}

export const TEMPLATE_CATEGORIES: TemplateCategoryDef[] = [
    {
        id: 'All',
        label: 'All Templates',
        icon: '📁',
        description: 'Complete catalog of all manufacturing and enterprise templates',
        permissionKey: 'templates:all',
        defaultRoles: ['admin']
    },
    {
        id: 'Faucets & Fittings',
        label: 'Faucets & Fittings',
        icon: '🚰',
        description: 'Product serial tags, laser sticker labels, and box packaging tags for KSPL, KGPL, KBPL faucet lines',
        permissionKey: 'templates:faucets',
        defaultRoles: ['admin', 'plant-kspl', 'plant-kgpl', 'plant-kbpl', 'quality-inspector']
    },
    {
        id: 'Sanitaryware & Bathware',
        label: 'Sanitaryware & Bathware',
        icon: '🛁',
        description: 'Ceramic closet tags, washbasin carton labels, and warranty serial QR stickers',
        permissionKey: 'templates:sanitaryware',
        defaultRoles: ['admin', 'plant-kspl', 'plant-kbpl', 'quality-inspector']
    },
    {
        id: 'Retail Pricing & Shelf Tags',
        label: 'Retail & Shelf Tags',
        icon: '🏷️',
        description: 'Retail showroom price tags, MRP stickers, promotional shelf talkers, and SKU barcode tags',
        permissionKey: 'templates:retail',
        defaultRoles: ['admin', 'retail-associate', 'store-manager']
    },
    {
        id: 'Logistics & Shipping',
        label: 'Logistics & Shipping',
        icon: '📦',
        description: 'Thermal 4x6 courier labels, destination routing barcodes, and master carton dispatch tags',
        permissionKey: 'templates:logistics',
        defaultRoles: ['admin', 'logistics-dispatcher', 'warehouse-supervisor']
    },
    {
        id: 'Warehouse & Inventory',
        label: 'Warehouse & Inventory',
        icon: '🏭',
        description: 'Bin location rack labels, pallet lot tags, raw material batch stickers, and forklift scanner QR tags',
        permissionKey: 'templates:warehouse',
        defaultRoles: ['admin', 'warehouse-supervisor', 'inventory-clerk', 'plant-kspl', 'plant-kgpl', 'plant-kbpl']
    },
    {
        id: 'Asset & Equipment',
        label: 'Asset & Equipment',
        icon: '💻',
        description: 'Machinery inspection tags, IT hardware audit labels, and plant maintenance QR stickers',
        permissionKey: 'templates:asset',
        defaultRoles: ['admin', 'it-admin', 'maintenance-engineer']
    },
    {
        id: 'Badges & Identification',
        label: 'Badges & Identification',
        icon: '🪪',
        description: 'Employee ID passes, plant visitor cards, contractor tags, and VIP summit passes',
        permissionKey: 'templates:badges',
        defaultRoles: ['admin', 'hr-security', 'event-coordinator']
    }
];

// ──────────────────────────────────────────────────────────────────────────────
// TEMPLATE CATEGORY STORE — custom categories + edits (renames) of existing ones
//
// Categories use a STABLE `id` (the matching key used by templates & user
// permissions) and a separate, editable `label`/`icon`/`description` for display.
// This lets users rename/restyle categories without breaking template sorting,
// search, or the create-template / user-permission lists.
// ──────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY_CATEGORIES = 'qrlayout_template_categories';

interface CategoryOverrides {
    label?: string;
    icon?: string;
    description?: string;
}

interface CategoryStore {
    custom: TemplateCategoryDef[];
    overrides: Record<string, CategoryOverrides>;
}

const EMPTY_STORE: CategoryStore = { custom: [], overrides: {} };

function loadCategoryStore(): CategoryStore {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_CATEGORIES);
        if (raw) {
            const parsed = JSON.parse(raw);
            return {
                custom: Array.isArray(parsed?.custom) ? parsed.custom : [],
                overrides: parsed?.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {}
            };
        }
    } catch (e) {
        console.warn('Failed loading custom categories', e);
    }
    return EMPTY_STORE;
}

function saveCategoryStore(store: CategoryStore): void {
    try {
        localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(store));
    } catch (e) {
        console.warn('Failed saving custom categories', e);
    }
}

function applyOverrides(def: TemplateCategoryDef, ov?: CategoryOverrides): TemplateCategoryDef {
    if (!ov) return def;
    return {
        ...def,
        label: ov.label || def.label,
        icon: ov.icon || def.icon,
        description: ov.description || def.description
    };
}

export function getCustomCategories(): TemplateCategoryDef[] {
    return loadCategoryStore().custom;
}

export function saveCustomCategories(categories: TemplateCategoryDef[]): void {
    const store = loadCategoryStore();
    store.custom = categories;
    saveCategoryStore(store);
}

/** All categories = built-in (with user edits applied) + custom, "All" first. */
export function getAllTemplateCategories(): TemplateCategoryDef[] {
    const { custom, overrides } = loadCategoryStore();
    const builtIn = TEMPLATE_CATEGORIES.map(def => applyOverrides(def, overrides[def.id]));
    const all = builtIn.find(c => c.id === 'All');
    const rest = builtIn.filter(c => c.id !== 'All');
    return all ? [all, ...rest, ...custom] : [...rest, ...custom];
}

/** Categories that can be assigned to a template (excludes the "All" pseudo-category). */
export function getAssignableTemplateCategories(): TemplateCategoryDef[] {
    return getAllTemplateCategories().filter(c => c.id !== 'All');
}

/** Resolve the current display label for a category id. */
export function getCategoryLabel(id: string): string {
    const def = getAllTemplateCategories().find(c => c.id === id);
    return def?.label || id;
}

/**
 * Create a new custom category. Returns the def, or null if the name is empty,
 * a custom category with the same name already exists, or it collides with a
 * built-in name (case-insensitive).
 */
export function addCustomCategory(name: string, icon?: string): TemplateCategoryDef | null {
    const label = (name || '').trim();
    if (!label) return null;

    const duplicated = getAllTemplateCategories().some(c => c.id.toLowerCase() === label.toLowerCase());
    if (duplicated) return null;

    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `category-${Date.now()}`;
    const def: TemplateCategoryDef = {
        id: label,
        label,
        icon: icon?.trim() || '📂',
        description: `User-created template category: ${label}`,
        permissionKey: `templates:${slug}`,
        defaultRoles: ['admin']
    };

    const store = loadCategoryStore();
    store.custom.push(def);
    saveCategoryStore(store);
    return def;
}

/**
 * Edit a category's display fields. Built-in categories are updated via an
 * override (id stays stable); custom categories are updated in place.
 * Returns true on success.
 */
export function updateCategory(id: string, updates: CategoryOverrides): boolean {
    const store = loadCategoryStore();
    const isBuiltIn = TEMPLATE_CATEGORIES.some(c => c.id === id);

    if (isBuiltIn) {
        store.overrides[id] = { ...store.overrides[id], ...updates };
        saveCategoryStore(store);
        return true;
    }

    const idx = store.custom.findIndex(c => c.id === id);
    if (idx === -1) return false;

    const cur = store.custom[idx];
    store.custom[idx] = {
        ...cur,
        label: updates.label?.trim() || cur.label,
        icon: updates.icon?.trim() || cur.icon,
        description: updates.description?.trim() || cur.description
    };
    saveCategoryStore(store);
    return true;
}

/** Delete a custom category. Built-in categories can't be deleted (id is referenced by templates). */
export function deleteCategory(id: string): boolean {
    if (TEMPLATE_CATEGORIES.some(c => c.id === id)) return false;
    const store = loadCategoryStore();
    const before = store.custom.length;
    store.custom = store.custom.filter(c => c.id !== id);
    saveCategoryStore(store);
    return store.custom.length < before;
}

export interface PrebuiltTemplate {
    id: string;
    title: string;
    description: string;
    category: TemplateCategoryType;
    categoryKey: string;
    accessScope: string[]; // Roles or scope keys allowed to access
    accessLevel: 'Public' | 'Plant Restricted' | 'Warehouse & Logistics' | 'Retail Only' | 'Admin & Security';
    icon: string;
    schemaKey: string;
    schema: EntitySchema;
    layout: StickerLayout;
    sampleBatch: Record<string, any>[];
    defaultSheetPreset: string;
}

export interface UserAccessRoleProfile {
    roleId: string;
    roleName: string;
    badge: string;
    description: string;
    allowedCategories: (TemplateCategoryType | 'All')[];
}

export const PRESET_USER_ROLES: UserAccessRoleProfile[] = [
    {
        roleId: 'admin',
        roleName: 'System Administrator (Full Access)',
        badge: '👑 Admin',
        description: 'Unrestricted access to all template categories and designer studio',
        allowedCategories: ['All']
    },
    {
        roleId: 'plant-kspl',
        roleName: 'Plant Manager — KSPL Unit',
        badge: '🏢 KSPL Plant',
        description: 'Access to Faucets, Sanitaryware, and Plant Warehouse templates',
        allowedCategories: ['Faucets & Fittings', 'Sanitaryware & Bathware', 'Warehouse & Inventory']
    },
    {
        roleId: 'plant-kgpl',
        roleName: 'Plant Manager — KGPL Unit',
        badge: '🏢 KGPL Plant',
        description: 'Access to Faucets & Fittings, Asset Maintenance, and Warehouse tags',
        allowedCategories: ['Faucets & Fittings', 'Asset & Equipment', 'Warehouse & Inventory']
    },
    {
        roleId: 'plant-kbpl',
        roleName: 'Plant Manager — KBPL Unit',
        badge: '🏢 KBPL Plant',
        description: 'Access to Sanitaryware, Faucets, and Inventory batch tags',
        allowedCategories: ['Sanitaryware & Bathware', 'Faucets & Fittings', 'Warehouse & Inventory']
    },
    {
        roleId: 'warehouse-logistics',
        roleName: 'Warehouse & Shipping Dispatcher',
        badge: '📦 Logistics',
        description: 'Restricted to Shipping Parcel labels and Warehouse Bin location tags',
        allowedCategories: ['Logistics & Shipping', 'Warehouse & Inventory']
    },
    {
        roleId: 'retail-store',
        roleName: 'Retail Showroom Associate',
        badge: '🏷️ Retail Store',
        description: 'Restricted to Retail Price tags and Showroom shelf barcode stickers',
        allowedCategories: ['Retail Pricing & Shelf Tags']
    },
    {
        roleId: 'hr-security',
        roleName: 'HR & Security Administrator',
        badge: '🪪 HR & Security',
        description: 'Restricted to Employee ID Badges, Visitor cards, and IT Asset tags',
        allowedCategories: ['Badges & Identification', 'Asset & Equipment']
    }
];

export const PREBUILT_TEMPLATES: PrebuiltTemplate[] = [
    // ──────────────────────────────────────────────────────────────────────────
    // 1. FAUCETS & FITTINGS
    // ──────────────────────────────────────────────────────────────────────────
    {
        id: 'faucet-serial-box-tag',
        title: 'Faucet Box Serial & QR Warranty Label',
        description: 'Individual packaging sticker with serialized QR code, product code, plant code (KSPL/KGPL/KBPL), color, finish, and INR MRP.',
        category: 'Faucets & Fittings',
        categoryKey: 'faucets',
        accessScope: ['admin', 'plant-kspl', 'plant-kgpl', 'plant-kbpl', 'quality-inspector'],
        accessLevel: 'Plant Restricted',
        icon: '🚰',
        schemaKey: 'product',
        defaultSheetPreset: 'a4-24up',
        schema: {
            label: 'Faucet Serial Unit',
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
                color: 'RG - Rose Gold',
                warranty: '10 Years',
                serialNumber: 'SHW-RG-01001',
                dp: '₹21,250.00',
                mrp: '₹21,250.00'
            }
        },
        layout: {
            id: 'faucet-serial-box-tag',
            name: 'Faucet Serial QR Box Label',
            targetEntity: 'product',
            width: 70,
            height: 38,
            unit: 'mm',
            backgroundColor: '#ffffff',
            elements: [
                {
                    id: 'brand-banner',
                    type: 'text',
                    x: 0,
                    y: 0,
                    w: 70,
                    h: 7,
                    content: 'KAJARIA BATHWARE • PLANT {{plant}}',
                    style: {
                        textAlign: 'center',
                        fontWeight: 'bold',
                        fontSize: 7.5,
                        color: '#ffffff',
                        backgroundColor: '#6d28d9'
                    }
                },
                {
                    id: 'prod-code',
                    type: 'text',
                    x: 3,
                    y: 9,
                    w: 42,
                    h: 6,
                    content: 'CODE: {{sku}}',
                    style: {
                        textAlign: 'left',
                        fontWeight: 'bold',
                        fontSize: 8.5,
                        color: '#0f172a'
                    }
                },
                {
                    id: 'prod-title',
                    type: 'text',
                    x: 3,
                    y: 15,
                    w: 42,
                    h: 7,
                    content: '{{title}}',
                    style: {
                        textAlign: 'left',
                        fontSize: 6.5,
                        color: '#475569'
                    }
                },
                {
                    id: 'prod-specs',
                    type: 'text',
                    x: 3,
                    y: 22,
                    w: 42,
                    h: 5,
                    content: 'Finish: {{color}} | Warranty: {{warranty}}',
                    style: {
                        textAlign: 'left',
                        fontSize: 6,
                        color: '#64748b'
                    }
                },
                {
                    id: 'prod-sn-row',
                    type: 'text',
                    x: 3,
                    y: 27,
                    w: 42,
                    h: 5,
                    content: 'S/N: {{serialNumber}}',
                    style: {
                        textAlign: 'left',
                        fontWeight: 'bold',
                        fontSize: 7,
                        color: '#0284c7'
                    }
                },
                {
                    id: 'qr-warranty',
                    type: 'qr',
                    x: 48,
                    y: 9,
                    w: 19,
                    h: 19,
                    content: 'https://kajariabathware.in/verify?sn={{serialNumber}}&sku={{sku}}'
                },
                {
                    id: 'prod-mrp-val',
                    type: 'text',
                    x: 46,
                    y: 29,
                    w: 22,
                    h: 7,
                    content: 'MRP {{mrp}}',
                    style: {
                        textAlign: 'center',
                        fontWeight: 'bold',
                        fontSize: 8,
                        color: '#dc2626'
                    }
                }
            ]
        },
        sampleBatch: [
            { sku: 'KA570027-RG', title: 'CeilingShower400mmx400mm(BrassRG)', plant: 'KSPL', color: 'RG', warranty: '10 Years', serialNumber: 'SHW-RG-01001', dp: '₹21,250.00', mrp: '₹21,250.00' },
            { sku: 'AU/KIT', title: 'AURUM TOOL KIT', plant: 'KGPL', color: 'CP', warranty: '2 Years', serialNumber: 'KIT-01001', dp: '₹250.00', mrp: '₹500.00' },
            { sku: 'F-KA10000-CG', title: 'HOSE CHAIN 1.MTR -CG', plant: 'KSPL', color: 'CG', warranty: '5 Years', serialNumber: 'HSE-CG-01001', dp: '₹420.00', mrp: '₹840.00' },
            { sku: 'F-KA1000057-GM', title: 'HOSE CHAIN 1.MTR -GM', plant: 'KGPL', color: 'GM', warranty: '5 Years', serialNumber: 'HSE-GM-01001', dp: '₹640.00', mrp: '₹1,280.00' },
            { sku: 'F-KB2000733-BLK', title: 'Knob (Small)', plant: 'KBPL', color: 'MB', warranty: '3 Years', serialNumber: 'KNB-BLK-01001', dp: '₹900.00', mrp: '₹1,800.00' }
        ]
    },

    // ──────────────────────────────────────────────────────────────────────────
    // 2. SANITARYWARE & BATHWARE
    // ──────────────────────────────────────────────────────────────────────────
    {
        id: 'sanitaryware-master-carton',
        title: 'Sanitaryware Master Carton & Pallet Tag',
        description: 'Large heavy-duty carton label for ceramic washbasins, rimless water closets, and bathware suites with QA stamp.',
        category: 'Sanitaryware & Bathware',
        categoryKey: 'sanitaryware',
        accessScope: ['admin', 'plant-kspl', 'plant-kbpl', 'quality-inspector'],
        accessLevel: 'Plant Restricted',
        icon: '🛁',
        schemaKey: 'sanitaryware',
        defaultSheetPreset: 'a4-8up',
        schema: {
            label: 'Sanitaryware Unit',
            fields: [
                { name: 'productCode', label: 'Item Code' },
                { name: 'productName', label: 'Sanitaryware Description' },
                { name: 'plant', label: 'Plant Unit' },
                { name: 'grade', label: 'Quality Grade' },
                { name: 'batchNo', label: 'Batch No' },
                { name: 'color', label: 'Finish / Color' },
                { name: 'mrp', label: 'MRP (INR)' },
                { name: 'mfgDate', label: 'Mfg Date' }
            ],
            sampleData: {
                productCode: 'CW8820-WHT',
                productName: 'Wall Hung Water Closet Rimless Soft Close',
                plant: 'KBPL',
                grade: 'PREMIUM GRADE A',
                batchNo: 'BAT-2026-08',
                color: 'Alpine White (W)',
                mrp: '₹14,200.00',
                mfgDate: '2026-08'
            }
        },
        layout: {
            id: 'sanitaryware-master-carton',
            name: 'Sanitaryware Master Carton Label',
            targetEntity: 'sanitaryware',
            width: 100,
            height: 60,
            unit: 'mm',
            backgroundColor: '#ffffff',
            elements: [
                {
                    id: 'header-banner',
                    type: 'text',
                    x: 0,
                    y: 0,
                    w: 100,
                    h: 10,
                    content: 'KAJARIA SANITARYWARE • {{plant}}',
                    style: {
                        textAlign: 'center',
                        fontWeight: 'bold',
                        fontSize: 10,
                        color: '#ffffff',
                        backgroundColor: '#047857'
                    }
                },
                {
                    id: 'item-code',
                    type: 'text',
                    x: 4,
                    y: 13,
                    w: 60,
                    h: 8,
                    content: 'CODE: {{productCode}}',
                    style: {
                        textAlign: 'left',
                        fontWeight: 'bold',
                        fontSize: 13,
                        color: '#0f172a'
                    }
                },
                {
                    id: 'qr-cert',
                    type: 'qr',
                    x: 68,
                    y: 13,
                    w: 28,
                    h: 28,
                    content: 'ITEM:{{productCode}}|BATCH:{{batchNo}}|GRADE:{{grade}}'
                },
                {
                    id: 'item-name',
                    type: 'text',
                    x: 4,
                    y: 22,
                    w: 62,
                    h: 10,
                    content: '{{productName}}',
                    style: {
                        textAlign: 'left',
                        fontSize: 8,
                        color: '#334155'
                    }
                },
                {
                    id: 'item-meta',
                    type: 'text',
                    x: 4,
                    y: 33,
                    w: 62,
                    h: 6,
                    content: 'Color: {{color}} | Batch: {{batchNo}}',
                    style: {
                        textAlign: 'left',
                        fontSize: 7.5,
                        color: '#64748b'
                    }
                },
                {
                    id: 'grade-pill',
                    type: 'text',
                    x: 4,
                    y: 41,
                    w: 40,
                    h: 7,
                    content: '✓ {{grade}}',
                    style: {
                        textAlign: 'center',
                        fontWeight: 'bold',
                        fontSize: 7.5,
                        color: '#047857',
                        backgroundColor: '#ecfdf5'
                    }
                },
                {
                    id: 'mrp-pill',
                    type: 'text',
                    x: 48,
                    y: 41,
                    w: 48,
                    h: 7,
                    content: 'MRP: {{mrp}} (INCL. TAXES)',
                    style: {
                        textAlign: 'center',
                        fontWeight: 'bold',
                        fontSize: 7.5,
                        color: '#b91c1c',
                        backgroundColor: '#fef2f2'
                    }
                },
                {
                    id: 'barcode-unit',
                    type: 'barcode',
                    x: 4,
                    y: 50,
                    w: 92,
                    h: 8,
                    content: '{{productCode}}',
                    barcodeFormat: 'CODE128'
                }
            ]
        },
        sampleBatch: [
            { productCode: 'CW8820-WHT', productName: 'Wall Hung Water Closet Rimless Soft Close', plant: 'KBPL', grade: 'PREMIUM GRADE A', batchNo: 'BAT-2026-08', color: 'Alpine White (W)', mrp: '₹14,200.00', mfgDate: '2026-08' },
            { productCode: 'WB3002-MAT', productName: 'Table Top Ceramic Washbasin Rectangular', plant: 'KSPL', grade: 'PREMIUM GRADE A', batchNo: 'BAT-2026-07', color: 'Matte Black (MB)', mrp: '₹8,900.00', mfgDate: '2026-08' },
            { productCode: 'UR5501-SVR', productName: 'Sensor Integrated Ceramic Urinal', plant: 'KBPL', grade: 'HEAVY COMMERCIAL', batchNo: 'BAT-2026-06', color: 'Alpine White (W)', mrp: '₹18,500.00', mfgDate: '2026-08' }
        ]
    },

    // ──────────────────────────────────────────────────────────────────────────
    // 3. RETAIL PRICING & SHELF TAGS
    // ──────────────────────────────────────────────────────────────────────────
    {
        id: 'retail-price-tag',
        title: 'Retail Product & Price Barcode Tag',
        description: 'Retail shelf price tag with dynamic SKU barcode, quick-scan QR code, promotional price in INR, and product name.',
        category: 'Retail Pricing & Shelf Tags',
        categoryKey: 'retail',
        accessScope: ['admin', 'retail-associate', 'store-manager'],
        accessLevel: 'Retail Only',
        icon: '🏷️',
        schemaKey: 'product',
        defaultSheetPreset: 'a4-24up',
        schema: {
            label: 'Product Price Tag',
            fields: [
                { name: 'title', label: 'Product Name' },
                { name: 'sku', label: 'SKU / Barcode' },
                { name: 'price', label: 'Retail Price (₹)' },
                { name: 'origPrice', label: 'Original MRP (₹)' },
                { name: 'category', label: 'Category' },
                { name: 'store', label: 'Store / Showroom' }
            ],
            sampleData: {
                title: 'CeilingShower400mmx400mm(BrassRG)',
                sku: 'KA570027-RG',
                price: '₹21,250.00',
                origPrice: '₹21,250.00',
                category: 'faucet',
                store: 'KAJARIA BATHWARE'
            }
        },
        layout: {
            id: 'retail-price-tag',
            name: 'Retail Price & Barcode Tag',
            targetEntity: 'product',
            width: 70,
            height: 36,
            unit: 'mm',
            backgroundColor: '#ffffff',
            elements: [
                {
                    id: 'prod-title',
                    type: 'text',
                    x: 3,
                    y: 2,
                    w: 64,
                    h: 7,
                    content: '{{title}}',
                    style: {
                        textAlign: 'left',
                        fontWeight: 'bold',
                        fontSize: 8.5,
                        color: '#0f172a'
                    }
                },
                {
                    id: 'prod-category',
                    type: 'text',
                    x: 3,
                    y: 9,
                    w: 38,
                    h: 4,
                    content: 'Cat: {{category}} | {{store}}',
                    style: {
                        textAlign: 'left',
                        fontSize: 6,
                        color: '#64748b'
                    }
                },
                {
                    id: 'prod-price',
                    type: 'text',
                    x: 42,
                    y: 9,
                    w: 25,
                    h: 9,
                    content: '{{price}}',
                    style: {
                        textAlign: 'right',
                        fontWeight: 'bold',
                        fontSize: 13,
                        color: '#dc2626'
                    }
                },
                {
                    id: 'prod-orig',
                    type: 'text',
                    x: 42,
                    y: 18,
                    w: 25,
                    h: 4,
                    content: 'MRP {{origPrice}}',
                    style: {
                        textAlign: 'right',
                        fontSize: 6,
                        color: '#94a3b8'
                    }
                },
                {
                    id: 'prod-barcode',
                    type: 'barcode',
                    x: 3,
                    y: 14,
                    w: 36,
                    h: 14,
                    content: '{{sku}}',
                    barcodeFormat: 'CODE128'
                },
                {
                    id: 'prod-qr',
                    type: 'qr',
                    x: 52,
                    y: 22,
                    w: 15,
                    h: 12,
                    content: 'https://kajariabathware.in/p/{{sku}}'
                },
                {
                    id: 'prod-sku-text',
                    type: 'text',
                    x: 3,
                    y: 29,
                    w: 46,
                    h: 5,
                    content: 'SKU: {{sku}}',
                    style: {
                        textAlign: 'left',
                        fontSize: 6.5,
                        fontWeight: 'bold',
                        color: '#334155'
                    }
                }
            ]
        },
        sampleBatch: [
            { title: 'CeilingShower400mmx400mm(BrassRG)', sku: 'KA570027-RG', price: '₹21,250.00', origPrice: '₹21,250.00', category: 'faucet', store: 'KAJARIA BATHWARE' },
            { title: 'AURUM TOOL KIT', sku: 'AU/KIT', price: '₹500.00', origPrice: '₹500.00', category: 'faucet', store: 'KAJARIA BATHWARE' },
            { title: 'HOSE CHAIN 1.MTR -CG', sku: 'F-KA10000-CG', price: '₹840.00', origPrice: '₹840.00', category: 'faucet', store: 'KAJARIA BATHWARE' },
            { title: 'Single Lever Basin Mixer Tall Boy', sku: 'KA510044-CP', price: '₹4,950.00', origPrice: '₹5,500.00', category: 'faucet', store: 'KAJARIA BATHWARE' }
        ]
    },

    // ──────────────────────────────────────────────────────────────────────────
    // 4. LOGISTICS & SHIPPING
    // ──────────────────────────────────────────────────────────────────────────
    {
        id: 'shipping-label-thermal',
        title: 'Logistics & Shipping Parcel Label',
        description: 'Standard 4" × 6" thermal logistics label with tracking QR, destination routing barcode, and recipient addresses.',
        category: 'Logistics & Shipping',
        categoryKey: 'logistics',
        accessScope: ['admin', 'logistics-dispatcher', 'warehouse-supervisor'],
        accessLevel: 'Warehouse & Logistics',
        icon: '📦',
        schemaKey: 'shipping',
        defaultSheetPreset: 'thermal-4x6',
        schema: {
            label: 'Shipping Manifest',
            fields: [
                { name: 'trackingNumber', label: 'Tracking #' },
                { name: 'recipientName', label: 'Recipient Name' },
                { name: 'recipientAddress', label: 'Address' },
                { name: 'recipientCity', label: 'City/Zip' },
                { name: 'weight', label: 'Weight (kg)' },
                { name: 'serviceType', label: 'Service Level' },
                { name: 'hubCode', label: 'Sort Hub' },
            ],
            sampleData: {
                trackingNumber: 'TRK-984210984IN',
                recipientName: 'Vikas Kumar',
                recipientAddress: 'Plot 44, Okhla Phase III',
                recipientCity: 'New Delhi, DL 110020',
                weight: '4.85 kg',
                serviceType: 'EXPRESS PRIORITY',
                hubCode: 'DEL-04-A'
            }
        },
        layout: {
            id: 'shipping-label-thermal',
            name: 'Thermal Shipping Label 4x6',
            targetEntity: 'shipping',
            width: 101.6,
            height: 152.4,
            unit: 'mm',
            backgroundColor: '#ffffff',
            elements: [
                {
                    id: 'header-banner',
                    type: 'text',
                    x: 4,
                    y: 4,
                    w: 93.6,
                    h: 12,
                    content: 'GLOBAL LOGISTICS PRIORITY EXPRESS',
                    style: {
                        textAlign: 'center',
                        fontWeight: 'bold',
                        fontSize: 12,
                        color: '#ffffff',
                        backgroundColor: '#000000'
                    }
                },
                {
                    id: 'hub-box',
                    type: 'text',
                    x: 4,
                    y: 18,
                    w: 45,
                    h: 14,
                    content: 'HUB: {{hubCode}}\n{{serviceType}}',
                    style: {
                        textAlign: 'left',
                        fontWeight: 'bold',
                        fontSize: 10,
                        color: '#000000'
                    }
                },
                {
                    id: 'qr-routing',
                    type: 'qr',
                    x: 65,
                    y: 18,
                    w: 30,
                    h: 30,
                    content: 'TRK:{{trackingNumber}}|HUB:{{hubCode}}|SVC:{{serviceType}}'
                },
                {
                    id: 'weight-text',
                    type: 'text',
                    x: 4,
                    y: 34,
                    w: 45,
                    h: 8,
                    content: 'PKG WT: {{weight}}',
                    style: {
                        textAlign: 'left',
                        fontWeight: 'bold',
                        fontSize: 9,
                        color: '#000000'
                    }
                },
                {
                    id: 'ship-to-label',
                    type: 'text',
                    x: 4,
                    y: 50,
                    w: 93.6,
                    h: 6,
                    content: 'SHIP TO:',
                    style: {
                        textAlign: 'left',
                        fontWeight: 'bold',
                        fontSize: 8,
                        color: '#666666'
                    }
                },
                {
                    id: 'ship-to-data',
                    type: 'text',
                    x: 4,
                    y: 57,
                    w: 93.6,
                    h: 22,
                    content: '{{recipientName}}\n{{recipientAddress}}\n{{recipientCity}}',
                    style: {
                        textAlign: 'left',
                        fontWeight: 'bold',
                        fontSize: 13,
                        color: '#000000'
                    }
                },
                {
                    id: 'barcode-tracking',
                    type: 'barcode',
                    x: 6,
                    y: 85,
                    w: 89.6,
                    h: 35,
                    content: '{{trackingNumber}}',
                    barcodeFormat: 'CODE128'
                },
                {
                    id: 'tracking-digits',
                    type: 'text',
                    x: 4,
                    y: 124,
                    w: 93.6,
                    h: 8,
                    content: 'TRACKING #: {{trackingNumber}}',
                    style: {
                        textAlign: 'center',
                        fontWeight: 'bold',
                        fontSize: 11,
                        color: '#000000'
                    }
                }
            ]
        },
        sampleBatch: [
            { trackingNumber: 'TRK-984210984IN', recipientName: 'Vikas Kumar', recipientAddress: 'Plot 44, Okhla Phase III', recipientCity: 'New Delhi, DL 110020', weight: '4.85 kg', serviceType: 'EXPRESS PRIORITY', hubCode: 'DEL-04-A' },
            { trackingNumber: 'TRK-984210985IN', recipientName: 'Ananya Sharma', recipientAddress: '120 MG Road', recipientCity: 'Bengaluru, KA 560001', weight: '2.40 kg', serviceType: 'STANDARD GROUND', hubCode: 'BLR-02-B' }
        ]
    },

    // ──────────────────────────────────────────────────────────────────────────
    // 5. WAREHOUSE & INVENTORY
    // ──────────────────────────────────────────────────────────────────────────
    {
        id: 'warehouse-bin-tag',
        title: 'Warehouse Bin & Shelf Inventory Tag',
        description: 'High-contrast industrial rack sticker with large QR code for barcode scanners and forklift terminals.',
        category: 'Warehouse & Inventory',
        categoryKey: 'warehouse',
        accessScope: ['admin', 'warehouse-supervisor', 'inventory-clerk', 'plant-kspl', 'plant-kgpl', 'plant-kbpl'],
        accessLevel: 'Warehouse & Logistics',
        icon: '🏭',
        schemaKey: 'warehouse',
        defaultSheetPreset: 'a4-8up',
        schema: {
            label: 'Warehouse Bin',
            fields: [
                { name: 'locationCode', label: 'Bin / Rack Code' },
                { name: 'partNumber', label: 'Part Number' },
                { name: 'description', label: 'Item Description' },
                { name: 'zone', label: 'Warehouse Zone' },
                { name: 'minQty', label: 'Min Reorder Qty' }
            ],
            sampleData: {
                locationCode: 'LOC-KSPL-A-04-12',
                partNumber: 'PART-BW3007-EPDM',
                description: 'Black Bush Washer for Solenoid Valve EPDM',
                zone: 'ZONE A (FAST MOVING)',
                minQty: '500 PCS'
            }
        },
        layout: {
            id: 'warehouse-bin-tag',
            name: 'Warehouse Bin & Shelf Tag',
            targetEntity: 'warehouse',
            width: 100,
            height: 65,
            unit: 'mm',
            backgroundColor: '#ffffff',
            elements: [
                {
                    id: 'zone-header',
                    type: 'text',
                    x: 0,
                    y: 0,
                    w: 100,
                    h: 10,
                    content: '{{zone}}',
                    style: {
                        textAlign: 'center',
                        fontWeight: 'bold',
                        fontSize: 9,
                        color: '#000000',
                        backgroundColor: '#fbbf24'
                    }
                },
                {
                    id: 'loc-large',
                    type: 'text',
                    x: 4,
                    y: 12,
                    w: 55,
                    h: 14,
                    content: '{{locationCode}}',
                    style: {
                        textAlign: 'left',
                        fontWeight: 'bold',
                        fontSize: 16,
                        color: '#0f172a'
                    }
                },
                {
                    id: 'qr-scan',
                    type: 'qr',
                    x: 62,
                    y: 12,
                    w: 34,
                    h: 34,
                    content: 'LOC:{{locationCode}}|PART:{{partNumber}}'
                },
                {
                    id: 'part-no',
                    type: 'text',
                    x: 4,
                    y: 28,
                    w: 55,
                    h: 7,
                    content: 'PART: {{partNumber}}',
                    style: {
                        textAlign: 'left',
                        fontWeight: 'bold',
                        fontSize: 10,
                        color: '#4338ca'
                    }
                },
                {
                    id: 'item-desc',
                    type: 'text',
                    x: 4,
                    y: 36,
                    w: 55,
                    h: 12,
                    content: '{{description}}',
                    style: {
                        textAlign: 'left',
                        fontSize: 8,
                        color: '#334155'
                    }
                },
                {
                    id: 'min-qty',
                    type: 'text',
                    x: 4,
                    y: 50,
                    w: 55,
                    h: 6,
                    content: 'MIN REORDER: {{minQty}}',
                    style: {
                        textAlign: 'left',
                        fontWeight: 'bold',
                        fontSize: 8,
                        color: '#b91c1c'
                    }
                },
                {
                    id: 'barcode-loc',
                    type: 'barcode',
                    x: 4,
                    y: 57,
                    w: 92,
                    h: 7,
                    content: '{{locationCode}}',
                    barcodeFormat: 'CODE128'
                }
            ]
        },
        sampleBatch: [
            { locationCode: 'LOC-KSPL-A-04-12', partNumber: 'PART-BW3007-EPDM', description: 'Black Bush Washer for Solenoid Valve', zone: 'ZONE A (FAST MOVING)', minQty: '500 PCS' },
            { locationCode: 'LOC-KGPL-B-01-08', partNumber: 'PART-AU-KIT-50', description: 'Aurum Fitting Tool Kit Universal', zone: 'ZONE B (HARDWARE)', minQty: '100 KITS' }
        ]
    },

    // ──────────────────────────────────────────────────────────────────────────
    // 6. ASSET & EQUIPMENT
    // ──────────────────────────────────────────────────────────────────────────
    {
        id: 'asset-equipment-tag',
        title: 'IT Asset & Equipment Audit Tag',
        description: 'Durable hardware asset label with serial number barcode, asset QR link, inspection date, and department owner.',
        category: 'Asset & Equipment',
        categoryKey: 'asset',
        accessScope: ['admin', 'it-admin', 'maintenance-engineer', 'hr-security'],
        accessLevel: 'Admin & Security',
        icon: '💻',
        schemaKey: 'asset',
        defaultSheetPreset: 'a4-24up',
        schema: {
            label: 'Asset Tracking',
            fields: [
                { name: 'assetTag', label: 'Asset Tag #' },
                { name: 'serialNumber', label: 'Serial Number' },
                { name: 'model', label: 'Equipment Model' },
                { name: 'assignedTo', label: 'Assigned User / Unit' },
                { name: 'dept', label: 'Plant / Dept' },
                { name: 'auditDate', label: 'Audit Date' }
            ],
            sampleData: {
                assetTag: 'AST-KSPL-904',
                serialNumber: 'SN-ZBR-ZD421-098',
                model: 'Zebra ZD421 Industrial Thermal Printer',
                assignedTo: 'Packaging Line 02',
                dept: 'Plant KSPL',
                auditDate: '2026-08'
            }
        },
        layout: {
            id: 'asset-equipment-tag',
            name: 'IT Asset Tracking Tag',
            targetEntity: 'asset',
            width: 70,
            height: 36,
            unit: 'mm',
            backgroundColor: '#ffffff',
            elements: [
                {
                    id: 'asset-banner',
                    type: 'text',
                    x: 0,
                    y: 0,
                    w: 70,
                    h: 7,
                    content: 'ENTERPRISE ASSET • {{dept}}',
                    style: {
                        textAlign: 'center',
                        fontWeight: 'bold',
                        fontSize: 7,
                        color: '#ffffff',
                        backgroundColor: '#0f172a'
                    }
                },
                {
                    id: 'asset-qr',
                    type: 'qr',
                    x: 3,
                    y: 9,
                    w: 22,
                    h: 22,
                    content: 'https://asset.internal/item/{{assetTag}}'
                },
                {
                    id: 'asset-tag-txt',
                    type: 'text',
                    x: 27,
                    y: 9,
                    w: 40,
                    h: 5,
                    content: '{{assetTag}}',
                    style: {
                        textAlign: 'left',
                        fontWeight: 'bold',
                        fontSize: 9.5,
                        color: '#0f172a'
                    }
                },
                {
                    id: 'asset-model',
                    type: 'text',
                    x: 27,
                    y: 15,
                    w: 40,
                    h: 4,
                    content: 'Model: {{model}}',
                    style: {
                        textAlign: 'left',
                        fontSize: 6.5,
                        color: '#475569'
                    }
                },
                {
                    id: 'asset-user',
                    type: 'text',
                    x: 27,
                    y: 20,
                    w: 40,
                    h: 4,
                    content: 'Loc: {{assignedTo}}',
                    style: {
                        textAlign: 'left',
                        fontSize: 6.5,
                        color: '#475569'
                    }
                },
                {
                    id: 'asset-sn',
                    type: 'text',
                    x: 27,
                    y: 25,
                    w: 40,
                    h: 4,
                    content: 'S/N: {{serialNumber}}',
                    style: {
                        textAlign: 'left',
                        fontWeight: 'bold',
                        fontSize: 6.5,
                        color: '#334155'
                    }
                }
            ]
        },
        sampleBatch: [
            { assetTag: 'AST-KSPL-901', serialNumber: 'SN-ZBR-001', model: 'Zebra ZD421 Thermal Printer', assignedTo: 'Packaging Line 1', dept: 'Plant KSPL', auditDate: '2026-08' },
            { assetTag: 'AST-KGPL-902', serialNumber: 'SN-CNC-441', model: 'CNC Brass Lathe Terminal 4', assignedTo: 'Machine Shop', dept: 'Plant KGPL', auditDate: '2026-08' }
        ]
    },

    // ──────────────────────────────────────────────────────────────────────────
    // 7. BADGES & IDENTIFICATION
    // ──────────────────────────────────────────────────────────────────────────
    {
        id: 'employee-badge-std',
        title: 'Corporate Employee & Plant Operator ID Pass',
        description: 'Standard security identification card with QR code, employee ID, plant unit, designation, and blood group.',
        category: 'Badges & Identification',
        categoryKey: 'badges',
        accessScope: ['admin', 'hr-security', 'event-coordinator'],
        accessLevel: 'Admin & Security',
        icon: '🪪',
        schemaKey: 'employee',
        defaultSheetPreset: 'a4-10up',
        schema: {
            label: 'Employee Pass',
            fields: [
                { name: 'name', label: 'Full Name' },
                { name: 'employeeId', label: 'Employee ID' },
                { name: 'designation', label: 'Designation' },
                { name: 'department', label: 'Plant / Department' },
                { name: 'bloodGroup', label: 'Blood Group' },
                { name: 'company', label: 'Company Name' },
            ],
            sampleData: {
                name: 'Rajesh Sharma',
                employeeId: 'EMP-1001',
                designation: 'Senior Plant Engineer',
                department: 'Plant KSPL (Operations)',
                bloodGroup: 'O+',
                company: 'KAJARIA SANITARYWARE'
            }
        },
        layout: {
            id: 'employee-badge-std',
            name: 'Corporate Employee Badge',
            targetEntity: 'employee',
            width: 90,
            height: 55,
            unit: 'mm',
            backgroundColor: '#ffffff',
            elements: [
                {
                    id: 'header-bg',
                    type: 'text',
                    x: 0,
                    y: 0,
                    w: 90,
                    h: 11,
                    content: '{{company}}',
                    style: {
                        textAlign: 'center',
                        fontWeight: 'bold',
                        fontSize: 10,
                        color: '#ffffff',
                        backgroundColor: '#1e293b'
                    }
                },
                {
                    id: 'qr-code',
                    type: 'qr',
                    x: 6,
                    y: 16,
                    w: 26,
                    h: 26,
                    content: 'ID: {{employeeId}} | Name: {{name}} | Dept: {{department}}'
                },
                {
                    id: 'emp-name',
                    type: 'text',
                    x: 36,
                    y: 16,
                    w: 50,
                    h: 7,
                    content: '{{name}}',
                    style: {
                        textAlign: 'left',
                        fontWeight: 'bold',
                        fontSize: 11,
                        color: '#0f172a'
                    }
                },
                {
                    id: 'emp-title',
                    type: 'text',
                    x: 36,
                    y: 24,
                    w: 50,
                    h: 6,
                    content: '{{designation}}',
                    style: {
                        textAlign: 'left',
                        fontWeight: 'normal',
                        fontSize: 8.5,
                        color: '#6366f1'
                    }
                },
                {
                    id: 'emp-dept',
                    type: 'text',
                    x: 36,
                    y: 31,
                    w: 50,
                    h: 5,
                    content: 'Dept: {{department}}',
                    style: {
                        textAlign: 'left',
                        fontSize: 7.5,
                        color: '#475569'
                    }
                },
                {
                    id: 'emp-id',
                    type: 'text',
                    x: 36,
                    y: 37,
                    w: 25,
                    h: 5,
                    content: 'ID: {{employeeId}}',
                    style: {
                        textAlign: 'left',
                        fontWeight: 'bold',
                        fontSize: 7.5,
                        color: '#334155'
                    }
                },
                {
                    id: 'emp-blood',
                    type: 'text',
                    x: 62,
                    y: 37,
                    w: 24,
                    h: 5,
                    content: 'Blood: {{bloodGroup}}',
                    style: {
                        textAlign: 'left',
                        fontSize: 7.5,
                        color: '#dc2626'
                    }
                }
            ]
        },
        sampleBatch: [
            { name: 'Rajesh Sharma', employeeId: 'EMP-1001', designation: 'Senior Plant Engineer', department: 'Plant KSPL (Operations)', bloodGroup: 'O+', company: 'KAJARIA SANITARYWARE' },
            { name: 'Priya Patel', employeeId: 'EMP-1004', designation: 'Quality Control Lead', department: 'Plant KGPL (QC)', bloodGroup: 'AB+', company: 'KAJARIA SANITARYWARE' }
        ]
    }
];
