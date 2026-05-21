'use client';

import { useState } from 'react';
import { flushSync } from 'react-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { logAdminAction } from '@/lib/audit';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
    Lock, Mail, Loader2, AlertCircle, Eye, EyeOff,
    BarChart3, Package, ShoppingCart, Users,
    ShieldCheck, Zap, TrendingUp, Globe,
} from 'lucide-react';

/* ────────────────────────────────────────────────────────────
   SPLASH SCREEN — shown for 2 s after successful login
──────────────────────────────────────────────────────────── */
function SplashScreen({ name }: { name: string }) {
    return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center relative" style={{ backgroundColor: '#020617' }}>
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-yellow-500/60 to-transparent" />

            <div className="flex flex-col items-center gap-8">
                {/* Logo */}
                <div className="bg-slate-900 p-5 rounded-3xl border border-white/10 shadow-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo.png" alt="Renotech" className="h-10 w-auto object-contain" />
                </div>

                <div className="text-center space-y-1.5">
                    <h1 className="text-3xl font-black tracking-tighter text-white uppercase">
                        RENO<span className="text-yellow-400">TECH</span>
                    </h1>
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">
                        Bienvenido, <span className="text-white font-black">{name}</span>
                    </p>
                </div>

                {/* Progress bar */}
                <div className="flex flex-col items-center gap-3 w-56">
                    <div className="w-full h-[3px] bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400 rounded-full [animation:splash-progress_1.8s_cubic-bezier(0.4,0,0.2,1)_forwards]" />
                    </div>
                    <p className="text-[8px] font-black uppercase tracking-[0.35em] text-slate-500">
                        Iniciando sistema...
                    </p>
                </div>
            </div>

        </div>
    );
}

/* ────────────────────────────────────────────────────────────
   FEATURE CARDS — left panel
──────────────────────────────────────────────────────────── */
const FEATURES = [
    { icon: Package,      label: 'Inventario',  sub: 'Control en tiempo real'  },
    { icon: ShoppingCart, label: 'Ventas',       sub: 'POS y cotizaciones'      },
    { icon: BarChart3,    label: 'Reportes',     sub: 'Analítica avanzada'      },
    { icon: Users,        label: 'Clientes',     sub: 'CRM y créditos'          },
];

const STATS = [
    { icon: Zap,        label: 'Alta velocidad', value: '< 1s' },
    { icon: TrendingUp, label: 'Uptime',          value: '99.9%' },
    { icon: ShieldCheck,label: 'Seguridad',       value: 'ISO 27001' },
];

