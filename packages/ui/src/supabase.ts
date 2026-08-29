import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ProductRecord, SerializedUnit } from './dashboard/product-manager';
import type { BatchRecord } from './dashboard/batch-manager';
import type { EmployeeRecord } from './dashboard/employee-manager';
import type { PrebuiltTemplate } from './dashboard/templates-data';
import type { MasterDataOption, MasterDataType } from './dashboard/master-data';
import type { CompanyProfile } from './dashboard/branding';

export type UserRole = 'admin' | 'designer' | 'user';

export interface UserProfile {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    allowedTemplateCategories: string[]; // e.g. ['All'] or ['Badges', 'Retail']
    allowedPlants: string[];             // e.g. ['KSPL'] or ['All'] or ['KSPL','KGPL']
    isActive: boolean;
    createdAt: string;
    password?: string;      // legacy plaintext — only used for back-compat reads
    passwordHash?: string;  // SHA-256 hash, used for online/local login
}

export interface SupabaseConfig {
    url: string;
    anonKey: string;
    enabled: boolean;
}

// Build-time configuration (set via Vite env vars / Coolify build args).
// Values are baked into the static bundle. In-app Settings → API overrides these.
const ENV: any = (import.meta as any)?.env || {};

const DEFAULT_CONFIG: SupabaseConfig = {
    url: ENV.VITE_SUPABASE_URL || 'https://supabase2.kajariabathware.in',
    anonKey: ENV.VITE_SUPABASE_ANON_KEY || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4NzQ4MDg4MCwiZXhwIjo0OTQzMTU0NDgwLCJyb2xlIjoiYW5vbiJ9.o7JoSXeLTJOORJGAs_qjjChKNTHPl9c-1UBb5R1fFGs',
    enabled: ENV.VITE_SUPABASE_ENABLED !== 'false'
};

const STORAGE_KEY_CONFIG = 'qrlayout_supabase_config';
const STORAGE_KEY_PROFILES = 'qrlayout_user_profiles';
const STORAGE_KEY_CURRENT_USER = 'qrlayout_active_user_session';

// No baked-in accounts. The first Supabase user to register becomes the
// bootstrap admin (see schema.sql -> handle_new_user). Every other signup is
// 'user', and roles can only be granted by an admin through the secure
// `upsert_user_profile` RPC. NO credentials are ever embedded in source.
const DEFAULT_USERS: UserProfile[] = [];

export class SupabaseService {
    private client: SupabaseClient | null = null;
    private config: SupabaseConfig;
    private currentUserProfile: UserProfile | null = null;
    // Kept ONLY in-memory for re-authenticating the operator after a signUp
    // (which switches the client session). Never persisted to storage.
    private sessionPassword: string | null = null;

    constructor() {
        this.config = this.loadConfig();
        this.initClient();
        this.loadSession();
    }

    public getConfig(): SupabaseConfig {
        return { ...this.config };
    }

