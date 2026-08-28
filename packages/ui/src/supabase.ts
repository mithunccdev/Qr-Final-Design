import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import type { ProductRecord, SerializedUnit } from './dashboard/product-manager';
import type { EmployeeRecord } from './dashboard/employee-manager';
import type { PrebuiltTemplate } from './dashboard/templates-data';
import type { MasterDataOption, MasterDataType } from './dashboard/master-data';

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
    password?: string; // used for local demo / display
}

export interface SupabaseConfig {
    url: string;
    anonKey: string;
    enabled: boolean;
}

const DEFAULT_CONFIG: SupabaseConfig = {
    url: 'https://supabase2.kajariabathware.in',
    anonKey: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4NzQ4MDg4MCwiZXhwIjo0OTQzMTU0NDgwLCJyb2xlIjoiYW5vbiJ9.o7JoSXeLTJOORJGAs_qjjChKNTHPl9c-1UBb5R1fFGs',
    enabled: true
};

const STORAGE_KEY_CONFIG = 'qrlayout_supabase_config';
const STORAGE_KEY_PROFILES = 'qrlayout_user_profiles';
const STORAGE_KEY_CURRENT_USER = 'qrlayout_active_user_session';

const DEFAULT_USERS: UserProfile[] = [
    {
        id: 'usr-admin-01',
        email: 'mithunaes@gmail.com',
        fullName: 'Mithun (Administrator)',
        role: 'admin',
        allowedTemplateCategories: ['All'],
        allowedPlants: ['All'],
        isActive: true,
        password: '654321',
        createdAt: '2026-01-01T00:00:00.000Z'
    }
];

export class SupabaseService {
    private client: SupabaseClient | null = null;
    private config: SupabaseConfig;
    private currentUserProfile: UserProfile | null = null;

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

            // 2. If the account doesn't exist yet, auto-create the bootstrap
            //    admin account (idempotent) and sign in again.
            if (!signIn.profile && this.isDefaultAdmin(cleanEmail)) {
                await this.ensureBootstrapAdmin(cleanEmail, password);
                signIn = await this.trySignIn(cleanEmail, password);
            }

            if (signIn.profile) {
                return { success: true, profile: signIn.profile };
            }

            // Surface auth-level failures instead of silently falling back to local
            // (which would leave the client unauthenticated and break RLS reads/writes).
            if (signIn.reason && /not confirmed|email_not_confirmed/i.test(signIn.reason)) {
                return {
                    success: false,
                    message: 'Account is not confirmed. In Supabase: disable "Confirm email" (Authentication → Providers → Email), then confirm or delete the account in Authentication → Users, and try again.'
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
            if (found.password && found.password !== password) {
                return { success: false, message: 'Invalid password. Please check your credentials.' };
            }
            this.setCurrentUserSession(found);
            return { success: true, profile: found };
        }

        // Primary Admin login check (local only)
        if (cleanEmail === DEFAULT_USERS[0].email && password === DEFAULT_USERS[0].password) {
            const adminUser = DEFAULT_USERS[0];
            this.setCurrentUserSession(adminUser);
            return { success: true, profile: adminUser };
        }

        return { success: false, message: 'Invalid email or password. Please check your credentials.' };
    }

    private isDefaultAdmin(email: string): boolean {
        return email === DEFAULT_USERS[0].email;
    }

    private async trySignIn(email: string, password: string): Promise<{ ok: boolean; profile?: UserProfile; reason?: string }> {
        try {
            const { data, error } = await this.client!.auth.signInWithPassword({ email, password });
            if (error) {
                return { ok: false, reason: error.message };
            }
            if (data?.user) {
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

    /** Creates the bootstrap admin auth account if it does not exist. Idempotent. */
    private async ensureBootstrapAdmin(email: string, password: string): Promise<void> {
        try {
            const admin = DEFAULT_USERS[0];
            const { error } = await this.client!.auth.signUp({
                email,
                password,
                options: {
                    data: { full_name: admin.fullName, role: admin.role }
                }
            });
            // "User already registered" is fine — the account exists, signIn will handle it.
            if (error && !/already registered/i.test(error.message)) {
                console.warn('Bootstrap admin signup notice:', error.message);
            }
        } catch (err: any) {
            console.warn('Bootstrap admin signup error:', err?.message || err);
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
            role: (meta.role as UserRole) || (email.includes('admin') ? 'admin' : 'user'),
            allowedTemplateCategories: ['All'],
            allowedPlants: ['All'],
            isActive: true,
            createdAt: user.created_at ? new Date(user.created_at).toISOString() : new Date().toISOString()
        };

        try {
            await this.client!.from('user_profiles').upsert({
                id: profile.id,
                email: profile.email,
                full_name: profile.fullName,
                role: profile.role,
                allowed_template_categories: profile.allowedTemplateCategories,
                allowed_plants: profile.allowedPlants || ['All'],
                is_active: profile.isActive,
                created_at: profile.createdAt,
                updated_at: new Date().toISOString()
            });
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
        this.setCurrentUserSession(null);
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
            role: email.includes('admin') ? 'admin' : (email.includes('designer') ? 'designer' : 'user'),
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

        // 2. Save profile in Supabase table (must exist — run packages/ui/supabase/schema.sql)
        if (online) {
            try {
                const { error } = await this.client!.from('user_profiles').upsert({
                    id: profile.id,
                    email: profile.email,
                    full_name: profile.fullName,
                    role: profile.role,
                    allowed_template_categories: profile.allowedTemplateCategories,
                    allowed_plants: profile.allowedPlants || ['All'],
                    is_active: profile.isActive,
                    created_at: profile.createdAt,
                    updated_at: new Date().toISOString()
                });

                if (error) {
                    return { success: false, message: `Profile save failed: ${error.message}. Run the user_profiles SQL migration.` };
                }
            } catch (e: any) {
                console.warn('Supabase user_profiles upsert error:', e?.message || e);
                return { success: false, message: `Profile save failed: ${e?.message || e}. Run the user_profiles SQL migration.` };
            }
        }

        // 3. Save locally
        const profiles = this.getLocalProfiles().filter(p => p.id !== profile.id && p.email !== profile.email);
        profiles.unshift({ ...profile, password });
        this.saveLocalProfiles(profiles);

        // 4. The signUp step switched the client session to the newly-created user.
        //    Restore the current operator's Supabase session so subsequent actions
        //    still run as them (e.g. listing/managing other users).
        await this.restoreCurrentSession();

        return {
            success: true,
            message: online ? 'User created in Supabase Auth and synced locally.' : 'User created locally (Supabase not configured).'
        };
    }

    /** Re-authenticate the local session user so the shared client stays as them. */
    private async restoreCurrentSession(): Promise<void> {
        const current = this.currentUserProfile;
        if (!current || !this.client || !this.config.enabled) return;
        const storedPassword = this.getLocalProfiles().find(p => p.id === current.id)?.password
            || this.getLocalProfiles().find(p => p.email === current.email)?.password;
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
                await this.client.from('user_profiles').upsert({
                    id: profile.id,
                    email: profile.email,
                    full_name: profile.fullName,
                    role: profile.role,
                    allowed_template_categories: profile.allowedTemplateCategories,
                    allowed_plants: profile.allowedPlants || ['All'],
                    is_active: profile.isActive,
                    updated_at: new Date().toISOString()
                });
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
                printCount: Number(row.print_count || 0)
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
}

export const supabaseService = new SupabaseService();
