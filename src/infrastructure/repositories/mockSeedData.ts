import { Category, Product, ProductSku } from '@/domain/catalog/types';
import { PurchaseOrder } from '@/domain/procurement/types';
import { StockLevel } from '@/domain/inventory/types';
import { Customer, SalesInvoice } from '@/domain/sales/types';

// Categorías Jerárquicas (2 Niveles: Categoría Principal -> Subcategoría)
export const INITIAL_CATEGORIES: Category[] = [
  // Nivel 1: Principales
  { id: 'cat-1', name: 'Ropa Dama', slug: 'ropa-dama', description: 'Moda femenina, vestidos, blusas y conjuntos', isActive: true, displayOrder: 1 },
  { id: 'cat-2', name: 'Ropa Caballero', slug: 'ropa-caballero', description: 'Camisas, camisetas, shorts y packs masculinos', isActive: true, displayOrder: 2 },
  { id: 'cat-3', name: 'Accesorios & Móvil', slug: 'accesorios-movil', description: 'Fundas, micas, correas y protectores', isActive: true, displayOrder: 3 },
  { id: 'cat-4', name: 'Gadgets & Tecnología', slug: 'gadgets-tecnologia', description: 'Smartwatches, teclados, mouse y audífonos', isActive: true, displayOrder: 4 },
  { id: 'cat-5', name: 'Joyería & Pulseras', slug: 'joyeria-pulseras', description: 'Pulseras de acero, dijes y collares', isActive: true, displayOrder: 5 },

  // Nivel 2: Subcategorías
  { id: 'sub-101', parentId: 'cat-1', parentName: 'Ropa Dama', name: 'Vestidos & Enterizos', slug: 'vestidos-enterizos', description: 'Vestidos casuales y de fiesta', isActive: true, displayOrder: 1 },
  { id: 'sub-102', parentId: 'cat-1', parentName: 'Ropa Dama', name: 'Blusas & Tops', slug: 'blusas-tops', description: 'Tops frescos y blusas elegantes', isActive: true, displayOrder: 2 },
  { id: 'sub-103', parentId: 'cat-1', parentName: 'Ropa Dama', name: 'Pantalones & Jeans', slug: 'pantalones-jeans', description: 'Jeans high waist y pantalones casuales', isActive: true, displayOrder: 3 },

  { id: 'sub-201', parentId: 'cat-2', parentName: 'Ropa Caballero', name: 'Camisetas & Polos', slug: 'camisetas-polos', description: 'Básicas y con cuello polo', isActive: true, displayOrder: 1 },
  { id: 'sub-202', parentId: 'cat-2', parentName: 'Ropa Caballero', name: 'Packs Multipiezas', slug: 'packs-multipiezas', description: 'Paquetes de 2 o 3 prendas surtidas', isActive: true, displayOrder: 2 },

  { id: 'sub-301', parentId: 'cat-3', parentName: 'Accesorios & Móvil', name: 'Fundas iPhone', slug: 'fundas-iphone', description: 'Fundas magnéticas y antishock iPhone', isActive: true, displayOrder: 1 },
  { id: 'sub-302', parentId: 'cat-3', parentName: 'Accesorios & Móvil', name: 'Fundas Samsung & Xiaomi', slug: 'fundas-android', description: 'Fundas para modelos Galaxy y Redmi', isActive: true, displayOrder: 2 },

  { id: 'sub-401', parentId: 'cat-4', parentName: 'Gadgets & Tecnología', name: 'Smartwatches & Pulseras Smart', slug: 'smartwatches', description: 'Relojes inteligentes deportivos', isActive: true, displayOrder: 1 },
  { id: 'sub-402', parentId: 'cat-4', parentName: 'Gadgets & Tecnología', name: 'Periféricos (Mouse / Teclado)', slug: 'perifericos', description: 'Mouse gamer, teclados mecánicos y cables', isActive: true, displayOrder: 2 },
];

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    categoryId: 'cat-1',
    categoryName: 'Ropa Dama',
    subcategoryId: 'sub-101',
    subcategoryName: 'Vestidos & Enterizos',
    name: 'Vestido Casual Floral Bohemio',
    slug: 'vestido-casual-floral-bohemio',
    description: 'Vestido fresco de tela suave con estampado floral moderno para toda ocasión.',
    seoDescription: 'Comprar vestido casual floral bohemio en Nicaragua Pajarita Store.',
    productType: 'simple',
    isFeatured: true,
    isActive: true,
    skus: [
      {
        id: 'sku-101',
        productId: 'prod-1',
        skuCode: 'PS-VEST-S-ROS-101',
        skuDescription: 'Vestido Floral Rosa - Talla S',
        size: 'S',
        colorName: 'Rosa Pastel',
        colorHex: '#F472B6',
        costPriceUsd: 6.50,
        costPriceNio: 239.20,
        salePriceNio: 450.00,
        mainImageUrl: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&w=600&q=80',
        isActive: true,
      },
      {
        id: 'sku-102',
        productId: 'prod-1',
        skuCode: 'PS-VEST-M-AZU-102',
        skuDescription: 'Vestido Floral Azul - Talla M',
        size: 'M',
        colorName: 'Azul Cielo',
        colorHex: '#38BDF8',
        costPriceUsd: 6.50,
        costPriceNio: 239.20,
        salePriceNio: 450.00,
        mainImageUrl: 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=600&q=80',
        isActive: true,
      }
    ]
  },
  {
    id: 'prod-2',
    categoryId: 'cat-2',
    categoryName: 'Ropa Caballero',
    subcategoryId: 'sub-202',
    subcategoryName: 'Packs Multipiezas',
    name: 'Pack x3 Camisetas Básicas Algodón Premium',
    slug: 'pack-x3-camisetas-basicas',
    description: 'Paquete de 3 camisetas básicas de algodón peinado en colores surtidos.',
    seoDescription: 'Pack de camisetas básicas algodón para hombre.',
    productType: 'paquete',
    isFeatured: true,
    isActive: true,
    skus: [
      {
        id: 'sku-201',
        productId: 'prod-2',
        skuCode: 'PS-PACK3-M-MIX-201',
        skuDescription: 'Pack x3 Camisetas Talla M (Negro, Blanco, Gris)',
        size: 'M',
        colorName: 'Multicolor Surtido',
        colorHex: '#475569',
        costPriceUsd: 11.00,
        costPriceNio: 404.80,
        salePriceNio: 750.00,
        mainImageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=80',
        isActive: true,
      }
    ]
  },
  {
    id: 'prod-3',
    categoryId: 'cat-3',
    categoryName: 'Accesorios & Móvil',
    subcategoryId: 'sub-301',
    subcategoryName: 'Fundas iPhone',
    name: 'Funda Magnética Silicona Shockproof iPhone',
    slug: 'funda-magnetica-silicona-iphone',
    description: 'Funda protectora con anillo magnético compatible con carga MagSafe y bordes reforzados.',
    seoDescription: 'Funda magnética para iPhone en Nicaragua.',
    productType: 'simple',
    isFeatured: false,
    isActive: true,
    skus: [
      {
        id: 'sku-301',
        productId: 'prod-3',
        skuCode: 'PS-FUND-IP14-NEG-301',
        skuDescription: 'Funda iPhone 14 / 15 - Negro Mate',
        size: 'iPhone 14/15',
        colorName: 'Negro Mate',
        colorHex: '#0F172A',
        costPriceUsd: 2.20,
        costPriceNio: 80.96,
        salePriceNio: 220.00,
        mainImageUrl: 'https://images.unsplash.com/photo-1601593346740-925612772716?auto=format&fit=crop&w=600&q=80',
        isActive: true,
      },
      {
        id: 'sku-302',
        productId: 'prod-3',
        skuCode: 'PS-FUND-IP14-MOR-302',
        skuDescription: 'Funda iPhone 14 / 15 - Morado Lila',
        size: 'iPhone 14/15',
        colorName: 'Morado Lila',
        colorHex: '#A855F7',
        costPriceUsd: 2.20,
        costPriceNio: 80.96,
        salePriceNio: 220.00,
        mainImageUrl: 'https://images.unsplash.com/photo-1580910051074-3eb694886505?auto=format&fit=crop&w=600&q=80',
        isActive: true,
      }
    ]
  },
  {
    id: 'prod-4',
    categoryId: 'cat-4',
    categoryName: 'Gadgets & Tecnología',
    subcategoryId: 'sub-401',
    subcategoryName: 'Smartwatches & Pulseras Smart',
    name: 'Smartwatch Deportivo Ultra Serie 9',
    slug: 'smartwatch-deportivo-ultra-9',
    description: 'Reloj inteligente con monitor de ritmo cardíaco, llamadas bluetooth y resistencia al agua.',
    seoDescription: 'Smartwatch Ultra serie 9 envío inmediato en Managua.',
    productType: 'simple',
    isFeatured: true,
    isActive: true,
    skus: [
      {
        id: 'sku-401',
        productId: 'prod-4',
        skuCode: 'PS-SMART-UNI-TIT-401',
        skuDescription: 'Smartwatch Ultra 9 - Titanio Naranja',
        size: '49mm',
        colorName: 'Naranja Deportivo',
        colorHex: '#F97316',
        costPriceUsd: 14.50,
        costPriceNio: 533.60,
        salePriceNio: 980.00,
        mainImageUrl: 'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?auto=format&fit=crop&w=600&q=80',
        isActive: true,
      }
    ]
  }
];

