import { supabaseService, UserProfile } from '../supabase';

export interface AuthViewOptions {
    container: HTMLElement;
    onLoginSuccess: (profile: UserProfile) => void;
}

export class AuthView {
    private container: HTMLElement;
    private onLoginSuccess: (profile: UserProfile) => void;
    private isSubmitting = false;

    constructor(options: AuthViewOptions) {
        this.container = options.container;
        this.onLoginSuccess = options.onLoginSuccess;
        this.render();
    }

    public render() {
        this.container.innerHTML = `
        <div class="auth-screen-root">
            <aside class="auth-split-brand">
                <div class="auth-brand-mark">
                    <div class="studio-logo-badge" style="background:#fafafa;color:#18181b;width:36px;height:36px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg>
                    </div>
                    <div>
                        <div class="brand-title" style="color:#fafafa;font-size:0.95rem;">QR Studio</div>
                        <div class="brand-subtitle" style="color:#a1a1aa;">Kajaria Bathware</div>
                    </div>
                </div>
                <div class="auth-brand-copy">
                    <h2>Design once.<br>Print everywhere.</h2>
                    <p>Label layout, serial tracking, and thermal output in one workspace — PDF, ZPL, and sheet print from the same template.</p>
                </div>
                <div class="auth-brand-meta">
                    <span>PDF · ZPL · 203–600 DPI</span>
                    <span>SSO-ready workspace</span>
                </div>
            </aside>

            <div class="auth-split-form">
            <div class="auth-card-panel">
                <div class="auth-header">
                    <h1 class="auth-title">Welcome back</h1>
                    <p class="auth-subtitle">Sign in to continue to your workspace.</p>
                </div>

                <div id="auth-alert-box" class="auth-alert" style="display: none;"></div>

                <form id="auth-login-form" class="auth-form">
                    <div class="auth-form-group">
                        <label for="auth-email">Email</label>
                        <div class="auth-input-wrapper">
                            <svg class="auth-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                            <input 
                                type="email" 
                                id="auth-email" 
                                class="auth-input" 
                                placeholder="name@kajariabathware.in" 
                                required 
                                autocomplete="email"
                                value="mithunaes@gmail.com"
                            />
                        </div>
                    </div>

                    <div class="auth-form-group">
                        <label for="auth-password">Password</label>
                        <div class="auth-input-wrapper">
                            <svg class="auth-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            <input 
                                type="password" 
                                id="auth-password" 
                                class="auth-input" 
                                placeholder="••••••••••••" 
                                required 
                                autocomplete="current-password"
                                value="654321"
                            />
                            <button type="button" id="btn-toggle-password" class="auth-eye-btn" title="Toggle password visibility">
                                👁️
                            </button>
                        </div>
                    </div>

                    <button type="submit" id="btn-auth-submit" class="auth-submit-btn">
                        <span class="btn-text">Continue</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
                    </button>
                </form>
            </div>
            </div>
        </div>
        `;

        this.bindEvents();
    }

    private bindEvents() {
        const form = this.container.querySelector('#auth-login-form') as HTMLFormElement;
        const emailInput = this.container.querySelector('#auth-email') as HTMLInputElement;
        const passInput = this.container.querySelector('#auth-password') as HTMLInputElement;
        const alertBox = this.container.querySelector('#auth-alert-box') as HTMLElement;
        const submitBtn = this.container.querySelector('#btn-auth-submit') as HTMLButtonElement;
        const toggleEyeBtn = this.container.querySelector('#btn-toggle-password') as HTMLButtonElement;

        // Toggle password visibility
        toggleEyeBtn?.addEventListener('click', () => {
            if (passInput.type === 'password') {
                passInput.type = 'text';
            } else {
                passInput.type = 'password';
            }
        });

        // Form Submit
        form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (this.isSubmitting) return;

            const email = emailInput.value.trim();
            const password = passInput.value;

            if (!email || !password) return;

            this.isSubmitting = true;
            submitBtn.disabled = true;
            submitBtn.innerHTML = `
                <div class="auth-spinner"></div>
                <span>Authenticating...</span>
            `;
            alertBox.style.display = 'none';

            try {
                const res = await supabaseService.login(email, password);
                if (res.success && res.profile) {
                    alertBox.className = 'auth-alert alert-success';
                    alertBox.textContent = `Welcome back, ${res.profile.fullName}!`;
                    alertBox.style.display = 'block';
                    setTimeout(() => {
                        this.onLoginSuccess(res.profile!);
                    }, 400);
                } else {
                    alertBox.className = 'auth-alert alert-error';
                    alertBox.textContent = res.message || 'Login failed. Please check your email and password.';
                    alertBox.style.display = 'block';
                }
            } catch (err: any) {
                alertBox.className = 'auth-alert alert-error';
                alertBox.textContent = err.message || 'Authentication error. Please try again.';
                alertBox.style.display = 'block';
            } finally {
                this.isSubmitting = false;
                submitBtn.disabled = false;
                submitBtn.innerHTML = `
                    <span class="btn-text">Sign In to Workspace</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
                `;
            }
        });
    }
}
