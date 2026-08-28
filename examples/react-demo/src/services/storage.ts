import type { StickerLayout } from 'qrlayout-ui';

const STORAGE_KEY = 'qr_labels_data';
const EMPLOYEE_STORAGE_KEY = 'employee_data';
const MACHINE_STORAGE_KEY = 'machine_data';
const BIN_STORAGE_KEY = 'bin_data';
const PRODUCT_STORAGE_KEY = 'product_master_data';
const SERIAL_STORAGE_KEY = 'product_serial_data';

export interface Employee {
    id: string;
    fullName: string;
    employeeId: string;
    department: string;
    joinDate: string;
}

export interface ProductItem {
    id: string;
    title: string;
    sku: string;
    category: string;
    price: string;
    serialPrefix: string;
    nextSequence: number;
    variables: Record<string, string>;
    createdAt: string;
}

export interface SerializedUnitItem {
    id: string;
    productId: string;
    sku: string;
    serialNumber: string;
    title: string;
    price: string;
    variables: Record<string, string>;
    status: 'In Stock' | 'Quality Passed' | 'Dispatched';
    lastPrintedAt: string | null;
    printCount: number;
    createdAt: string;
}

export interface Machine {
    id: string;
    machineName: string;
    machineCode: string;
    location: string;
    model: string;
}

export interface Bin {
    id: string;
    binCode: string;
    storageType: string;
    aisle: string;
    rack: string;
}