export const INITIAL_PURCHASE_ORDERS: PurchaseOrder[] = [
  {
    id: 'po-001',
    orderNumber: 'LOT-SH-2026-08',
    supplierName: 'Shein USA',
    supplierOrderId: 'GSHM293847291',
    trackingNumber: 'TBA309482948201',
    modality: 'simple',
    status: 'en_transito_nicaragua',
    datePurchased: '2026-08-15',
    dateDeliveredToAgency: '2026-08-19',
    totalCostUsd: 185.50,
    totalCostNio: 6826.40,
    totalImportExpensesNio: 850.00,
    items: [
      {
        id: 'pi-1',
        purchaseOrderId: 'po-001',
        skuId: 'sku-101',
        skuCode: 'PS-VEST-S-ROS-101',
        productName: 'Vestido Casual Floral Bohemio',
        quantityOrdered: 8,
        quantityReceived: 0,
        unitCostUsd: 6.50,
        unitCostNio: 239.20,
        proratedExpenseNio: 35.50,
        totalLandedCostNio: 274.70,
        suggestedSalePriceNio: 450.00,
        receptionStatus: 'pendiente',
      },
      {
        id: 'pi-2',
        purchaseOrderId: 'po-001',
        skuId: 'sku-301',
        skuCode: 'PS-FUND-IP14-NEG-301',
        productName: 'Funda Magnética Silicona Shockproof',
        quantityOrdered: 20,
        quantityReceived: 0,
        unitCostUsd: 2.20,
        unitCostNio: 80.96,
        proratedExpenseNio: 12.00,
        totalLandedCostNio: 92.96,
        suggestedSalePriceNio: 220.00,
        receptionStatus: 'pendiente',
      }
    ],
    expenses: [
      { id: 'exp-1', purchaseOrderId: 'po-001', concept: 'Flete Aéreo Casillero Miami -> MGA', amountUsd: 18.00, amountNio: 662.40 },
      { id: 'exp-2', purchaseOrderId: 'po-001', concept: 'Trámite y Entrega Local', amountUsd: 5.10, amountNio: 187.60 }
    ],
    notes: 'Lote semanal de reposición de inventario de vestidos y fundas.'
  },
  {
    id: 'po-002',
    orderNumber: 'LOT-AMZ-2026-09',
    supplierName: 'Amazon USA',
    supplierOrderId: '114-8928374-293847',
    trackingNumber: '9374829384729182',
    modality: 'especial',
    status: 'en_agencia_envio',
    datePurchased: '2026-08-20',
    totalCostUsd: 78.00,
    totalCostNio: 2870.40,
    totalImportExpensesNio: 350.00,
    items: [
      {
        id: 'pi-3',
        purchaseOrderId: 'po-002',
        skuId: 'sku-401',
        skuCode: 'PS-SMART-UNI-TIT-401',
        productName: 'Smartwatch Deportivo Ultra Serie 9',
        quantityOrdered: 4,
        quantityReceived: 0,
        unitCostUsd: 14.50,
        unitCostNio: 533.60,
        proratedExpenseNio: 87.50,
        totalLandedCostNio: 621.10,
        suggestedSalePriceNio: 980.00,
        receptionStatus: 'pendiente',
      }
    ],
    expenses: [
      { id: 'exp-3', purchaseOrderId: 'po-002', concept: 'Flete Aéreo Priority', amountUsd: 9.50, amountNio: 350.00 }
    ],
    notes: 'Pedido especial solicitado bajo encargo de clientes de Instagram.'
  }
];

