import {
    CompanyProfile,
    loadCompanyProfile,
    saveCompanyProfile,
    resizeLogoToAppSize,
    logoBadgeHtml
} from './branding';
import { supabaseService } from '../supabase';

export class BrandingManagerView {
    private container: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container;
        this.render();
        void this.syncFromDb();
    }

    private async syncFromDb() {
        const db = await supabaseService.fetchCompanyProfile();
        if (!db) return;
        // Merge DB (source of truth) into the local cache and re-render.
        saveCompanyProfile({ ...loadCompanyProfile(), ...db });
        this.render();
    }

    private render() {
        const p = loadCompanyProfile();

        this.container.innerHTML = `
        <div class="entity-manager-root">
            <div class="manager-card-panel" style="max-width: 760px; margin: 0 auto; width: 100%;">
                <div class="panel-header-row">
                    <div>
                        <h2 class="panel-heading">🏷️ Company Branding &amp; White Label</h2>
                        <p class="panel-subheading">Set the app name, logo and contact details. These appear in the sidebar, login and title, and are saved to the database.</p>
                    </div>
                </div>

                <div class="branding-grid">
                    <div class="branding-logo-side">
                        <label class="config-label">App Logo</label>
                        <div class="branding-logo-preview" id="branding-logo-preview">
                            ${p.logoDataUrl ? logoBadgeHtml(p.logoDataUrl) : '<span class="branding-logo-placeholder">Logo</span>'}
                        </div>
                        <input type="file" id="branding-logo-input" accept="image/png,image/jpeg,image/svg+xml,image/webp" style="display:none;" />
                        <button class="btn btn-outline btn-sm btn-block" id="btn-upload-logo" style="margin-top:10px;">📤 Upload Logo</button>
                        <button class="btn btn-outline btn-sm btn-block" id="btn-remove-logo" style="margin-top:6px;">🗑️ Remove Logo</button>
                        <small class="config-help" style="display:block;margin-top:8px;">Auto-resized to fit the app (square). PNG/JPG/SVG/WEBP.</small>
                    </div>

                    <div class="branding-fields">
                        <div class="form-group">
                            <label style="font-weight:600;">Company Name</label>
                            <input type="text" id="b-company" class="form-control-input" value="${p.companyName}" placeholder="Acme Industries Pvt. Ltd." />
                        </div>
                        <div class="form-group">
                            <label style="font-weight:600;">Brand / App Name</label>
                            <input type="text" id="b-brand" class="form-control-input" value="${p.brandName}" placeholder="QR Studio" />
                        </div>
                        <div class="form-group">
                            <label style="font-weight:600;">Address</label>
                            <textarea id="b-address" class="form-control-textarea" rows="2" placeholder="Registered office address...">${p.address}</textarea>
                        </div>
                        <div class="form-row" style="display:flex;gap:12px;">
                            <div class="form-group" style="flex:1;">
                                <label style="font-weight:600;">Email</label>
                                <input type="email" id="b-email" class="form-control-input" value="${p.email}" placeholder="support@company.com" />
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label style="font-weight:600;">Phone</label>
                                <input type="text" id="b-phone" class="form-control-input" value="${p.phone}" placeholder="+91 98765 43210" />
                            </div>
                        </div>
                        <div class="form-group">
                            <label style="font-weight:600;">Website</label>
                            <input type="text" id="b-website" class="form-control-input" value="${p.website}" placeholder="https://example.com" />
                        </div>
                    </div>
                </div>

                <div class="template-page-footer" style="display:flex;justify-content:flex-end;gap:10px;padding:0 24px 20px;">
                    <button class="btn btn-primary" id="btn-save-branding">💾 Save Branding</button>
                </div>
            </div>
        </div>`;

        this.container.querySelector('#btn-upload-logo')?.addEventListener('click', () => {
            (this.container.querySelector('#branding-logo-input') as HTMLInputElement)?.click();
        });

        this.container.querySelector('#branding-logo-input')?.addEventListener('change', async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            try {
                const dataUrl = await resizeLogoToAppSize(file);
                const profile = { ...loadCompanyProfile(), logoDataUrl: dataUrl };
                saveCompanyProfile(profile);
                this.render();
            } catch (err: any) {
                alert(err?.message || 'Logo upload failed. Please choose a valid image.');
            }
        });

        this.container.querySelector('#btn-remove-logo')?.addEventListener('click', () => {
            const profile = { ...loadCompanyProfile(), logoDataUrl: '' };
            saveCompanyProfile(profile);
            this.render();
        });

        this.container.querySelector('#btn-save-branding')?.addEventListener('click', () => {
            const profile: CompanyProfile = {
                companyName: (this.container.querySelector('#b-company') as HTMLInputElement).value.trim(),
                brandName: (this.container.querySelector('#b-brand') as HTMLInputElement).value.trim() || 'QR Studio',
                address: (this.container.querySelector('#b-address') as HTMLTextAreaElement).value.trim(),
                email: (this.container.querySelector('#b-email') as HTMLInputElement).value.trim(),
                phone: (this.container.querySelector('#b-phone') as HTMLInputElement).value.trim(),
                website: (this.container.querySelector('#b-website') as HTMLInputElement).value.trim(),
                logoDataUrl: loadCompanyProfile().logoDataUrl || ''
            };
            saveCompanyProfile(profile);
            void supabaseService.saveCompanyProfile(profile).then(ok => {
                if (!ok) alert('Saved locally, but could not write to the database (check Supabase connection / run the schema).');
                else alert('✅ Branding saved to the database!');
            });
            // Re-apply branding app-wide (sidebar / login).
            if (typeof document !== 'undefined') {
                window.dispatchEvent(new CustomEvent('qr-branding-updated'));
            }
            this.render();
        });
    }
}
