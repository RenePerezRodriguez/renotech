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
    CreditCard,
    Bus,
    Send,
    Landmark,
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
            { name: 'Inicio',        icon: LayoutDashboard, href: '/inicio' },
            { name: 'Estadísticas',  icon: BarChart3,       href: '/estadisticas', hqOnly: true },
        ],
    },
    {
        title: 'Operaciones',
        items: [
            { name: 'Punto de Venta', icon: ShoppingCart,   href: '/punto-de-venta' },
            { name: 'Ventas',         icon: Receipt,         href: '/ventas' },
            { name: 'Cotizaciones',   icon: ClipboardList,   href: '/cotizaciones' },
            { name: 'Compras',        icon: Truck,           href: '/compras' },
            { name: 'Pedidos',        icon: ArrowLeftRight,  href: '/pedidos' },
            { name: 'Envíos',         icon: Send,            href: '/envios' },
        ],
    },
    {
        title: 'Clientes',
        items: [
            { name: 'Clientes',  icon: Users,      href: '/clientes' },
            { name: 'Créditos',  icon: CreditCard, href: '/creditos' },
        ],
    },
    {
        title: 'Inventario',
        items: [
            { name: 'Inventario', icon: Package,  href: '/inventario' },
            { name: 'Kardex',     icon: BookOpen, href: '/kardex' },
        ],
    },
    {
        title: 'Finanzas',
        items: [
            { name: 'Caja',      icon: Banknote, href: '/caja' },
            { name: 'Tesorería', icon: Wallet,   href: '/tesoreria', hqOnly: true },
        ],
    },
    {
        title: 'Proveedores',
        items: [
            { name: 'Proveedores',  icon: Briefcase, href: '/proveedores' },
            { name: 'Transportes',  icon: Bus,        href: '/transportes' },
        ],
    },
    {
        title: 'Administración',
        items: [
            { name: 'Gerencia',       icon: Landmark,  href: '/gerencia',       hqOnly: true },
            { name: 'Auditoría',      icon: Shield,    href: '/auditoria',      hqOnly: true },
            { name: 'Sucursales',     icon: Building2, href: '/sucursales',     hqOnly: true },
            { name: 'Usuarios',       icon: UserCog,   href: '/usuarios',       hqOnly: true },
            { name: 'Configuración',  icon: Settings,  href: '/configuracion' },
        ],
    },
];