export const INITIAL_CUSTOMERS: Customer[] = [
  { id: 'cust-1', fullName: 'Valeria Méndez Morales', identificationNumber: '001-140598-1002K', phoneWhatsapp: '+505 8899-7766', address: 'Altamira D’Este, casa #42', city: 'Managua', notes: 'Cliente frecuente, suele pagar en 3 abonos quincenales.' },
  { id: 'cust-2', fullName: 'Carlos Eduardo Rivas', identificationNumber: '001-220894-0044L', phoneWhatsapp: '+505 8455-1122', address: 'Bello Horizonte, VI Etapa', city: 'Managua', notes: 'Compras al contado.' },
  { id: 'cust-3', fullName: 'Sofia Gabriela Castillo', identificationNumber: '281-050301-1005W', phoneWhatsapp: '+505 8733-4499', address: 'Reparto San Juan', city: 'Granada', notes: 'Crédito activo 30 días.' }
];

export const INITIAL_INVOICES: SalesInvoice[] = [
  {
    id: 'inv-001',
    invoiceNumber: 'FAC-00104',
    customerId: 'cust-1',
    customerName: 'Valeria Méndez Morales',
    customerPhone: '+505 8899-7766',
    customerIdentification: '001-140598-1002K',
    customerAddress: 'Altamira D’Este, casa #42',
    saleType: 'normal',
    paymentTerm: 'credito',
    status: 'parcial',
    issueDate: '2026-08-10',
    dueDate: '2026-09-10',
    subtotalSinIvaNio: 1200.00,
    subtotalNio: 1200.00,
    discountNio: 0.00,
    ivaRate: 0.15,
    ivaTotalNio: 180.00,
    totalConIvaNio: 1380.00,
    totalNio: 1380.00,
    amountPaidNio: 500.00,
    balanceDueNio: 880.00,
    items: [
      {
        skuId: 'sku-101',
        skuCode: 'PS-VEST-S-ROS-101',
        productName: 'Vestido Casual Floral Bohemio',
        size: 'S',
        colorName: 'Rosa Pastel',
        mainImageUrl: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&w=600&q=80',
        quantity: 2,
        regularPriceSinIvaNio: 420.00,
        unitPriceSinIvaNio: 391.30,
        unitPriceNio: 391.30,
        ivaAmountNio: 117.40,
        unitCostNio: 274.70,
        discountNio: 0,
        lineTotalSinIvaNio: 782.60,
        lineTotalNio: 900.00,
        lineTotalConIvaNio: 900.00,
      },
      {
        skuId: 'sku-301',
        skuCode: 'PS-FUND-IP14-NEG-301',
        productName: 'Funda Magnética Silicona Shockproof',
        size: 'iPhone 14/15',
        colorName: 'Negro Mate',
        mainImageUrl: 'https://images.unsplash.com/photo-1601593346740-925612772716?auto=format&fit=crop&w=600&q=80',
        quantity: 2,
        regularPriceSinIvaNio: 220.00,
        unitPriceSinIvaNio: 191.30,
        promoPriceSinIvaNio: 191.30,
        unitPriceNio: 191.30,
        ivaAmountNio: 57.40,
        unitCostNio: 92.96,
        discountNio: 0,
        lineTotalSinIvaNio: 382.60,
        lineTotalNio: 440.00,
        lineTotalConIvaNio: 440.00,
      }
    ],
    payments: [
      { id: 'pay-1', invoiceId: 'inv-001', paymentDate: '2026-08-10', amountNio: 500.00, paymentMethod: 'transferencia_bancaria', referenceNumber: 'BAC-TR-884920', receiptNumber: 'REC-001', notes: 'Primer abono inicial al retirar prendas.' }
    ],
    notes: 'Abonará el saldo restante en dos pagos quincenales.'
  },
  {
    id: 'inv-002',
    invoiceNumber: 'FAC-00105',
    customerId: 'cust-2',
    customerName: 'Carlos Eduardo Rivas',
    customerPhone: '+505 8455-1122',
    customerIdentification: '001-220894-0044L',
    customerAddress: 'Bello Horizonte, VI Etapa',
    saleType: 'normal',
    paymentTerm: 'contado',
    status: 'pagada',
    issueDate: '2026-08-18',
    subtotalSinIvaNio: 852.17,
    subtotalNio: 852.17,
    discountNio: 0.00,
    ivaRate: 0.15,
    ivaTotalNio: 127.83,
    totalConIvaNio: 980.00,
    totalNio: 980.00,
    amountPaidNio: 980.00,
    balanceDueNio: 0.00,
    items: [
      {
        skuId: 'sku-401',
        skuCode: 'PS-SMART-UNI-TIT-401',
        productName: 'Smartwatch Deportivo Ultra Serie 9',
        size: '49mm',
        colorName: 'Naranja Deportivo',
        mainImageUrl: 'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?auto=format&fit=crop&w=600&q=80',
        quantity: 1,
        regularPriceSinIvaNio: 852.17,
        unitPriceSinIvaNio: 852.17,
        unitPriceNio: 852.17,
        ivaAmountNio: 127.83,
        unitCostNio: 621.10,
        discountNio: 0,
        lineTotalSinIvaNio: 852.17,
        lineTotalNio: 980.00,
        lineTotalConIvaNio: 980.00,
      }
    ],
    payments: [
      { id: 'pay-2', invoiceId: 'inv-002', paymentDate: '2026-08-18', amountNio: 980.00, paymentMethod: 'efectivo_cordobas', receiptNumber: 'REC-002', notes: 'Pago completo de contado en tienda.' }
    ]
  }
];