/* ────────────────────────────────────────────────────────────
   MAIN LOGIN PAGE
──────────────────────────────────────────────────────────── */
export default function LoginPage() {
    const [email, setEmail]               = useState('');
    const [password, setPassword]         = useState('');
    const [error, setError]               = useState('');
    const [loading, setLoading]           = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showSplash, setShowSplash]     = useState(false);
    const [splashName, setSplashName]     = useState('');
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const cred = await signInWithEmailAndPassword(auth, email, password);
            const displayName = cred.user.displayName || email;
            flushSync(() => { setSplashName(displayName); setShowSplash(true); });
            logAdminAction(cred.user.uid, email, 'LOGIN_SUCCESS', cred.user.uid, 'GLOBAL', 'Inicio de sesión exitoso').catch(() => {});
            setTimeout(() => router.push('/inicio'), 2000);
        } catch (err: unknown) {
            const e2 = err as { code?: string };
            let msg = 'Error al iniciar sesión';
            if (e2.code === 'auth/invalid-credential') msg = 'Credenciales incorrectas. Verifica tu email y contraseña.';
            if (e2.code === 'auth/too-many-requests')  msg = 'Demasiados intentos fallidos. Intenta más tarde.';
            if (e2.code === 'auth/user-disabled')      msg = 'Esta cuenta está deshabilitada.';
            setError(msg);
            setLoading(false);
        }
    };

    if (showSplash) return <SplashScreen name={splashName} />;

    return (
        <div className="flex min-h-screen bg-[#020617] overflow-hidden">

            {/* ══════════════════════════════════════════════════════
                LEFT — Brand / Marketing Panel
            ══════════════════════════════════════════════════════ */}
            <div className="hidden lg:flex lg:w-[56%] xl:w-[58%] flex-col relative overflow-hidden" style={{ background: 'linear-gradient(145deg, #0f172a 0%, #0d1526 60%, #0a1020 100%)' }}>

                {/* ── Decorative layers ── */}
                {/* Grid dot pattern */}
                <div className="absolute inset-0 opacity-[0.035] pointer-events-none"
                    style={{ backgroundImage: 'radial-gradient(circle, #94a3b8 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
                {/* Central glow orb */}
                <div className="absolute top-1/2 left-1/2 w-[500px] h-[500px] bg-yellow-500/5 rounded-full blur-[100px] pointer-events-none -translate-x-1/2 -translate-y-1/2" />
                {/* Bottom-left accent */}
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/3 rounded-full blur-[80px] pointer-events-none" />
                {/* Top accent line */}
                <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-yellow-500/50 to-transparent" />
                {/* Right edge gradient (bleeds into the form panel) */}
                <div className="absolute top-0 right-0 bottom-0 w-16 bg-gradient-to-r from-transparent to-[#020617]/60 pointer-events-none" />

                {/* Todo centrado horizontalmente */}
                <div className="relative z-10 flex flex-col h-full items-center justify-between py-12">
                    <div className="w-full px-14 xl:px-16 2xl:px-20 animate-in fade-in slide-in-from-bottom-6 duration-700">

                        {/* ── Brand mark ── */}
                        <div className="flex items-center gap-4 mb-12">
                            <div className="shrink-0 w-[72px] h-[72px] bg-black rounded-2xl border border-white/10 shadow-xl shadow-black/60 ring-1 ring-yellow-500/20 flex items-center justify-center overflow-hidden">
                                <Image src="/logo.png" alt="Renotech" width={56} height={56} className="object-contain w-14 h-14" />
                            </div>
                            <h2 className="text-xl font-black text-white uppercase tracking-wider leading-none">
                                RENO<span className="text-[#FFD700]">TECH</span>
                            </h2>
                        </div>

                        {/* ── Eyebrow ── */}
                        <div className="flex items-center gap-2 mb-5">
                            <div className="h-px w-6 bg-yellow-500/60" />
                            <p className="text-[8.5px] font-black uppercase tracking-[0.4em] text-yellow-500">
                                Sistema de Gestión Empresarial
                            </p>
                        </div>

                        {/* ── Headline ── */}
                        <h1 className="text-6xl xl:text-7xl 2xl:text-8xl font-black text-white leading-[0.87] tracking-tighter mb-6">
                            Control<br />
                            <span className="text-[#FFD700]">Total</span><br />
                            de tu<br />
                            Negocio.
                        </h1>

                        {/* ── Subline ── */}
                        <p className="text-slate-400 text-[13px] leading-relaxed mb-8">
                            Inventario, ventas, créditos y reportes integrados en una sola plataforma de alto rendimiento.
                        </p>

                        {/* ── Stats ── */}
                        <div className="flex items-center gap-6 mb-8 pb-8 border-b border-white/5">
                            {STATS.map(({ icon: Icon, label, value }) => (
                                <div key={label} className="flex flex-col items-start gap-1">
                                    <div className="flex items-center gap-1.5">
                                        <Icon size={10} className="text-yellow-500" />
                                        <span className="text-[7.5px] font-black uppercase tracking-widest text-slate-500">{label}</span>
                                    </div>
                                    <span className="text-sm font-black text-white tabular-nums">{value}</span>
                                </div>
                            ))}
                        </div>

                        {/* ── Features ── */}
                        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                            {FEATURES.map(({ icon: Icon, label, sub }) => (
                                <div
                                    key={label}
                                    className="group flex items-center gap-2.5 p-2.5 rounded-xl border border-white/6 hover:border-yellow-500/20 hover:bg-yellow-500/3 transition-all duration-300 cursor-default"
                                    style={{ background: 'rgba(255,255,255,0.025)' }}
                                >
                                    <div className="w-7 h-7 rounded-xl bg-yellow-500/10 border border-yellow-500/15 flex items-center justify-center shrink-0 group-hover:bg-yellow-500/15 transition-colors">
                                        <Icon size={13} className="text-yellow-400" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[8.5px] font-black uppercase tracking-widest text-white leading-none truncate">{label}</p>
                                        <p className="text-[7.5px] text-slate-600 mt-0.5 truncate">{sub}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── Footer ── */}
                    <div className="w-full px-14 xl:px-16 2xl:px-20 border-t border-white/5 pt-5">
                        <p className="text-[7.5px] text-slate-700 font-bold uppercase tracking-[0.2em] mb-1.5">
                            © 2025 Renotech · Todos los derechos reservados
                        </p>
                        <div className="flex items-center gap-1.5">
                            <Globe size={8} className="text-slate-700 shrink-0" />
                            <p className="text-[7.5px] text-slate-700 font-bold tracking-wider">
                                Desarrollado y diseñado por{' '}
                                <a href="https://safesoft.tech" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-yellow-500 transition-colors">safesoft.tech</a>
                                {' '}·{' '}
                                <a href="https://desarrollowebbolivia.com" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-yellow-500 transition-colors">desarrollowebbolivia.com</a>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════
                RIGHT — Login Form
            ══════════════════════════════════════════════════════ */}
            <div className="flex-1 flex flex-col relative overflow-hidden" data-theme="light" style={{ background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)' }}>
                {/* Subtle top-right accent */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-400/5 rounded-full blur-[80px] pointer-events-none" />
                {/* Subtle bottom-left */}
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-slate-200/60 rounded-full blur-[60px] pointer-events-none" />

                {/* ── Form area ── */}
                <div className="flex-1 flex items-center justify-center p-8 sm:p-12 relative z-10">
                    <div className="w-full max-w-[360px] animate-in fade-in slide-in-from-bottom-8 duration-700 [animation-delay:150ms] fill-mode-both">

                        {/* Mobile logo */}
                        <div className="flex justify-center mb-8 lg:hidden">
                            <div className="bg-black p-4 rounded-3xl border border-white/10 shadow-xl">
                                <Image src="/logo.png" alt="Renotech" width={140} height={46} className="object-contain" />
                            </div>
                        </div>

                        {/* Heading block */}
                        <div className="mb-8">
                            <div className="flex items-center gap-2 mb-1">
                                <div className="h-5 w-1 bg-yellow-500 rounded-full" />
                                <p className="text-[8px] font-black uppercase tracking-[0.35em] text-slate-400">
                                    Inicio de sesión
                                </p>
                            </div>
                            <h1 className="text-[1.6rem] font-black text-slate-900 tracking-tight uppercase leading-tight">
                                Bienvenido<br />de vuelta
                            </h1>
                            <p className="text-slate-400 text-[11px] mt-2 font-medium">
                                Ingresa tus credenciales para continuar
                            </p>
                        </div>

                        {/* Form card */}
                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xl shadow-slate-200/60 p-6 mb-4">
                            <form className="space-y-4" onSubmit={handleLogin}>

                                {/* Email */}
                                <div>
                                    <label className="text-[8px] font-black uppercase tracking-[0.25em] text-slate-400 mb-1.5 block">
                                        Correo Electrónico
                                    </label>
                                    <div className="relative group">
                                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                                            <Mail className="h-4 w-4 text-slate-300 group-focus-within:text-yellow-500 transition-colors" />
                                        </div>
                                        <input
                                            id="email"
                                            type="email"
                                            autoComplete="email"
                                            required
                                            className="block w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-slate-900 placeholder-slate-300 focus:border-yellow-500 focus:ring-4 focus:ring-yellow-500/10 focus:bg-white text-sm transition-all outline-none font-medium"
                                            placeholder="usuario@empresa.com"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* Password */}
                                <div>
                                    <label className="text-[8px] font-black uppercase tracking-[0.25em] text-slate-400 mb-1.5 block">
                                        Contraseña
                                    </label>
                                    <div className="relative group">
                                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                                            <Lock className="h-4 w-4 text-slate-300 group-focus-within:text-yellow-500 transition-colors" />
                                        </div>
                                        <input
                                            id="password"
                                            type={showPassword ? 'text' : 'password'}
                                            autoComplete="current-password"
                                            required
                                            className="block w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-11 text-slate-900 placeholder-slate-300 focus:border-yellow-500 focus:ring-4 focus:ring-yellow-500/10 focus:bg-white text-sm transition-all outline-none font-medium"
                                            placeholder="••••••••••••"
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(v => !v)}
                                            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-300 hover:text-slate-600 transition-colors"
                                            tabIndex={-1}
                                        >
                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Error */}
                                {error && (
                                    <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 p-3 text-[11px] font-bold text-rose-600 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <AlertCircle className="h-4 w-4 shrink-0 mt-px" />
                                        <span>{error}</span>
                                    </div>
                                )}

                                {/* Submit */}
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full flex justify-center items-center gap-2.5 rounded-xl bg-yellow-500 py-3.5 text-[11px] font-black text-black uppercase tracking-[0.15em] transition-all hover:bg-yellow-400 hover:shadow-lg hover:shadow-yellow-500/30 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed mt-1"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Verificando...
                                        </>
                                    ) : (
                                        <>
                                            <ShieldCheck className="h-4 w-4" />
                                            Iniciar Sesión
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>

                        {/* Security note */}
                        <div className="flex items-center justify-center gap-1.5 text-[9px] text-slate-400 font-medium">
                            <ShieldCheck size={10} className="text-emerald-500" />
                            <span>Conexión segura · Acceso Restringido</span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
