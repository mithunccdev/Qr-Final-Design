import { StickerLayout } from 'qrlayout-core';
import type { EntitySchema } from '../types';
import { PREBUILT_TEMPLATES } from './templates-data';
import { supabaseService } from '../supabase';
import { esc } from '../escape';

export interface EmployeeRecord {
    id: string;
    employeeId: string;
    name: string;
    designation: string;
    department: string;
    company: string;
    bloodGroup: string;
    joinDate: string;
    email: string;
    phone: string;
    accessTier: 'Standard' | 'VIP All-Access' | 'Security Ops' | 'Admin' | 'Contractor';
    rfidBadgeUid: string;
    variables: Record<string, string>;
    badgeStatus: 'Active' | 'Suspended' | 'Pending Print' | 'Decommissioned';
    lastPrintedAt: string | null;
    printCount: number;
    createdAt: string;
}

export interface EmployeeManagerOptions {
    container: HTMLElement;
    onPrintEmployeeBadges: (layout: StickerLayout, schema: EntitySchema, records: Record<string, any>[]) => void;
    onOpenInDesigner?: (layout: StickerLayout, schema: EntitySchema) => void;
}

const STORAGE_KEY_EMPLOYEES = 'qrlayout_db_employees';

export class EmployeeManagerView {
    private container: HTMLElement;
    private onPrintEmployeeBadges: (layout: StickerLayout, schema: EntitySchema, records: Record<string, any>[]) => void;
    private onOpenInDesigner?: (layout: StickerLayout, schema: EntitySchema) => void;

    private employees: EmployeeRecord[] = [];
    private selectedEmployeeIds: Set<string> = new Set();
    private searchQuery: string = '';
    private departmentFilter: string = 'All';
    private accessTierFilter: string = 'All';

    constructor(options: EmployeeManagerOptions) {
        this.container = options.container;
        this.onPrintEmployeeBadges = options.onPrintEmployeeBadges;
        this.onOpenInDesigner = options.onOpenInDesigner;

        this.loadFromStorage();
        this.render();
        void this.syncWithDatabase();
    }