export const INITIAL_STOCK: StockLevel[] = [
  { skuId: 'sku-101', skuCode: 'PS-VEST-S-ROS-101', productName: 'Vestido Casual Floral Bohemio', skuDescription: 'Vestido Floral Rosa - Talla S', size: 'S', colorName: 'Rosa Pastel', colorHex: '#F472B6', costPriceNio: 274.70, salePriceNio: 450.00, quantityAvailable: 14, quantityReserved: 2 },
  { skuId: 'sku-102', skuCode: 'PS-VEST-M-AZU-102', productName: 'Vestido Casual Floral Bohemio', skuDescription: 'Vestido Floral Azul - Talla M', size: 'M', colorName: 'Azul Cielo', colorHex: '#38BDF8', costPriceNio: 274.70, salePriceNio: 450.00, quantityAvailable: 8, quantityReserved: 0 },
  { skuId: 'sku-201', skuCode: 'PS-PACK3-M-MIX-201', productName: 'Pack x3 Camisetas Básicas Algodón', skuDescription: 'Pack x3 Camisetas Talla M', size: 'M', colorName: 'Multicolor Surtido', colorHex: '#475569', costPriceNio: 404.80, salePriceNio: 750.00, quantityAvailable: 6, quantityReserved: 0 },
  { skuId: 'sku-301', skuCode: 'PS-FUND-IP14-NEG-301', productName: 'Funda Magnética Silicona', skuDescription: 'Funda iPhone 14 / 15 - Negro Mate', size: 'iPhone 14/15', colorName: 'Negro Mate', colorHex: '#0F172A', costPriceNio: 92.96, salePriceNio: 220.00, quantityAvailable: 25, quantityReserved: 1 },
  { skuId: 'sku-302', skuCode: 'PS-FUND-IP14-MOR-302', productName: 'Funda Magnética Silicona', skuDescription: 'Funda iPhone 14 / 15 - Morado Lila', size: 'iPhone 14/15', colorName: 'Morado Lila', colorHex: '#A855F7', costPriceNio: 92.96, salePriceNio: 220.00, quantityAvailable: 18, quantityReserved: 0 },
  { skuId: 'sku-401', skuCode: 'PS-SMART-UNI-TIT-401', productName: 'Smartwatch Deportivo Ultra Serie 9', skuDescription: 'Smartwatch Ultra 9 - Titanio', size: '49mm', colorName: 'Naranja Deportivo', colorHex: '#F97316', costPriceNio: 621.10, salePriceNio: 980.00, quantityAvailable: 5, quantityReserved: 0 },
];
