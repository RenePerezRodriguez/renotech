import { 
    LucideIcon,
    LayoutDashboard,
    ShoppingCart,
    Package,
    Users,
    Settings,
    Receipt,
    Banknote,
    Wallet,
    Truck,
    UserCog,
    BarChart3,
    ClipboardList,
    Building2,
    ArrowLeftRight,
    Shield,
    BookOpen,
    Briefcase,
    Layers,
    Bus,
    Send
} from 'lucide-react';

export interface MenuItem {
    name: string;
    icon: LucideIcon;
    href: string;
    hqOnly?: boolean;
}

export interface MenuGroup {
    title: string;
    items: MenuItem[];
}

export const menuGroups: MenuGroup[] = [
    {
        title: 'Principal',
        items: [
            { name: 'Dashboard', icon: LayoutDashboard, href: '/inicio' },
        ]
    },
    {
        title: 'Ventas',
        items: [
            { name: 'POS', icon: ShoppingCart, href: '/punto-de-venta' },
            { name: 'Cotizaciones', icon: ClipboardList, href: '/cotizaciones' },
            { name: 'Ventas', icon: Receipt, href: '/ventas' },
            { name: 'Clientes', icon: Users, href: '/clientes' },
            { name: 'Créditos', icon: Layers, href: '/creditos' },
        ]
    },
    {
        title: 'Tesorería',
        items: [
            { name: 'Caja', icon: Banknote, href: '/caja' },
            { name: 'Tesorería', icon: Wallet, href: '/tesoreria', hqOnly: true },
        ]
    },
    {
        title: 'Inventario y Logística',
        items: [
            { name: 'Inventario', icon: Package, href: '/inventario' },
            { name: 'Pedidos', icon: ArrowLeftRight, href: '/pedidos' },
            { name: 'Envíos', icon: Send, href: '/envios' },
            { name: 'Transportes', icon: Bus, href: '/transportes' },
        ]
    },
    {
        title: 'Compras',
        items: [
            { name: 'Compras', icon: Truck, href: '/compras' },
            { name: 'Proveedores', icon: Briefcase, href: '/proveedores' },
        ]
    },
    {
        title: 'Control y Auditoría',
        items: [
            { name: 'Kardex', icon: BookOpen, href: '/kardex' },
            { name: 'Auditoría', icon: Shield, href: '/auditoria', hqOnly: true },
            { name: 'Estadísticas', icon: BarChart3, href: '/estadisticas', hqOnly: true },
            { name: 'Gerencia', icon: Briefcase, href: '/gerencia', hqOnly: true },
        ]
    },
    {
        title: 'Administración',
        items: [
            { name: 'Sucursales', icon: Building2, href: '/sucursales', hqOnly: true },
            { name: 'Usuarios', icon: UserCog, href: '/usuarios', hqOnly: true },
            { name: 'Configuración', icon: Settings, href: '/configuracion' },
        ]
    },
];

