// ════════════════════════════════════════════════════════════════════════════
// ANALYTICS DASHBOARD — KPIs, simple bar charts, and CSV export of aggregates.
// ════════════════════════════════════════════════════════════════════════════

import { supabaseService } from '../supabase';
import { esc } from '../escape';
import { toCSV, downloadFile } from './csv';

interface AnalyticsOpts {
    container: HTMLElement;
}

export class AnalyticsView {
    private container: HTMLElement;

    constructor(opts: AnalyticsOpts) {
        this.container = opts.container;
        this.render();
    }

    public render(): void {
        this.container.innerHTML = `
        <div class="entity-manager-root">
            <div class="manager-card-panel" style="padding:0;">
                <div class="panel-header-row">
                    <div>
                        <h2 class="panel-heading">📊 Analytics</h2>
                        <p class="panel-subheading">Operational metrics across products, serials, batches, people and print activity.</p>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button class="btn btn-outline" id="btn-export-analytics">📥 Export CSV</button>
                        <button class="btn btn-outline" id="btn-refresh-analytics">↻ Refresh</button>
                    </div>
                </div>
                <div id="analytics-body" style="padding:18px;"><p style="padding:24px;text-align:center;color:var(--text-secondary);">Loading…</p></div>
            </div>
        </div>`;

        this.load();
        this.container.querySelector('#btn-refresh-analytics')?.addEventListener('click', () => this.load());
        this.container.querySelector('#btn-export-analytics')?.addEventListener('click', () => this.exportCSV());
    }

    private counts: any = {};

    private async load(): Promise<void> {
        const body = this.container.querySelector('#analytics-body') as HTMLElement;
        if (!body) return;

        const [products, employees, serials, batches, templates, printJobs] = await Promise.all([
            supabaseService.fetchProducts(),
            supabaseService.fetchEmployees(),
            supabaseService.fetchSerials(),
            supabaseService.fetchBatches(),
            supabaseService.fetchTemplates(),
            supabaseService.fetchPrintJobs()
        ]);

        this.counts = {
            products: products || [],
            employees: employees || [],
            serials: serials || [],
            batches: batches || [],
            templates: templates || [],
            printJobs: printJobs || []
        };

        // Derived metrics
        const serialCount = this.counts.serials.length;
        const byPlant: Record<string, number> = {};
        for (const s of this.counts.serials) {
            const p = s.plant || 'KSPL';
            byPlant[p] = (byPlant[p] || 0) + 1;
        }
        // Top products by serial count
        const byProduct: Record<string, number> = {};
        for (const s of this.counts.serials) {
            const k = s.productTitle || s.sku || s.productId || 'Other';
            byProduct[k] = (byProduct[k] || 0) + 1;
        }
        const topProducts = Object.entries(byProduct).sort((a, b) => b[1] - a[1]).slice(0, 5);

        // Print jobs by format
        const byFormat: Record<string, number> = {};
        for (const p of this.counts.printJobs) {
            const f = p.format || 'ZPL';
            byFormat[f] = (byFormat[f] || 0) + 1;
        }

        const kpi = (label: string, value: number, icon: string, color: string) => `
            <div class="stat-card" style="padding:16px 20px;">
                <div class="stat-icon ${color}" style="font-size:1.4rem;">${icon}</div>
                <div class="stat-content"><span class="stat-label">${esc(label)}</span><span class="stat-value">${value}</span></div>
            </div>`;

        body.innerHTML = `
            <!-- KPI CARDS -->
            <div class="stats-overview-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;">
                ${kpi('Products', products?.length || 0, '📦', '')}
                ${kpi('Serial Numbers', serialCount, '🔢', '')}
                ${kpi('Batches', batches?.length || 0, '📊', '')}
                ${kpi('Employees', employees?.length || 0, '👥', '')}
                ${kpi('Templates', templates?.length || 0, '📁', '')}
                ${kpi('Print Jobs', printJobs?.length || 0, '🖨️', '')}
            </div>

            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-top:18px;">
                ${this.panel('Serials by Plant', this.bars(byPlant, 'emerald'))}
                ${this.panel('Print Jobs by Format', this.bars(byFormat, 'indigo'))}
                ${this.panel('Top Products (by serial count)', this.bars(topProducts.reduce((a: any, [k, v]) => { a[k] = v; return a; }, {}), 'amber'))}
                ${this.panel('Recent Activity', this.recentActivity())}
            </div>
        `;
    }

    private panel(title: string, inner: string): string {
        return `
        <div style="background:var(--surface);border:1px solid var(--border-color,#e2e8f0);border-radius:12px;padding:16px;">
            <h3 style="margin:0 0 12px 0;font-size:0.9375rem;font-weight:700;color:var(--text-primary);">${esc(title)}</h3>
            ${inner || '<p style="color:var(--text-secondary);font-size:0.8125rem;">No data</p>'}
        </div>`;
    }

    /** Simple horizontal bar chart from {label: count}. */
    private bars(data: Record<string, number>, hue: string): string {
        const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
        if (entries.length === 0) return '<p style="color:var(--text-secondary);font-size:0.8125rem;">No data</p>';
        const max = Math.max(...entries.map(e => e[1]));
        return entries.map(([label, count]) => {
            const pct = max > 0 ? Math.round((count / max) * 100) : 0;
            return `
            <div style="display:grid;grid-template-columns:1fr 44px;align-items:center;gap:8px;margin-bottom:8px;">
                <div style="position:relative;height:20px;background:#f1f5f9;border-radius:5px;overflow:hidden;">
                    <div style="position:absolute;left:0;top:0;bottom:0;width:${pct}%;background:var(--color-${hue}-300,#818cf8);border-radius:5px;"></div>
                    <span style="position:relative;padding:2px 8px;font-size:0.75rem;font-weight:600;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(label)}</span>
                </div>
                <span style="text-align:right;font-size:0.75rem;font-weight:700;color:#334155;">${count}</span>
            </div>`;
        }).join('');
    }

    private recentActivity(): string {
        const jobs = (this.counts.printJobs || []).slice(0, 8);
        if (jobs.length === 0) return '<p style="color:var(--text-secondary);font-size:0.8125rem;">No print activity yet</p>';
        return jobs.map(j => `
            <div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:0.75rem;">
                <span>${esc(j.entity_label || j.entity_type)} · <span class="sku-badge">${esc(j.format)}</span> · ${esc(String(j.quantity))}</span>
                <span style="color:var(--text-secondary);white-space:nowrap;">${esc(new Date(j.created_at).toLocaleDateString())}</span>
            </div>`).join('');
    }

    private exportCSV(): void {
        const rows = [
            { Metric: 'Products', Value: this.counts.products?.length || 0 },
            { Metric: 'Serial Numbers', Value: this.counts.serials?.length || 0 },
            { Metric: 'Batches', Value: this.counts.batches?.length || 0 },
            { Metric: 'Employees', Value: this.counts.employees?.length || 0 },
            { Metric: 'Templates', Value: this.counts.templates?.length || 0 },
            { Metric: 'Print Jobs', Value: this.counts.printJobs?.length || 0 }
        ];
        const csv = toCSV(rows, [{ key: 'Metric', label: 'Metric' }, { key: 'Value', label: 'Value' }]);
        downloadFile(`analytics-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    }
}