    public saveConfig(config: Partial<SupabaseConfig>) {
        this.config = { ...this.config, ...config };
        localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(this.config));
        this.initClient();
    }

    private loadConfig(): SupabaseConfig {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
            if (raw) {
                return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
            }
        } catch (e) {
            console.warn('Failed to parse saved Supabase config, using defaults', e);
        }
        return { ...DEFAULT_CONFIG };
    }

    private initClient() {
        if (this.config.enabled && this.config.url && this.config.anonKey) {
            try {
                this.client = createClient(this.config.url, this.config.anonKey, {
                    auth: {
                        persistSession: true,
                        autoRefreshToken: true
                    }
                });
            } catch (e) {
                console.error('Failed to initialize Supabase client', e);
                this.client = null;
            }
        } else {
            this.client = null;
        }
    }

    public get isConnected(): boolean {
        return this.client !== null && this.config.enabled;
    }

    public async testConnection(): Promise<{ success: boolean; message: string }> {
        if (!this.client) {
            return { success: false, message: 'Supabase client is not configured or disabled.' };
        }
        try {
            const { error } = await this.client.from('products').select('id').limit(1);
            if (error) {
                if (error.code === '42P01' || error.message.includes('relation "public.products" does not exist')) {
                    return {
                        success: true,
                        message: 'Connected to Supabase! (Note: "products" table not created yet. Please execute the SQL table schema).'
                    };
                }
                return { success: false, message: `Supabase Error: ${error.message} (${error.code || 'UNKNOWN'})` };
            }
            return { success: true, message: 'Successfully connected to Supabase database!' };
        } catch (err: any) {
            return { success: false, message: err.message || 'Connection failed' };
        }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // AUTHENTICATION & USER SESSIONS
    // ════════════════════════════════════════════════════════════════════════════
    public getCurrentUser(): UserProfile | null {
        return this.currentUserProfile;
    }

    private loadSession() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_CURRENT_USER);
            if (raw) {
                this.currentUserProfile = JSON.parse(raw);
            }
        } catch (e) {
            this.currentUserProfile = null;
        }
    }

    public setCurrentUserSession(profile: UserProfile | null) {
        this.currentUserProfile = profile;
        if (profile) {
            localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(profile));
        } else {
            localStorage.removeItem(STORAGE_KEY_CURRENT_USER);
        }
    }

    public async login(email: string, password: string): Promise<{ success: boolean; profile?: UserProfile; message?: string }> {
        const cleanEmail = email.trim().toLowerCase();

        // 1. Establish a real Supabase Auth session so every DB operation
        //    runs as an authenticated user (passes RLS).
        if (this.client && this.config.enabled) {
            let signIn = await this.trySignIn(cleanEmail, password);

            // 2. Bootstrap: only when the database has NO profiles yet, the
            //    first person to sign in can register their own admin account.
            //    Accounts are never created for a hardcoded address.
            if (!signIn.profile && signIn.reason && /invalid login credentials|invalid_grant|user not found|user already registered|email not confirmed/i.test(signIn.reason)) {
                if (await this.needsBootstrap()) {
                    await this.createBootstrapAdmin(cleanEmail, password);
                    signIn = await this.trySignIn(cleanEmail, password);
                }
            }

            if (signIn.profile) {
                return { success: true, profile: signIn.profile };
            }

            // Surface auth-level failures instead of silently falling back to local
            // (which would leave the client unauthenticated and break RLS reads/writes).
            if (signIn.reason && /not confirmed|email_not_confirmed/i.test(signIn.reason)) {
                return {
                    success: false,
                    message: 'Your account is not confirmed yet. Please contact your administrator.'
                };
            }
        }

        // 3. Offline / local-profile fallback (no Supabase configured or unreachable)
        const profiles = this.getLocalProfiles();
        const found = profiles.find(p => p.email.toLowerCase() === cleanEmail);

        if (found) {
            if (!found.isActive) {
                return { success: false, message: 'Your account has been deactivated. Please contact an Administrator.' };
            }
            const ok = await this.verifyPassword(password, found);
            if (!ok) {
                return { success: false, message: 'Invalid password. Please check your credentials.' };
            }
            this.sessionPassword = password;
            this.setCurrentUserSession(found);
            return { success: true, profile: found };
        }

        return { success: false, message: 'Invalid email or password. Please check your credentials.' };
    }

    /** True when the user_profiles table is empty (used once for first-admin bootstrap). */
    private async needsBootstrap(): Promise<boolean> {
        if (!this.client || !this.config.enabled) return false;
        try {
            const { data, error } = await this.client.rpc('is_bootstrap_needed');
            if (error) return false;
            return data === true;
        } catch {
            return false;
        }
    }

    /** Registers the first account; the signup trigger promotes it to admin. */
    private async createBootstrapAdmin(email: string, password: string): Promise<void> {
        try {
            await this.client!.auth.signUp({
                email,
                password,
                options: {
                    data: { full_name: email.split('@')[0], role: 'admin' }
                }
            });
        } catch (err: any) {
            console.warn('Bootstrap admin signup error:', err?.message || err);
        }
    }

    private async verifyPassword(password: string, profile: UserProfile): Promise<boolean> {
        // New secure store: SHA-256 hash (never plaintext).
        if (profile.passwordHash) {
            return profile.passwordHash === (await this.hashPassword(password));
        }
        // Backward-compat: leftover plaintext entries from earlier versions.
        if (profile.password !== undefined) {
            return profile.password === password;
        }
        // No stored credential -> cannot verify locally.
        return false;
    }

    private async hashPassword(password: string): Promise<string> {
        try {
            if (typeof crypto !== 'undefined' && crypto.subtle) {
                const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
                return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
            }
        } catch { /* fall through to legacy string */ }
        // Non-secure fallback (no WebCrypto available in this environment).
        let h = 0;
        for (let i = 0; i < password.length; i++) { h = (h << 5) - h + password.charCodeAt(i); h |= 0; }
        return 'x' + (h >>> 0).toString(16);
    }

    private async trySignIn(email: string, password: string): Promise<{ ok: boolean; profile?: UserProfile; reason?: string }> {
        try {
            const { data, error } = await this.client!.auth.signInWithPassword({ email, password });
            if (error) {
                return { ok: false, reason: error.message };
            }
            if (data?.user) {
                this.sessionPassword = password;
                const profile = await this.resolveProfileForAuthUser(data.user, email);
                this.setCurrentUserSession(profile);
                return { ok: true, profile };
            }
            return { ok: false, reason: 'No user returned' };
        } catch (err: any) {
            console.warn('Supabase auth network error:', err?.message || err);
            return { ok: false, reason: err?.message || 'network error' };
        }
    }

    /** Resolve a full UserProfile for an authenticated auth user, ensuring a row exists. */
    private async resolveProfileForAuthUser(user: any, email: string): Promise<UserProfile> {
        // Prefer the user_profiles row (kept in sync by the signup trigger / createUser).
        const row = await this.fetchProfileRowById(user.id);
        if (row) {
            const profile: UserProfile = {
                id: row.id,
                email: row.email,
                fullName: row.full_name || email.split('@')[0],
                role: (row.role as UserRole) || 'user',
                allowedTemplateCategories: row.allowed_template_categories || ['All'],
                allowedPlants: row.allowed_plants || ['All'],
                isActive: row.is_active ?? true,
                createdAt: row.created_at || new Date().toISOString()
            };
            this.saveLocalProfiles(this.getLocalProfiles().map(p => p.email === email ? { ...p, ...profile } : p));
            return profile;
        }

        // No row yet — build from the auth user's metadata and persist one.
        const meta = user.user_metadata || {};
        const profile: UserProfile = {
            id: user.id,
            email,
            fullName: meta.full_name || email.split('@')[0],
            role: 'user',
            allowedTemplateCategories: ['All'],
            allowedPlants: ['All'],
            isActive: true,
            createdAt: user.created_at ? new Date(user.created_at).toISOString() : new Date().toISOString()
        };

        try {
            await this.client!.rpc('upsert_user_profile', { p: this.toProfilePayload(profile) });
        } catch (e: any) {
            console.warn('resolveProfile user_profiles upsert notice:', e?.message || e);
        }

        const local = this.getLocalProfiles().filter(p => p.email !== email);
        local.unshift(profile);
        this.saveLocalProfiles(local);
        return profile;
    }

    private async fetchProfileRowById(id: string): Promise<any | null> {
        if (!this.client || !this.config.enabled) return null;
        try {
            const { data, error } = await this.client.from('user_profiles').select('*').eq('id', id).maybeSingle();
            if (error) return null;
            return data ?? null;
        } catch {
            return null;
        }
    }

    public async logout(): Promise<void> {
        if (this.client && this.config.enabled) {
            try {
                await this.client.auth.signOut();
            } catch (e) {
                console.warn('Supabase signout notice', e);
            }
        }
        this.sessionPassword = null;
        this.setCurrentUserSession(null);
    }

    /** Convert a UserProfile into the JSON payload expected by upsert_user_profile. */
    private toProfilePayload(profile: UserProfile): Record<string, any> {
        return {
            id: profile.id,
            email: profile.email,
            full_name: profile.fullName,
            role: profile.role,
            allowed_template_categories: profile.allowedTemplateCategories || ['All'],
            allowed_plants: profile.allowedPlants || ['All'],
            is_active: profile.isActive,
            created_at: profile.createdAt
        };
    }

    // ════════════════════════════════════════════════════════════════════════════
    // USER PROFILES MANAGEMENT (ADMIN)
    // ════════════════════════════════════════════════════════════════════════════
    public getLocalProfiles(): UserProfile[] {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_PROFILES);
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return DEFAULT_USERS;
    }

    private saveLocalProfiles(profiles: UserProfile[]) {
        try {
            localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(profiles));
        } catch (e) {}
    }

    public async fetchUserProfiles(): Promise<UserProfile[]> {
        if (this.client && this.config.enabled) {
            try {
                const { data, error } = await this.client
                    .from('user_profiles')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (!error && data && data.length > 0) {
                    const mapped: UserProfile[] = data.map((r: any) => ({
                        id: r.id,
                        email: r.email,
                        fullName: r.full_name || r.fullName || 'User',
                        role: (r.role as UserRole) || 'user',
                        allowedTemplateCategories: r.allowed_template_categories || ['All'],
                        allowedPlants: r.allowed_plants || ['All'],
                        isActive: r.is_active ?? true,
                        createdAt: r.created_at || new Date().toISOString()
                    }));
                    this.saveLocalProfiles(mapped);
                    return mapped;
                }
            } catch (e) {
                console.warn('Supabase fetchUserProfiles fallback to local', e);
            }
        }
        return this.getLocalProfiles();
    }

    private async fetchUserProfileById(id: string, email: string): Promise<UserProfile> {
        if (this.client && this.config.enabled) {
            try {
                const { data } = await this.client
                    .from('user_profiles')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (data) {
                    return {
                        id: data.id,
                        email: data.email,
                        fullName: data.full_name || email.split('@')[0],
                        role: data.role || 'user',
                        allowedTemplateCategories: data.allowed_template_categories || ['All'],
                        allowedPlants: data.allowed_plants || ['All'],
                        isActive: data.is_active ?? true,
                        createdAt: data.created_at || new Date().toISOString()
                    };
                }
            } catch (e) {}
        }

        const local = this.getLocalProfiles().find(p => p.email.toLowerCase() === email.toLowerCase());
        if (local) return local;

        return {
            id: id || `usr-${Date.now()}`,
            email: email,
            fullName: email.split('@')[0],
            role: 'user',
            allowedTemplateCategories: ['All'],
            allowedPlants: ['All'],
            isActive: true,
            createdAt: new Date().toISOString()
        };
    }

    public async createUser(profile: UserProfile, password?: string): Promise<{ success: boolean; message?: string }> {
        const online = this.client !== null && this.config.enabled;

        // 1. Create in Supabase Auth if client online and password provided
        if (online && password) {
            try {
                const { data, error } = await this.client!.auth.signUp({
                    email: profile.email,
                    password: password,
                    options: {
                        data: {
                            full_name: profile.fullName,
                            role: profile.role
                        }
                    }
                });

                if (error) {
                    return { success: false, message: `Supabase signup failed: ${error.message}` };
                }

                if (data?.user?.id) {
                    profile.id = data.user.id;
                } else {
                    return {
                        success: false,
                        message: 'Supabase signup returned no user. Enable "auto-confirm" (Authentication → Email → Confirm email = OFF) and try again.'
                    };
                }
            } catch (err: any) {
                console.warn('Supabase signUp error:', err?.message || err);
                return { success: false, message: `Supabase signup error: ${err?.message || err}` };
            }
        }

        // 2. Save locally (password stored as a SHA-256 hash — never plaintext)
        const profiles = this.getLocalProfiles().filter(p => p.id !== profile.id && p.email !== profile.email);
        const storedProfile: UserProfile = { ...profile };
        if (password) {
            storedProfile.passwordHash = await this.hashPassword(password);
        }
        delete storedProfile.password;
        profiles.unshift(storedProfile);
        this.saveLocalProfiles(profiles);

        // 4. The signUp step switched the client session to the newly-created user.
        //    Restore the current operator's Supabase session so the profile row can
        //    be written (and the intended role applied) as the ADMIN.
        await this.restoreCurrentSession();

        // 5. Persist the profile row via the admin-gated RPC so the requested role sticks.
        if (online) {
            try {
                const { error } = await this.client!.rpc('upsert_user_profile', { p: this.toProfilePayload(profile) });
                if (error) {
                    console.warn('Supabase createUser profile RPC error:', error.message);
                }
            } catch (e: any) {
                console.warn('Supabase createUser profile RPC error:', e?.message || e);
            }
        }

        return {
            success: true,
            message: online ? 'User created in Supabase Auth and synced locally.' : 'User created locally (Supabase not configured).'
        };
    }

    /** Re-authenticate the local session user so the shared client stays as them. */
    private async restoreCurrentSession(): Promise<void> {
        const current = this.currentUserProfile;
        if (!current || !this.client || !this.config.enabled) return;
        const storedPassword = this.sessionPassword;
        if (!storedPassword) return;
        try {
            await this.client.auth.signInWithPassword({
                email: current.email,
                password: storedPassword
            });
        } catch (err: any) {
            console.warn('Session restore notice (non-fatal):', err?.message || err);
        }
    }

    public async updateUser(profile: UserProfile): Promise<boolean> {
        if (this.client && this.config.enabled) {
            try {
                const { error } = await this.client.rpc('upsert_user_profile', { p: this.toProfilePayload(profile) });
                if (error) console.warn('Supabase updateUser RPC error:', error.message);
            } catch (e) {}
        }

        const profiles = this.getLocalProfiles().map(p => p.id === profile.id ? { ...p, ...profile } : p);
        this.saveLocalProfiles(profiles);

        // If updating the active user session, update local storage
        if (this.currentUserProfile && this.currentUserProfile.id === profile.id) {
            this.setCurrentUserSession(profile);
        }

        return true;
    }

    public async deleteUser(id: string): Promise<boolean> {
        if (this.client && this.config.enabled) {
            try {
                await this.client.from('user_profiles').delete().eq('id', id);
            } catch (e) {}
        }

        const profiles = this.getLocalProfiles().filter(p => p.id !== id);
        this.saveLocalProfiles(profiles);
        return true;
    }

    // ════════════════════════════════════════════════════════════════════════════
    // PRODUCTS SYNC
    // ════════════════════════════════════════════════════════════════════════════
    public async fetchProducts(): Promise<ProductRecord[] | null> {
        if (!this.client || !this.config.enabled) return null;
        try {
            const { data, error } = await this.client
                .from('products')
                .select('*')
                .order('created_at', { ascending: false });



            if (error) {
                console.warn('Supabase fetchProducts error:', error.message);
                return null;
            }

            return (data || []).map((row: any): ProductRecord => ({
                id: row.id,
                sku: row.sku || '',
                title: row.title || row.name || 'Untitled Product',
                category: row.category || 'General',
                plant: row.plant || 'KSPL',
                group: row.group || row.group_name || 'Bathware',
                color: row.color || 'CP',
                warranty: row.warranty || '5 Years',
                dp: row.dp !== undefined && row.dp !== null ? row.dp : 0,
                mrp: row.mrp !== undefined && row.mrp !== null ? row.mrp : 0,
                price: row.price || '₹0.00',
                origPrice: row.orig_price || row.price || '₹0.00',
                description: row.description || '',
                serialPrefix: row.serial_prefix || 'SN-',
                nextSerialSequence: Number(row.next_serial_sequence || 1001),
                serialPadding: Number(row.serial_padding || 5),
                variables: row.variables || [],
                defaultVariables: row.default_variables || {},
                createdAt: row.created_at || new Date().toISOString()
            }));
        } catch (e) {
            console.error('Error fetching products from Supabase', e);
            return null;
        }
    }

    public async saveProduct(product: ProductRecord): Promise<boolean> {
        if (!this.client || !this.config.enabled) return false;
        try {
            const by = this.currentUserProfile?.email || this.currentUserProfile?.id || null;
            const row = {
                id: product.id,
                sku: product.sku,
                title: product.title,
                category: product.category,
                plant: product.plant || 'KSPL',
                group_name: product.group || 'Bathware',
                color: product.color || 'CP',
                warranty: product.warranty || '5 Years',
                dp: typeof product.dp === 'number' ? product.dp : parseFloat(String(product.dp).replace(/[^0-9.-]+/g, '')) || 0,
                mrp: typeof product.mrp === 'number' ? product.mrp : parseFloat(String(product.mrp || product.price).replace(/[^0-9.-]+/g, '')) || 0,
                price: product.price || '₹0.00',
                orig_price: product.origPrice || product.price || '₹0.00',
                description: product.description || '',
                serial_prefix: product.serialPrefix,
                next_serial_sequence: product.nextSerialSequence,
                serial_padding: product.serialPadding,
                variables: product.variables,
                default_variables: product.defaultVariables,
                created_by: by,
                updated_by: by,
                created_at: product.createdAt,
                updated_at: new Date().toISOString()
            };

            const { error } = await this.client.from('products').upsert(row);
            if (error) {
                console.error('Supabase saveProduct error:', error.message);
                return false;
            }
            return true;
        } catch (e) {
            console.error('Error saving product to Supabase', e);
            return false;
        }
    }

    public async saveProductsBulk(products: ProductRecord[]): Promise<boolean> {
        if (!this.client || !this.config.enabled || products.length === 0) return false;
        try {
            const by = this.currentUserProfile?.email || this.currentUserProfile?.id || null;
            const now = new Date().toISOString();
            const rows = products.map(product => ({
                id: product.id,
                sku: product.sku,
                title: product.title,
                category: product.category || 'General',
                plant: product.plant || 'KSPL',
                group_name: product.group || 'Bathware',
                color: product.color || 'CP',
                warranty: product.warranty || '5 Years',
                dp: typeof product.dp === 'number' ? product.dp : parseFloat(String(product.dp).replace(/[^0-9.-]+/g, '')) || 0,
                mrp: typeof product.mrp === 'number' ? product.mrp : parseFloat(String(product.mrp || product.price).replace(/[^0-9.-]+/g, '')) || 0,
                price: product.price || '₹0.00',
                orig_price: product.origPrice || product.price || '₹0.00',
                description: product.description || '',
                serial_prefix: product.serialPrefix || 'SN-',
                next_serial_sequence: product.nextSerialSequence || 1001,
                serial_padding: product.serialPadding || 5,
                variables: product.variables || [],
                default_variables: product.defaultVariables || {},
                created_by: by,
                updated_by: by,
                created_at: product.createdAt || now,
                updated_at: now
            }));

            // Chunk upsert in batches of 100
            for (let i = 0; i < rows.length; i += 100) {
                const chunk = rows.slice(i, i + 100);
                const { error } = await this.client.from('products').upsert(chunk);
                if (error) {
                    console.error('Supabase saveProductsBulk error:', error.message);
                    return false;
                }
            }
            return true;
        } catch (e) {
            console.error('Error saving products bulk to Supabase', e);
            return false;
        }
    }

    public async deleteProduct(id: string): Promise<boolean> {
        if (!this.client || !this.config.enabled) return false;
        try {
            const { error } = await this.client.from('products').delete().eq('id', id);
            return !error;
        } catch (e) {
            return false;
        }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // SERIALIZED UNITS SYNC
    // ════════════════════════════════════════════════════════════════════════════
    public async fetchSerials(): Promise<SerializedUnit[] | null> {
        if (!this.client || !this.config.enabled) return null;
        try {
            const { data, error } = await this.client
                .from('serialized_units')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.warn('Supabase fetchSerials error:', error.message);
                return null;
            }

            return (data || []).map((row: any): SerializedUnit => ({
                id: row.id,
                serialNumber: row.serial_number,
                productId: row.product_id,
                sku: row.sku || '',
                productTitle: row.product_title || '',
                price: row.price || '',
                dp: row.dp || '',
                mrp: row.mrp || '',
                category: row.category || '',
                plant: row.plant || '',
                group: row.group || row.group_name || '',
                color: row.color || '',
                warranty: row.warranty || '',
                variables: row.variables || {},
                createdAt: row.created_at || new Date().toISOString(),
                status: row.status as any || 'In Stock',
                lastPrintedAt: row.last_printed_at || null,
                printCount: Number(row.print_count || 0),
                batchNumber: row.batch_number || '' as any
            }));
        } catch (e) {
            console.error('Error fetching serials from Supabase', e);
            return null;
        }
    }

    public async saveSerial(serial: SerializedUnit): Promise<boolean> {
        if (!this.client || !this.config.enabled) return false;
        try {
            const by = this.currentUserProfile?.email || this.currentUserProfile?.id || null;
            const row = {
                id: serial.id,
                serial_number: serial.serialNumber,
                product_id: serial.productId,
                sku: serial.sku,
                product_title: serial.productTitle,
                price: serial.price,
                dp: serial.dp || '',
                mrp: serial.mrp || '',
                category: serial.category,
                plant: serial.plant || '',
                group_name: serial.group || '',
                color: serial.color || '',
                warranty: serial.warranty || '',
                variables: serial.variables,
                status: serial.status,
                last_printed_at: serial.lastPrintedAt,
                print_count: serial.printCount,
                batch_number: (serial as any).batchNumber || '',
                created_by: by,
                updated_by: by,
                created_at: serial.createdAt,
                updated_at: new Date().toISOString()
            };

            const { error } = await this.client.from('serialized_units').upsert(row);
            if (error) {
                console.error('Supabase saveSerial error:', error.message);
                return false;
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    public async batchSaveSerials(serials: SerializedUnit[]): Promise<boolean> {
        if (!this.client || !this.config.enabled || serials.length === 0) return false;
        try {
            const by = this.currentUserProfile?.email || this.currentUserProfile?.id || null;
            const rows = serials.map(serial => ({
                id: serial.id,
                serial_number: serial.serialNumber,
                product_id: serial.productId,
                sku: serial.sku,
                product_title: serial.productTitle,
                price: serial.price,
                dp: serial.dp || '',
                mrp: serial.mrp || '',
                category: serial.category,
                plant: serial.plant || '',
                group_name: serial.group || '',
                color: serial.color || '',
                warranty: serial.warranty || '',
                variables: serial.variables,
                status: serial.status,
                last_printed_at: serial.lastPrintedAt,
                print_count: serial.printCount,
                batch_number: (serial as any).batchNumber || '',
                created_by: by,
                updated_by: by,
                created_at: serial.createdAt,
                updated_at: new Date().toISOString()
            }));

            const { error } = await this.client.from('serialized_units').upsert(rows);
            return !error;
        } catch (e) {
            return false;
        }
    }

    public async deleteSerial(id: string): Promise<boolean> {
        if (!this.client || !this.config.enabled) return false;
        try {
            const { error } = await this.client.from('serialized_units').delete().eq('id', id);
            return !error;
        } catch (e) {
            return false;
        }
    }

    // ── Production batches (batch ⇄ serials ⇄ product mapping) ───────────────
    public async fetchBatches(): Promise<BatchRecord[] | null> {
        if (!this.client || !this.config.enabled) return null;
        try {
            const { data, error } = await this.client
                .from('batches')
                .select('*')
                .order('generated_at', { ascending: false });
            if (error) { console.warn('Supabase fetchBatches error:', error.message); return null; }

            return (data || []).map((r: any): BatchRecord => ({
                id: r.id,
                batchNumber: r.batch_number,
                productId: r.product_id || undefined,
                sku: r.sku || '',
                productTitle: r.product_title || '',
                plant: r.plant || 'KSPL',
                mfgDate: r.mfg_date || '',
                expDate: '',
                lotQuantity: Number(r.lot_quantity || 0),
                shift: r.shift || 'General',
                status: r.status as any || 'Approved',
                createdAt: r.generated_at || r.created_at || new Date().toISOString(),
                printCount: 0
            }));
        } catch (e) {
            console.error('Error fetching batches', e);
            return null;
        }
    }

    public async saveBatch(batch: BatchRecord): Promise<boolean> {
        if (!this.client || !this.config.enabled) return false;
        const by = this.currentUserProfile?.email || this.currentUserProfile?.id || null;
        try {
            const { error } = await this.client.from('batches').upsert({
                id: batch.id,
                batch_number: batch.batchNumber,
                product_id: batch.productId || '',
                sku: batch.sku,
                product_title: batch.productTitle,
                plant: batch.plant || 'KSPL',
                lot_quantity: batch.lotQuantity || 0,
                mfg_date: batch.mfgDate || '',
                shift: batch.shift || 'General',
                status: batch.status || 'Approved',
                generated_at: batch.createdAt || new Date().toISOString(),
                created_by: by,
                updated_by: by,
                updated_at: new Date().toISOString()
            });
            return !error;
        } catch (e: any) {
            console.warn('Supabase saveBatch error:', e?.message || e);
            return false;
        }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // EMPLOYEES & BADGES SYNC
    // ════════════════════════════════════════════════════════════════════════════
    public async fetchEmployees(): Promise<EmployeeRecord[] | null> {
        if (!this.client || !this.config.enabled) return null;
        try {
            const { data, error } = await this.client
                .from('employees')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.warn('Supabase fetchEmployees error, falling back to local storage:', error.message);
                return null;
            }

            return (data || []).map((row: any): EmployeeRecord => ({
                id: row.id,
                employeeId: row.employee_id || row.id,
                name: row.name,
                designation: row.designation || row.role || '',
                department: row.department || '',
                company: row.company || 'Kajaria Bathware',
                bloodGroup: row.blood_group || '',
                joinDate: row.join_date || '',
                email: row.email || '',
                phone: row.phone || '',
                accessTier: row.access_tier as any || 'Standard',
                rfidBadgeUid: row.rfid_badge_uid || row.rfid_tag || '',
                variables: row.variables || {},
                badgeStatus: row.badge_status || 'Active',
                lastPrintedAt: row.last_printed_at || null,
                printCount: Number(row.print_count || 0),
                createdAt: row.created_at || new Date().toISOString()
            }));
        } catch (e) {
            console.error('Error fetching employees from Supabase', e);
            return null;
        }
    }

    public async saveEmployee(emp: EmployeeRecord): Promise<boolean> {
        if (!this.client || !this.config.enabled) return false;
        try {
            const row = {
                id: emp.id,
                employee_id: emp.employeeId,
                name: emp.name,
                designation: emp.designation,
                department: emp.department,
                company: emp.company,
                blood_group: emp.bloodGroup,
                join_date: emp.joinDate,
                email: emp.email,
                phone: emp.phone,
                access_tier: emp.accessTier,
                rfid_badge_uid: emp.rfidBadgeUid,
                variables: emp.variables,
                badge_status: emp.badgeStatus,
                last_printed_at: emp.lastPrintedAt,
                print_count: emp.printCount,
                created_at: emp.createdAt,
                updated_at: new Date().toISOString()
            };

            const { error } = await this.client.from('employees').upsert(row);
            return !error;
        } catch (e) {
            return false;
        }
    }

    public async deleteEmployee(id: string): Promise<boolean> {
        if (!this.client || !this.config.enabled) return false;
        try {
            const { error } = await this.client.from('employees').delete().eq('id', id);
            return !error;
        } catch (e) {
            return false;
        }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // TEMPLATES SYNC (created/edited templates, with creator & editor audit)
    // ════════════════════════════════════════════════════════════════════════════
    public async fetchTemplates(): Promise<PrebuiltTemplate[] | null> {
        if (!this.client || !this.config.enabled) return null;
        try {
            const { data, error } = await this.client
                .from('templates')
                .select('*')
                .order('updated_at', { ascending: false });

            if (error) {
                console.warn('Supabase fetchTemplates error, falling back to local:', error.message);
                return null;
            }

            return (data || []).map((r: any): PrebuiltTemplate => ({
                id: r.id,
                title: r.title,
                description: r.description || '',
                category: r.category,
                categoryKey: r.category_key || '',
                accessScope: r.access_scope || ['admin'],
                accessLevel: r.access_level || 'Public',
                icon: r.icon || '🏷️',
                schemaKey: r.schema_key || '',
                schema: r.schema || { label: r.title || '', fields: [], sampleData: {} },
                layout: r.layout,
                sampleBatch: r.sample_batch || [],
                defaultSheetPreset: r.default_sheet_preset || 'a4-24up'
            }));
        } catch (e) {
            console.error('Error fetching templates', e);
            return null;
        }
    }

    /** Upsert a template; records the current user as editor (and creator on first save). */
    public async saveTemplate(tpl: PrebuiltTemplate): Promise<boolean> {
        if (!this.client || !this.config.enabled) return false;
        const by = this.currentUserProfile?.email || this.currentUserProfile?.id || null;
        try {
            // Preserve the original creator + created_at on update.
            let createdBy: string | null = by;
            let createdAt: string | null = null;
            const existing = await this.client.from('templates').select('created_by, created_at').eq('id', tpl.id).maybeSingle();
            if (existing?.data) {
                createdBy = existing.data.created_by || by;
                createdAt = existing.data.created_at || null;
            }

            const row: Record<string, any> = {
                id: tpl.id,
                title: tpl.title,
                description: tpl.description,
                category: tpl.category,
                category_key: tpl.categoryKey,
                access_scope: tpl.accessScope,
                access_level: tpl.accessLevel,
                icon: tpl.icon,
                schema_key: tpl.schemaKey,
                schema: tpl.schema,
                layout: tpl.layout,
                sample_batch: tpl.sampleBatch,
                default_sheet_preset: tpl.defaultSheetPreset,
                created_by: createdBy,
                updated_by: by,
                updated_at: new Date().toISOString()
            };
            if (createdAt) row.created_at = createdAt;

            const { error } = await this.client.from('templates').upsert(row);
            if (error) {
                console.warn('Supabase saveTemplate error:', error.message);
                return false;
            }
            return true;
        } catch (e: any) {
            console.warn('Supabase saveTemplate error:', e?.message || e);
            return false;
        }
    }

    public async deleteTemplate(id: string): Promise<boolean> {
        if (!this.client || !this.config.enabled) return false;
        try {
            const { error } = await this.client.from('templates').delete().eq('id', id);
            return !error;
        } catch (e) {
            return false;
        }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // MASTER DATA SYNC (plants, categories, groups, colors, warranties)
    // ════════════════════════════════════════════════════════════════════════════
    public async fetchMasterData(): Promise<MasterDataOption[] | null> {
        if (!this.client || !this.config.enabled) return null;
        try {
            const { data, error } = await this.client
                .from('master_data')
                .select('*')
                .order('created_at', { ascending: true });

            if (error) {
                console.warn('Supabase fetchMasterData error, falling back to local:', error.message);
                return null;
            }

            return (data || []).map((r: any): MasterDataOption => ({
                code: r.code,
                label: r.label,
                type: r.type as MasterDataType,
                plantCode: r.meta?.plantCode,
                fyStructure: r.meta?.fyStructure,
                serialCode: r.meta?.serialCode,
                batchCode: r.meta?.batchCode,
                defaultValue: r.meta?.defaultValue
            }));
        } catch (e) {
            console.error('Error fetching master data', e);
            return null;
        }
    }

    public async saveMasterData(option: MasterDataOption): Promise<boolean> {
        if (!this.client || !this.config.enabled) return false;
        const by = this.currentUserProfile?.email || this.currentUserProfile?.id || null;
        try {
            const { error } = await this.client.from('master_data').upsert({
                id: `${option.type}:${option.code}`,
                type: option.type,
                code: option.code,
                label: option.label,
                meta: {
                    plantCode: option.plantCode,
                    fyStructure: option.fyStructure,
                    serialCode: option.serialCode,
                    batchCode: option.batchCode,
                    defaultValue: option.defaultValue
                },
                created_by: by,
                updated_by: by,
                updated_at: new Date().toISOString()
            });
            return !error;
        } catch (e: any) {
            console.warn('Supabase saveMasterData error:', e?.message || e);
            return false;
        }
    }

    public async deleteMasterData(type: MasterDataType, code: string): Promise<boolean> {
        if (!this.client || !this.config.enabled) return false;
        try {
            const { error } = await this.client.from('master_data').delete().eq('id', `${type}:${code}`);
            return !error;
        } catch (e) {
            return false;
        }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // LOGIC RULES SYNC (Serial Number & Batch Number formats — shared globally)
    // ════════════════════════════════════════════════════════════════════════════
    public async fetchLogicRules(type: 'serial' | 'batch'): Promise<any[] | null> {
        if (!this.client || !this.config.enabled) return null;
        try {
            const { data, error } = await this.client
                .from('logic_rules')
                .select('rules')
                .eq('type', type)
                .maybeSingle();
            if (error) {
                console.warn('Supabase fetchLogicRules error:', error.message);
                return null;
            }
            if (!data) return null;
            const rules = data.rules;
            return Array.isArray(rules) && rules.length > 0 ? rules : null;
        } catch (e) {
            console.error('Error fetching logic rules', e);
            return null;
        }
    }

    public async saveLogicRules(type: 'serial' | 'batch', rules: any[]): Promise<boolean> {
        if (!this.client || !this.config.enabled || rules.length === 0) return false;
        const by = this.currentUserProfile?.email || this.currentUserProfile?.id || null;
        try {
            const { error } = await this.client.from('logic_rules').upsert({
                type,
                rules,
                updated_by: by,
                updated_at: new Date().toISOString()
            });
            if (error) {
                console.warn('Supabase saveLogicRules error:', error.message);
                return false;
            }
            return true;
        } catch (e: any) {
            console.warn('Supabase saveLogicRules error:', e?.message || e);
            return false;
        }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // ROLE & ACCESS CONTROL (role_permissions)
    // ════════════════════════════════════════════════════════════════════════════
    public async fetchRolePermissions(): Promise<any[] | null> {
        if (!this.client || !this.config.enabled) return null;
        try {
            const { data, error } = await this.client
                .from('role_permissions')
                .select('*');
            if (error) {
                console.warn('Supabase fetchRolePermissions error:', error.message);
                return null;
            }
            return data || [];
        } catch (e) {
            console.error('Error fetching role permissions', e);
            return null;
        }
    }

    public async saveRolePermissions(rows: any[]): Promise<boolean> {
        if (!this.client || !this.config.enabled) return true; // offline: local-only is fine
        const by = this.currentUserProfile?.email || this.currentUserProfile?.id || null;
        try {
            const payload = rows.map(r => ({ ...r, updated_by: by, updated_at: new Date().toISOString() }));
            const { error } = await this.client.from('role_permissions').upsert(payload);
            if (error) {
                console.warn('Supabase saveRolePermissions error:', error.message);
                return false;
            }
            return true;
        } catch (e: any) {
            console.warn('Supabase saveRolePermissions error:', e?.message || e);
            return false;
        }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // COMPANY BRANDING / WHITE-LABEL PROFILE
    // ════════════════════════════════════════════════════════════════════════════
    public async fetchCompanyProfile(): Promise<CompanyProfile | null> {
        if (!this.client || !this.config.enabled) return null;
        try {
            const { data, error } = await this.client
                .from('company_profile')
                .select('*')
                .eq('id', 'app')
                .maybeSingle();

            if (error) {
                console.warn('Supabase fetchCompanyProfile error:', error.message);
                return null;
            }
            if (!data) return null;

            return {
                companyName: data.company_name || '',
                brandName: data.brand_name || '',
                address: data.address || '',
                email: data.email || '',
                phone: data.phone || '',
                website: data.website || '',
                logoDataUrl: data.logo_data_url || ''
            };
        } catch (e) {
            console.warn('Supabase fetchCompanyProfile error:', e);
            return null;
        }
    }

    public async saveCompanyProfile(profile: CompanyProfile): Promise<boolean> {
        if (!this.client || !this.config.enabled) return false;
        const by = this.currentUserProfile?.email || this.currentUserProfile?.id || null;
        try {
            const { error } = await this.client.from('company_profile').upsert({
                id: 'app',
                company_name: profile.companyName || '',
                brand_name: profile.brandName || '',
                address: profile.address || '',
                email: profile.email || '',
                phone: profile.phone || '',
                website: profile.website || '',
                logo_data_url: profile.logoDataUrl || '',
                updated_by: by,
                updated_at: new Date().toISOString()
            });
            return !error;
        } catch (e: any) {
            console.warn('Supabase saveCompanyProfile error:', e?.message || e);
            return false;
        }
    }
}

export const supabaseService = new SupabaseService();
