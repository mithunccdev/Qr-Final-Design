import { useState, useEffect, useRef } from 'react';
import { Plus, X, Printer, FileText, Image as ImageIcon, Info, QrCode, Tag, Sparkles } from 'lucide-react';
import { storage, type ProductItem, type SerializedUnitItem } from '../../services/storage';
import { Table, type Column } from '../../components/Table';
import { StickerPrinter } from 'qrlayout-core';
import { exportToPNG, exportToBatchPDF, exportToZPLFile } from '../../services/exportUtils';
import type { StickerLayout } from 'qrlayout-ui';

export function ProductMaster() {
    const [products, setProducts] = useState<ProductItem[]>([]);
    const [serials, setSerials] = useState<SerializedUnitItem[]>([]);
    const [labels, setLabels] = useState<StickerLayout[]>([]);
    const [selectedLayoutId, setSelectedLayoutId] = useState<string>('');

    // Selected product & serials
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
    const [selectedSerialIds, setSelectedSerialIds] = useState<string[]>([]);

    // Modals
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
    const [batchGenCount, setBatchGenCount] = useState<number>(5);

    // Form State
    const [formData, setFormData] = useState<Partial<ProductItem>>({
        price: '$19.99',
        serialPrefix: 'SN-2026-',
        nextSequence: 1001,
        variables: { batchNo: 'LOT-01', mfgDate: new Date().toISOString().split('T')[0] }
    });

    const printer = useRef(new StickerPrinter());

    useEffect(() => {
        loadData();
    }, []);

    const loadData = () => {
        storage.initializeDefaults();
        const prods = storage.getProducts();
        setProducts(prods);
        setSerials(storage.getProductSerials());

        const loadedLabels = storage.getLabels();
        const productLabels = loadedLabels.filter(l => l.targetEntity === 'product' || l.name.toLowerCase().includes('product') || l.name.toLowerCase().includes('retail'));
        setLabels(productLabels.length > 0 ? productLabels : loadedLabels);
        if (productLabels.length > 0 && !selectedLayoutId) {
            setSelectedLayoutId(productLabels[0].id);
        }
        if (prods.length > 0 && !selectedProductId) {
            setSelectedProductId(prods[0].id);
        }
    };

    const handleOpenProductModal = (prod?: ProductItem) => {
        if (prod) {
            setEditingProduct(prod);
            setFormData(prod);
        } else {
            setEditingProduct(null);
            setFormData({
                title: '',
                sku: '',
                category: 'Hardware',
                price: '$29.99',
                serialPrefix: 'SN-PRD-',
                nextSequence: 1001,
                variables: { batchNo: 'LOT-01', mfgDate: new Date().toISOString().split('T')[0], warranty: '12M' }
            });
        }
        setIsProductModalOpen(true);
    };

    const handleSaveProduct = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.title || !formData.sku) return;

        const product: ProductItem = {
            id: editingProduct?.id || `prod-${Date.now()}`,
            title: formData.title,
            sku: formData.sku,
            category: formData.category || 'General',
            price: formData.price || '$0.00',
            serialPrefix: formData.serialPrefix || 'SN-',
            nextSequence: formData.nextSequence || 1001,
            variables: formData.variables || {},
            createdAt: editingProduct?.createdAt || new Date().toISOString()
        };

        storage.addProduct(product);
        loadData();
        setIsProductModalOpen(false);
    };

    const handleDeleteProduct = (prod: ProductItem) => {
        if (window.confirm(`Delete product ${prod.title} and all its serialized units?`)) {
            storage.deleteProduct(prod.id);
            loadData();
            if (selectedProductId === prod.id) setSelectedProductId(null);
        }
    };

    const handleGenerateBatchSerials = () => {
        const prod = products.find(p => p.id === selectedProductId);
        if (!prod) return;

        storage.generateProductSerials(prod, batchGenCount);
        loadData();
        setIsBatchModalOpen(false);
    };

    const activeProduct = products.find(p => p.id === selectedProductId);
    const activeSerials = serials.filter(s => s.productId === selectedProductId);

    // Export Logic
    const getActiveLayout = () => {
        return labels.find(l => l.id === selectedLayoutId) || labels[0];
    };

    const getSelectedSerialObjects = () => {
        return serials.filter(s => selectedSerialIds.includes(s.id));
    };

    const handleExportPNG = async () => {
        const layout = getActiveLayout();
        const selected = getSelectedSerialObjects();
        if (!layout || selected.length === 0) return;

        await exportToPNG({
            layout,
            items: selected.map(s => ({ ...s, ...s.variables })),
            printer: printer.current,
            baseFilename: 'product-serialized-label'
        });
    };

    const handleExportPDF = async () => {
        const layout = getActiveLayout();
        const selected = getSelectedSerialObjects();
        if (!layout || selected.length === 0) return;

        await exportToBatchPDF({
            layout,
            items: selected.map(s => ({ ...s, ...s.variables })),
            printer: printer.current,
            baseFilename: 'batch-serialized-labels'
        });
    };

    const handleExportZPL = () => {
        const layout = getActiveLayout();
        const selected = getSelectedSerialObjects();
        if (!layout || selected.length === 0) return;

        exportToZPLFile({
            layout,
            items: selected.map(s => ({ ...s, ...s.variables })),
            printer: printer.current,
            baseFilename: 'batch-zebra-serials'
        });
    };

    const serialColumns: Column<SerializedUnitItem>[] = [
        {
            header: 'Serial Number',
            accessorKey: 'serialNumber',
            cell: (item) => <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">🏷️ {item.serialNumber}</span>
        },
        { header: 'Product', accessorKey: 'title' },
        { header: 'SKU', accessorKey: 'sku' },
        { header: 'Price', accessorKey: 'price' },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: (item) => (
                <span className={`px-2 py-0.5 text-xs font-semibold rounded ${item.status === 'In Stock' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {item.status}
                </span>
            )
        }
    ];

    const hasSelection = selectedSerialIds.length > 0;

    return (
        <div className="max-w-7xl mx-auto px-8 py-8 animate-in fade-in duration-500">
            {/* Top Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Product & Serial Number Master</h2>
                    <p className="text-gray-500">Manage products, variables, and track/print serial numbers</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative">
                        <select
                            className="appearance-none bg-white border border-gray-300 text-gray-700 py-2 pl-4 pr-10 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm cursor-pointer"
                            value={selectedLayoutId}
                            onChange={(e) => setSelectedLayoutId(e.target.value)}
                        >
                            <option value="" disabled>Select Label Layout</option>
                            {labels.map(l => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={() => handleOpenProductModal()}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm cursor-pointer"
                    >
                        <Plus size={18} />
                        <span>Add Product</span>
                    </button>
                </div>
            </div>

            {/* Products Selector Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {products.map(p => {
                    const unitCount = serials.filter(s => s.productId === p.id).length;
                    const isSelected = selectedProductId === p.id;
                    return (
                        <div
                            key={p.id}
                            onClick={() => { setSelectedProductId(p.id); setSelectedSerialIds([]); }}
                            className={`p-4 rounded-xl border cursor-pointer transition-all ${isSelected ? 'border-blue-600 bg-blue-50/50 shadow-md ring-2 ring-blue-500/20' : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'}`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-bold text-gray-900 line-clamp-1">{p.title}</h3>
                                <span className="font-bold text-green-600 text-sm">{p.price}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                                <span className="bg-gray-100 px-2 py-0.5 rounded font-mono font-semibold">{p.sku}</span>
                                <span>•</span>
                                <span>{p.category}</span>
                            </div>
                            <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
                                <span className="font-semibold text-blue-600">🔢 {unitCount} Serial Units</span>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleOpenProductModal(p); }}
                                        className="text-gray-400 hover:text-blue-600 p-1"
                                        title="Edit Product"
                                    >
                                        ✏️
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteProduct(p); }}
                                        className="text-gray-400 hover:text-red-600 p-1"
                                        title="Delete Product"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Serialized Units Table Section */}
            {activeProduct && (
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">Tracked Serial Numbers for: {activeProduct.title}</h3>
                            <p className="text-sm text-gray-500">Prefix: <code>{activeProduct.serialPrefix}</code> • SKU: {activeProduct.sku}</p>
                        </div>
                        <button
                            onClick={() => setIsBatchModalOpen(true)}
                            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm cursor-pointer"
                        >
                            <Sparkles size={16} />
                            <span>⚡ Generate Serial Numbers</span>
                        </button>
                    </div>

                    {/* Batch Actions Toolkit */}
                    {hasSelection && (
                        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-6 flex flex-wrap items-center justify-between gap-4 animate-in slide-in-from-top-2">
                            <div className="flex items-center gap-2 text-indigo-900">
                                <span className="font-semibold bg-indigo-100 px-2 py-0.5 rounded text-sm">{selectedSerialIds.length}</span>
                                <span className="font-medium">Serials Selected for Label Printing</span>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleExportPNG}
                                    className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-lg text-sm font-medium shadow-sm transition-colors cursor-pointer"
                                >
                                    <ImageIcon size={16} className="text-blue-500" />
                                    <span>Export PNG</span>
                                </button>

                                <button
                                    onClick={handleExportPDF}
                                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow-sm transition-colors cursor-pointer"
                                >
                                    <FileText size={16} />
                                    <span>Print PDF</span>
                                </button>

                                <button
                                    onClick={handleExportZPL}
                                    className="flex items-center gap-1.5 bg-gray-900 hover:bg-black text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow-sm transition-colors cursor-pointer"
                                >
                                    <Printer size={16} className="text-yellow-400" />
                                    <span>Zebra ZPL</span>
                                </button>
                            </div>
                        </div>
                    )}

                    <Table<SerializedUnitItem>
                        data={activeSerials}
                        columns={serialColumns}
                        selectedIds={selectedSerialIds}
                        onSelectionChange={setSelectedSerialIds}
                        keyField="id"
                    />
                </div>
            )}

            {/* Add / Edit Product Modal */}
            {isProductModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
                            <button onClick={() => setIsProductModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSaveProduct} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Product Title *</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.title || ''}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g. Brushless Servo Motor 400W"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">SKU Code *</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.sku || ''}
                                        onChange={e => setFormData({ ...formData, sku: e.target.value })}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                        placeholder="e.g. MOT-SER-400"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                                    <input
                                        type="text"
                                        value={formData.category || ''}
                                        onChange={e => setFormData({ ...formData, category: e.target.value })}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Retail Price</label>
                                    <input
                                        type="text"
                                        value={formData.price || ''}
                                        onChange={e => setFormData({ ...formData, price: e.target.value })}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                        placeholder="$49.99"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Serial Prefix *</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.serialPrefix || ''}
                                        onChange={e => setFormData({ ...formData, serialPrefix: e.target.value })}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                        placeholder="SN-MOT-2026-"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-4 border-t">
                                <button type="button" onClick={() => setIsProductModalOpen(false)} className="px-4 py-2 border rounded-lg text-sm text-gray-600">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">Save Product</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Batch Generate Serials Modal */}
            {isBatchModalOpen && activeProduct && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">⚡ Generate Serials for {activeProduct.title}</h3>
                            <button onClick={() => setIsBatchModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity of Units to Create</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={batchGenCount}
                                    onChange={e => setBatchGenCount(parseInt(e.target.value, 10) || 1)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                />
                            </div>
                            <div className="bg-blue-50 p-3 rounded-lg text-xs text-blue-800">
                                Starting from sequence <strong>#{activeProduct.nextSequence || 1001}</strong> with prefix <code>{activeProduct.serialPrefix}</code>.
                            </div>
                            <div className="flex justify-end gap-2 pt-4 border-t">
                                <button onClick={() => setIsBatchModalOpen(false)} className="px-4 py-2 border rounded-lg text-sm text-gray-600">Cancel</button>
                                <button onClick={handleGenerateBatchSerials} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">Generate Units</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