    private loadFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_EMPLOYEES);
            this.employees = raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error('Error loading employees cache', e);
            this.employees = [];
        }
    }

    public async syncWithDatabase(): Promise<void> {
        try {
            const dbEmployees = await supabaseService.fetchEmployees();
            if (dbEmployees !== null) {
                this.employees = dbEmployees;
                this.saveToStorage();
                this.render();
            }
        } catch (err) {
            console.warn('EmployeeManager database sync notice:', err);
        }
    }

    private saveToStorage() {
        try {
            localStorage.setItem(STORAGE_KEY_EMPLOYEES, JSON.stringify(this.employees));
        } catch (e) {
            console.error('Error saving employees to storage', e);
        }
    }

    public render() {
        const totalEmployees = this.employees.length;
        const departments = Array.from(new Set(this.employees.map(e => e.department)));
        const activeBadgesCount = this.employees.filter(e => e.badgeStatus === 'Active').length;
        const printedCount = this.employees.filter(e => (e.printCount || 0) > 0).length;

        const allDeptOptions = ['All', ...departments];
        const allTierOptions = ['All', 'Standard', 'VIP All-Access', 'Security Ops', 'Admin', 'Contractor'];

        const selectedCount = this.selectedEmployeeIds.size;
        const allSelected = this.filteredEmployees.length > 0 && selectedCount === this.filteredEmployees.length;

        this.container.innerHTML = `
        <div class="entity-manager-root">
            <!-- TOP METRICS STATS -->
            <div class="stats-overview-grid">
                <div class="stat-card">
                    <div class="stat-icon bg-indigo-100 text-indigo-600">👥</div>
                    <div class="stat-content">
                        <span class="stat-label">Total Employees</span>
                        <span class="stat-value">${totalEmployees}</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-emerald-100 text-emerald-600">🪪</div>
                    <div class="stat-content">
                        <span class="stat-label">Active ID Badges</span>
                        <span class="stat-value">${activeBadgesCount}</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-cyan-100 text-cyan-600">🏢</div>
                    <div class="stat-content">
                        <span class="stat-label">Departments</span>
                        <span class="stat-value">${departments.length}</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-violet-100 text-violet-600">🖨️</div>
                    <div class="stat-content">
                        <span class="stat-label">Badges Printed</span>
                        <span class="stat-value">${printedCount}</span>
                    </div>
                </div>
            </div>

            <!-- MAIN EMPLOYEES PANEL -->
            <div class="manager-card-panel">
                <div class="panel-header-row">
                    <div>
                        <h2 class="panel-heading">Employee Directory & Badge Database</h2>
                        <p class="panel-subheading">Manage personnel records, security tiers, RFID badges, and batch print verified ID cards.</p>
                    </div>
                    <div class="panel-actions-group">
                        <button class="btn btn-outline btn-sm" id="btn-export-employee-db" title="Export employee database">
                            💾 Export DB
                        </button>
                        <button class="btn btn-outline btn-sm" id="btn-import-employee-db" title="Import JSON">
                            📥 Import DB
                        </button>
                        <input type="file" id="input-import-emp-file" accept=".json" style="display:none;" />
                        <button class="btn btn-success btn-sm" id="btn-print-selected-badges" ${selectedCount === 0 ? 'disabled' : ''}>
                            🖨️ Print Selected Badges (${selectedCount})
                        </button>
                        <button class="btn btn-primary btn-sm" id="btn-add-new-employee">
                            ➕ Add Employee
                        </button>
                    </div>
                </div>

                <!-- SEARCH & FILTER BAR -->
                <div class="table-filter-bar">
                    <div class="search-input-wrapper">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                        <input type="text" id="emp-search-input" placeholder="Search by name, ID, designation, email..." value="${this.searchQuery}" />
                    </div>
                    <div class="filter-dropdown-wrapper">
                        <select id="emp-dept-filter">
                            ${allDeptOptions.map(d => `<option value="${d}" ${this.departmentFilter === d ? 'selected' : ''}>Dept: ${d}</option>`).join('')}
                        </select>
                    </div>
                    <div class="filter-dropdown-wrapper">
                        <select id="emp-tier-filter">
                            ${allTierOptions.map(t => `<option value="${t}" ${this.accessTierFilter === t ? 'selected' : ''}>Access: ${t}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <!-- EMPLOYEES TABLE -->
                <div class="table-responsive-container">
                    <table class="manager-data-table">
                        <thead>
                            <tr>
                                <th style="width:40px;">
                                    <input type="checkbox" id="check-all-employees" ${allSelected ? 'checked' : ''} />
                                </th>
                                <th>Employee / Identity</th>
                                <th>Badge ID</th>
                                <th>Designation & Dept</th>
                                <th>Access Tier</th>
                                <th>Blood Group</th>
                                <th>Badge Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.renderEmployeeRows()}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- ADD / EDIT EMPLOYEE MODAL CONTAINER -->
            <div id="employee-modal-container"></div>
        </div>
        `;

        this.bindEvents();
    }

    private get filteredEmployees(): EmployeeRecord[] {
        return this.employees.filter(e => {
            const matchDept = this.departmentFilter === 'All' || e.department === this.departmentFilter;
            const matchTier = this.accessTierFilter === 'All' || e.accessTier === this.accessTierFilter;
            const q = this.searchQuery.toLowerCase();
            const matchSearch = !this.searchQuery ||
                e.name.toLowerCase().includes(q) ||
                e.employeeId.toLowerCase().includes(q) ||
                e.designation.toLowerCase().includes(q) ||
                e.email.toLowerCase().includes(q) ||
                e.department.toLowerCase().includes(q);
            return matchDept && matchTier && matchSearch;
        });
    }

    private renderEmployeeRows(): string {
        const list = this.filteredEmployees;
        if (list.length === 0) {
            return `<tr><td colspan="8" class="empty-table-cell">No employee records found matching your filters.</td></tr>`;
        }

        return list.map(e => {
            const isChecked = this.selectedEmployeeIds.has(e.id);
            const initials = e.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            return `
            <tr class="table-row-item ${isChecked ? 'row-active' : ''}" data-id="${e.id}">
                <td>
                    <input type="checkbox" class="emp-check-box" data-id="${e.id}" ${isChecked ? 'checked' : ''} />
                </td>
                <td>
                    <div class="user-cell-wrap">
                        <div class="user-avatar-initials">${esc(initials)}</div>
                        <div>
                            <div class="item-title-bold">${esc(e.name)}</div>
                            <div class="item-desc-sub">${esc(e.email)}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="sku-badge">🪪 ${esc(e.employeeId)}</span>
                </td>
                <td>
                    <div class="emp-role-bold">${esc(e.designation)}</div>
                    <div class="item-desc-sub">${esc(e.department)} • ${esc(e.company)}</div>
                </td>
                <td>
                    <span class="tier-badge tier-${esc(e.accessTier.toLowerCase().replace(/[^a-z0-9]/g, '-'))}">${esc(e.accessTier)}</span>
                </td>
                <td>
                    <span class="blood-chip">${esc(e.bloodGroup || 'N/A')}</span>
                </td>
                <td>
                    <span class="status-badge status-${esc(e.badgeStatus.toLowerCase().replace(/\s+/g, '-'))}">${esc(e.badgeStatus)}</span>
                    ${e.lastPrintedAt ? `<div class="text-xs text-muted">Printed (${esc(String(e.printCount))}x)</div>` : `<div class="text-xs text-amber-500">Unprinted</div>`}
                </td>
                <td>
                    <div class="row-actions-group">
                        <button class="btn btn-icon btn-outline btn-quick-print-emp" data-id="${e.id}" title="Print ID Badge for this Employee">
                            🖨️
                        </button>
                        <button class="btn btn-icon btn-outline btn-edit-emp" data-id="${e.id}" title="Edit Employee Profile">
                            ✏️
                        </button>
                        <button class="btn btn-icon btn-outline btn-delete-emp" data-id="${e.id}" title="Delete Record">
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>
            `;
        }).join('');
    }

    private bindEvents() {
        // Search & Filters
        this.container.querySelector<HTMLInputElement>('#emp-search-input')?.addEventListener('input', (e) => {
            this.searchQuery = (e.target as HTMLInputElement).value;
            this.updateTableOnly();
        });

        this.container.querySelector<HTMLSelectElement>('#emp-dept-filter')?.addEventListener('change', (e) => {
            this.departmentFilter = (e.target as HTMLSelectElement).value;
            this.updateTableOnly();
        });

        this.container.querySelector<HTMLSelectElement>('#emp-tier-filter')?.addEventListener('change', (e) => {
            this.accessTierFilter = (e.target as HTMLSelectElement).value;
            this.updateTableOnly();
        });

        // Add Employee
        this.container.querySelector('#btn-add-new-employee')?.addEventListener('click', () => {
            this.openEmployeeModal();
        });

        // Export / Import
        this.container.querySelector('#btn-export-employee-db')?.addEventListener('click', () => {
            this.exportDatabaseJSON();
        });

        const importInput = this.container.querySelector<HTMLInputElement>('#input-import-emp-file');
        this.container.querySelector('#btn-import-employee-db')?.addEventListener('click', () => {
            importInput?.click();
        });
        importInput?.addEventListener('change', (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) this.importDatabaseJSON(file);
        });

        // Select All Checkbox
        this.container.querySelector<HTMLInputElement>('#check-all-employees')?.addEventListener('change', (e) => {
            const checked = (e.target as HTMLInputElement).checked;
            if (checked) {
                this.filteredEmployees.forEach(emp => this.selectedEmployeeIds.add(emp.id));
            } else {
                this.selectedEmployeeIds.clear();
            }
            this.render();
        });

        // Single Checkbox
        this.container.querySelectorAll<HTMLInputElement>('.emp-check-box').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = (e.currentTarget as HTMLInputElement).dataset.id;
                if (id) {
                    if ((e.currentTarget as HTMLInputElement).checked) {
                        this.selectedEmployeeIds.add(id);
                    } else {
                        this.selectedEmployeeIds.delete(id);
                    }
                    this.render();
                }
            });
        });

        // Edit Button
        this.container.querySelectorAll<HTMLButtonElement>('.btn-edit-emp').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLButtonElement).dataset.id;
                const emp = this.employees.find(x => x.id === id);
                if (emp) this.openEmployeeModal(emp);
            });
        });

        // Delete Button
        this.container.querySelectorAll<HTMLButtonElement>('.btn-delete-emp').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLButtonElement).dataset.id;
                if (id && confirm('Are you sure you want to delete this employee record?')) {
                    this.employees = this.employees.filter(x => x.id !== id);
                    this.selectedEmployeeIds.delete(id);
                    this.saveToStorage();
                    void supabaseService.deleteEmployee(id);
                    this.render();
                }
            });
        });

        // Quick Print Single Employee
        this.container.querySelectorAll<HTMLButtonElement>('.btn-quick-print-emp').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLButtonElement).dataset.id;
                const emp = this.employees.find(x => x.id === id);
                if (emp) this.triggerBatchPrint([emp]);
            });
        });

        // Print Selected Badges
        this.container.querySelector('#btn-print-selected-badges')?.addEventListener('click', () => {
            const selected = this.employees.filter(e => this.selectedEmployeeIds.has(e.id));
            if (selected.length > 0) {
                this.triggerBatchPrint(selected);
            }
        });
    }

    private updateTableOnly() {
        const tbody = this.container.querySelector('.manager-data-table tbody');
        if (tbody) {
            tbody.innerHTML = this.renderEmployeeRows();
            this.bindEvents();
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PRINT BADGES HANDOVER
    // ──────────────────────────────────────────────────────────────────────────
    private triggerBatchPrint(employeesToPrint: EmployeeRecord[]) {
        const now = new Date().toISOString();
        employeesToPrint.forEach(e => {
            e.lastPrintedAt = now;
            e.printCount = (e.printCount || 0) + 1;
            e.badgeStatus = 'Active';
            void supabaseService.saveEmployee(e);
        });
        this.saveToStorage();

        // Convert employee records to batch records
        const records = employeesToPrint.map(e => ({
            name: e.name,
            employeeId: e.employeeId,
            designation: e.designation,
            department: e.department,
            company: e.company,
            bloodGroup: e.bloodGroup,
            joinDate: e.joinDate,
            email: e.email,
            phone: e.phone,
            accessTier: e.accessTier,
            rfidBadgeUid: e.rfidBadgeUid,
            ...e.variables
        }));

        const schema: EntitySchema = {
            label: 'Employee Badges Directory',
            fields: [
                { name: 'name', label: 'Full Name' },
                { name: 'employeeId', label: 'Employee ID' },
                { name: 'designation', label: 'Designation' },
                { name: 'department', label: 'Department' },
                { name: 'company', label: 'Company' },
                { name: 'bloodGroup', label: 'Blood Group' },
                { name: 'accessTier', label: 'Access Tier' },
                { name: 'rfidBadgeUid', label: 'RFID UID' }
            ],
            sampleData: records[0] || {}
        };

        const baseTpl = PREBUILT_TEMPLATES.find(t => t.id === 'employee-badge-std') || PREBUILT_TEMPLATES[0];
        const layout: StickerLayout = JSON.parse(JSON.stringify(baseTpl.layout));
        layout.name = `Employee ID Badges (${records.length} Staff)`;
        layout.targetEntity = 'employee';

        this.onPrintEmployeeBadges(layout, schema, records);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ADD / EDIT MODAL
    // ──────────────────────────────────────────────────────────────────────────
    private openEmployeeModal(existing?: EmployeeRecord) {
        const modalContainer = this.container.querySelector('#employee-modal-container');
        if (!modalContainer) return;

        const isEdit = !!existing;

        modalContainer.innerHTML = `
        <div class="studio-modal-backdrop">
            <div class="studio-modal-dialog product-modal-dialog">
                <div class="modal-header">
                    <h3 class="modal-title">${isEdit ? '✏️ Edit Employee Badge Profile' : '➕ Register New Employee'}</h3>
                    <button class="btn btn-icon btn-close-modal">✕</button>
                </div>

                <div class="modal-body-scroll">
                    <form id="employee-edit-form" class="modal-form-grid">
                        <div class="form-group col-span-2">
                            <label>Full Name *</label>
                            <input type="text" name="name" required placeholder="e.g. Dr. Alex Morgan" value="${existing ? existing.name : ''}" />
                        </div>

                        <div class="form-group">
                            <label>Employee ID / Badge Serial *</label>
                            <input type="text" name="employeeId" required placeholder="e.g. EMP-2026-104" value="${existing ? existing.employeeId : `EMP-${Date.now().toString().slice(-4)}`}" />
                        </div>

                        <div class="form-group">
                            <label>Company / Organization *</label>
                            <input type="text" name="company" required placeholder="e.g. ACME TECHNOLOGIES" value="${existing ? existing.company : 'ACME ENTERPRISE'}" />
                        </div>

                        <div class="form-group">
                            <label>Designation / Job Role *</label>
                            <input type="text" name="designation" required placeholder="e.g. Lead Systems Architect" value="${existing ? existing.designation : ''}" />
                        </div>

                        <div class="form-group">
                            <label>Department *</label>
                            <input type="text" name="department" required placeholder="e.g. Engineering, R&D, Operations" value="${existing ? existing.department : 'Engineering'}" />
                        </div>

                        <div class="form-group">
                            <label>Access Tier *</label>
                            <select name="accessTier" required>
                                <option value="Standard" ${existing?.accessTier === 'Standard' ? 'selected' : ''}>Standard</option>
                                <option value="VIP All-Access" ${existing?.accessTier === 'VIP All-Access' ? 'selected' : ''}>VIP All-Access</option>
                                <option value="Security Ops" ${existing?.accessTier === 'Security Ops' ? 'selected' : ''}>Security Ops</option>
                                <option value="Admin" ${existing?.accessTier === 'Admin' ? 'selected' : ''}>Admin</option>
                                <option value="Contractor" ${existing?.accessTier === 'Contractor' ? 'selected' : ''}>Contractor</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label>Blood Group</label>
                            <input type="text" name="bloodGroup" placeholder="e.g. O+, A+, B+, AB-" value="${existing ? existing.bloodGroup : 'O+'}" />
                        </div>

                        <div class="form-group">
                            <label>Email Address</label>
                            <input type="email" name="email" placeholder="alex.morgan@company.com" value="${existing ? existing.email : ''}" />
                        </div>

                        <div class="form-group">
                            <label>Phone Number</label>
                            <input type="text" name="phone" placeholder="+1 (555) 000-0000" value="${existing ? existing.phone : ''}" />
                        </div>

                        <div class="form-group">
                            <label>Joining Date</label>
                            <input type="date" name="joinDate" value="${existing ? existing.joinDate : new Date().toISOString().split('T')[0]}" />
                        </div>

                        <div class="form-group">
                            <label>RFID Badge UID</label>
                            <input type="text" name="rfidBadgeUid" placeholder="e.g. RFID-8842-X1" value="${existing ? existing.rfidBadgeUid : `RFID-${Date.now().toString().slice(-4)}`}" />
                        </div>
                    </form>
                </div>

                <div class="modal-footer">
                    <button class="btn btn-outline btn-close-modal">Cancel</button>
                    <button class="btn btn-primary" id="btn-save-employee-submit">
                        ${isEdit ? 'Save Changes' : 'Add Employee'}
                    </button>
                </div>
            </div>
        </div>
        `;

        const closeModal = () => { modalContainer.innerHTML = ''; };
        modalContainer.querySelectorAll('.btn-close-modal').forEach(b => b.addEventListener('click', closeModal));

        modalContainer.querySelector('#btn-save-employee-submit')?.addEventListener('click', () => {
            const form = modalContainer.querySelector('#employee-edit-form') as HTMLFormElement;
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }

            const fd = new FormData(form);

            if (isEdit && existing) {
                existing.name = fd.get('name') as string;
                existing.employeeId = fd.get('employeeId') as string;
                existing.company = fd.get('company') as string;
                existing.designation = fd.get('designation') as string;
                existing.department = fd.get('department') as string;
                existing.accessTier = fd.get('accessTier') as any;
                existing.bloodGroup = fd.get('bloodGroup') as string;
                existing.email = fd.get('email') as string;
                existing.phone = fd.get('phone') as string;
                existing.joinDate = fd.get('joinDate') as string;
                existing.rfidBadgeUid = fd.get('rfidBadgeUid') as string;
                void supabaseService.saveEmployee(existing);
            } else {
                const newEmp: EmployeeRecord = {
                    id: `emp-${Date.now()}`,
                    name: fd.get('name') as string,
                    employeeId: fd.get('employeeId') as string,
                    company: fd.get('company') as string,
                    designation: fd.get('designation') as string,
                    department: fd.get('department') as string,
                    accessTier: fd.get('accessTier') as any,
                    bloodGroup: fd.get('bloodGroup') as string,
                    email: fd.get('email') as string,
                    phone: fd.get('phone') as string,
                    joinDate: fd.get('joinDate') as string,
                    rfidBadgeUid: fd.get('rfidBadgeUid') as string,
                    variables: {},
                    badgeStatus: 'Pending Print',
                    lastPrintedAt: null,
                    printCount: 0,
                    createdAt: new Date().toISOString()
                };
                this.employees.push(newEmp);
                void supabaseService.saveEmployee(newEmp);
            }

            this.saveToStorage();
            closeModal();
            this.render();
        });
    }

    private exportDatabaseJSON() {
        const payload = {
            exportDate: new Date().toISOString(),
            schemaVersion: '1.0',
            employees: this.employees
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `employee-directory-db-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    private importDatabaseJSON(file: File) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target?.result as string);
                if (data && Array.isArray(data.employees)) {
                    this.employees = data.employees;
                    this.saveToStorage();
                    this.employees.forEach(emp => void supabaseService.saveEmployee(emp));
                    this.render();
                    alert(`Employee directory imported successfully! Loaded ${this.employees.length} records.`);
                } else {
                    alert('Invalid JSON file format for employee database.');
                }
            } catch (err) {
                console.error(err);
                alert('Error reading JSON file.');
            }
        };
        reader.readAsText(file);
    }
}