export const storage = {
    // Product & Serial Tracking functions
    getProducts: (): ProductItem[] => {
        const data = localStorage.getItem(PRODUCT_STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    },

    saveProducts: (products: ProductItem[]): void => {
        localStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(products));
    },

    addProduct: (product: ProductItem): void => {
        const products = storage.getProducts();
        const index = products.findIndex(p => p.id === product.id);
        if (index >= 0) {
            products[index] = product;
        } else {
            products.push(product);
        }
        storage.saveProducts(products);
    },

    deleteProduct: (id: string): void => {
        const products = storage.getProducts().filter(p => p.id !== id);
        storage.saveProducts(products);
        const serials = storage.getProductSerials().filter(s => s.productId !== id);
        storage.saveProductSerials(serials);
    },

    getProductSerials: (): SerializedUnitItem[] => {
        const data = localStorage.getItem(SERIAL_STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    },

    saveProductSerials: (serials: SerializedUnitItem[]): void => {
        localStorage.setItem(SERIAL_STORAGE_KEY, JSON.stringify(serials));
    },

    generateProductSerials: (product: ProductItem, count: number, customVars: Record<string, string> = {}): SerializedUnitItem[] => {
        let seq = product.nextSequence || 1001;
        const newSerials: SerializedUnitItem[] = [];
        for (let i = 0; i < count; i++) {
            const sn = `${product.serialPrefix}${seq.toString().padStart(5, '0')}`;
            newSerials.push({
                id: `sn-${product.id}-${Date.now()}-${i}`,
                productId: product.id,
                sku: product.sku,
                serialNumber: sn,
                title: product.title,
                price: product.price,
                variables: { ...product.variables, ...customVars },
                status: 'In Stock',
                lastPrintedAt: null,
                printCount: 0,
                createdAt: new Date().toISOString()
            });
            seq++;
        }
        product.nextSequence = seq;
        storage.addProduct(product);
        const allSerials = [...storage.getProductSerials(), ...newSerials];
        storage.saveProductSerials(allSerials);
        return newSerials;
    },
    getLabels: (): StickerLayout[] => {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    },

    saveLabels: (labels: StickerLayout[]): void => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(labels));
    },

    addLabel: (label: StickerLayout): void => {
        const labels = storage.getLabels();
        const index = labels.findIndex(l => l.id === label.id);
        if (index >= 0) {
            labels[index] = label;
        } else {
            labels.push(label);
        }
        storage.saveLabels(labels);
    },

    deleteLabel: (id: string): void => {
        const labels = storage.getLabels().filter(l => l.id !== id);
        storage.saveLabels(labels);
    },

    // Employee functions
    getEmployees: (): Employee[] => {
        const data = localStorage.getItem(EMPLOYEE_STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    },

    saveEmployees: (employees: Employee[]): void => {
        localStorage.setItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(employees));
    },

    addEmployee: (employee: Employee): void => {
        const employees = storage.getEmployees();
        const index = employees.findIndex(e => e.id === employee.id);
        if (index >= 0) {
            employees[index] = employee;
        } else {
            employees.push(employee);
        }
        storage.saveEmployees(employees);
    },

    deleteEmployee: (id: string): void => {
        const employees = storage.getEmployees().filter(e => e.id !== id);
        storage.saveEmployees(employees);
    },

    // Machine functions
    getMachines: (): Machine[] => {
        const data = localStorage.getItem(MACHINE_STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    },

    saveMachines: (machines: Machine[]): void => {
        localStorage.setItem(MACHINE_STORAGE_KEY, JSON.stringify(machines));
    },

    addMachine: (machine: Machine): void => {
        const machines = storage.getMachines();
        const index = machines.findIndex(m => m.id === machine.id);
        if (index >= 0) {
            machines[index] = machine;
        } else {
            machines.push(machine);
        }
        storage.saveMachines(machines);
    },

    deleteMachine: (id: string): void => {
        const machines = storage.getMachines().filter(m => m.id !== id);
        storage.saveMachines(machines);
    },

    // Bin functions
    getBins: (): Bin[] => {
        const data = localStorage.getItem(BIN_STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    },

    saveBins: (bins: Bin[]): void => {
        localStorage.setItem(BIN_STORAGE_KEY, JSON.stringify(bins));
    },

    addBin: (bin: Bin): void => {
        const bins = storage.getBins();
        const index = bins.findIndex(b => b.id === bin.id);
        if (index >= 0) {
            bins[index] = bin;
        } else {
            bins.push(bin);
        }
        storage.saveBins(bins);
    },

    deleteBin: (id: string): void => {
        const bins = storage.getBins().filter(b => b.id !== id);
        storage.saveBins(bins);
    },

    initializeDefaults: (): void => {
        if (storage.getProducts().length === 0) {
            const p1: ProductItem = {
                id: 'p1',
                title: 'High-Torque Stepper Motor NEMA 23',
                sku: 'MOT-N23-4200',
                category: 'Motors',
                price: '$58.50',
                serialPrefix: 'SN-MOT-2026-',
                nextSequence: 1005,
                variables: { batchNo: 'LOT-2026-Q1', mfgDate: '2026-02-15', warranty: '24M' },
                createdAt: new Date().toISOString()
            };
            const p2: ProductItem = {
                id: 'p2',
                title: 'Precision Optical LiDAR Sensor 12m',
                sku: 'SEN-LID-12M',
                category: 'Sensors',
                price: '$89.00',
                serialPrefix: 'SN-LID-2026-',
                nextSequence: 1005,
                variables: { batchNo: 'BAT-9942', mfgDate: '2026-02-20', accuracy: '±1.5mm' },
                createdAt: new Date().toISOString()
            };
            storage.saveProducts([p1, p2]);
            storage.generateProductSerials(p1, 4);
            storage.generateProductSerials(p2, 4);
        }
        if (storage.getEmployees().length === 0) {
            storage.saveEmployees([
                { id: '1', fullName: 'Arjun Mehta', employeeId: 'EMP-001', department: 'Operations', joinDate: '2023-01-10' },
                { id: '2', fullName: 'Priya Sharma', employeeId: 'EMP-002', department: 'Engineering', joinDate: '2023-03-15' },
                { id: '3', fullName: 'Kiran Patel', employeeId: 'EMP-003', department: 'Logistics', joinDate: '2023-06-20' }
            ]);
        }
        if (storage.getMachines().length === 0) {
            storage.saveMachines([
                { id: 'm1', machineName: 'CNC Router X1', machineCode: 'CNC-01', location: 'Section A', model: '2024-Pro' },
                { id: 'm2', machineName: 'Industrial 3D Printer', machineCode: 'PRN-01', location: 'Design Lab', model: 'Gen-3' },
                { id: 'm3', machineName: 'Hydraulic Press', machineCode: 'PRS-05', location: 'Floor B', model: 'Heavy-Duty' }
            ]);
        }
        if (storage.getBins().length === 0) {
            storage.saveBins([
                { id: 'b1', binCode: 'BIN-A1-R1', storageType: 'Pallet Rack', aisle: 'Aisle 01', rack: 'R1' },
                { id: 'b2', binCode: 'BIN-A1-R2', storageType: 'Shelf', aisle: 'Aisle 01', rack: 'R2' },
                { id: 'b3', binCode: 'BIN-B2-R1', storageType: 'Cold Storage', aisle: 'Aisle 02', rack: 'R1' }
            ]);
        }
        if (storage.getLabels().length === 0) {
            storage.saveLabels([
                {
                    id: 'default-emp-layout',
                    name: 'Professional ID Badge',
                    targetEntity: 'employee',
                    width: 85.6,
                    height: 53.98,
                    unit: 'mm',
                    backgroundColor: '#ffffff',
                    elements: [
                        { id: 'e1', type: 'text', x: 30, y: 10, w: 50, h: 10, content: '{{fullName}}', style: { fontSize: 18, fontWeight: 'bold' } },
                        { id: 'e2', type: 'text', x: 30, y: 20, w: 50, h: 8, content: '{{employeeId}}', style: { fontSize: 12 } },
                        { id: 'e3', type: 'text', x: 30, y: 28, w: 50, h: 6, content: '{{department}}', style: { fontSize: 10, color: '#666666' } },
                        { id: 'e4', type: 'qr', x: 5, y: 10, w: 22, h: 22, content: 'emp:{{employeeId}}' }
                    ]
                },
                {
                    id: 'default-machine-layout',
                    name: 'Equipment Asset Tag',
                    targetEntity: 'machine',
                    width: 60,
                    height: 30,
                    unit: 'mm',
                    backgroundColor: '#f8fafc',
                    elements: [
                        { id: 'm1', type: 'text', x: 25, y: 5, w: 32, h: 5, content: 'PROPERTY OF INDUSTRIAL CO.', style: { fontSize: 8, fontWeight: 'bold' } },
                        { id: 'm2', type: 'text', x: 25, y: 12, w: 32, h: 8, content: '{{machineName}}', style: { fontSize: 14, fontWeight: 'bold' } },
                        { id: 'm3', type: 'text', x: 25, y: 22, w: 32, h: 6, content: 'Code: {{machineCode}}', style: { fontSize: 10 } },
                        { id: 'm4', type: 'qr', x: 3, y: 5, w: 20, h: 20, content: 'asset:{{machineCode}}' }
                    ]
                },
                {
                    id: 'default-storage-layout',
                    name: 'Storage Location Label',
                    targetEntity: 'storage',
                    width: 100,
                    height: 50,
                    unit: 'mm',
                    backgroundColor: '#ffffff',
                    elements: [
                        { id: 'b1', type: 'text', x: 10, y: 10, w: 50, h: 8, content: 'AISLE: {{aisle}}', style: { fontSize: 12 } },
                        { id: 'b2', type: 'text', x: 10, y: 25, w: 80, h: 20, content: '{{binCode}}', style: { fontSize: 32, fontWeight: 'bold' } },
                        { id: 'b4', type: 'qr', x: 65, y: 10, w: 30, h: 30, content: 'storage:{{binCode}}' }
                    ]
                {
                    id: 'default-product-layout',
                    name: 'Product Barcode & Serial Label',
                    targetEntity: 'product',
                    width: 70,
                    height: 38,
                    unit: 'mm',
                    backgroundColor: '#ffffff',
                    elements: [
                        { id: 'p1', type: 'text', x: 4, y: 4, w: 62, h: 6, content: '{{title}}', style: { fontSize: 11, fontWeight: 'bold' } },
                        { id: 'p2', type: 'text', x: 4, y: 11, w: 38, h: 5, content: 'SKU: {{sku}}', style: { fontSize: 9 } },
                        { id: 'p3', type: 'text', x: 4, y: 17, w: 38, h: 5, content: 'PRICE: {{price}}', style: { fontSize: 10, fontWeight: 'bold', color: '#16a34a' } },
                        { id: 'p4', type: 'text', x: 4, y: 23, w: 62, h: 5, content: 'S/N: {{serialNumber}}', style: { fontSize: 9, fontWeight: 'bold', color: '#0284c7' } },
                        { id: 'p5', type: 'text', x: 4, y: 29, w: 62, h: 4, content: 'BATCH: {{batchNo}} • MFG: {{mfgDate}}', style: { fontSize: 7, color: '#64748b' } },
                        { id: 'p6', type: 'qr', x: 45, y: 9, w: 22, h: 22, content: 'SN:{{serialNumber}}|SKU:{{sku}}' }
                    ]
                }
            ]);
        }
    },

    clearAll: (): void => {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(EMPLOYEE_STORAGE_KEY);
        localStorage.removeItem(MACHINE_STORAGE_KEY);
        localStorage.removeItem(BIN_STORAGE_KEY);
    }
};
