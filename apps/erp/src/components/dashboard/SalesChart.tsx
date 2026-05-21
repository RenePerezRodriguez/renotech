'use client';

import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

interface ChartData {
    name: string;
    total: number;
}

interface SalesChartProps {
    data: ChartData[];
}

export default function SalesChart({ data }: SalesChartProps) {
    return (
        <div className="flex-1 w-full h-full min-h-87.5 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#eab308" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid 
                        strokeDasharray="8 8" 
                        vertical={false} 
                        stroke="#64748b" 
                        opacity={0.1} 
                    />
                    <XAxis
                        dataKey="name"
                        tick={{ fontSize: 9, fill: '#64748b', fontWeight: '900' }}
                        axisLine={false}
                        tickLine={false}
                        dy={15}
                        style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}
                    />
                    <YAxis
                        tick={{ fontSize: 9, fill: '#64748b', fontWeight: '900' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(value) => `Bs. ${value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value}`}
                        dx={-10}
                    />
                    <Tooltip
                        cursor={{ stroke: '#eab308', strokeWidth: 1, strokeDasharray: '4 4' }}
                        content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                                return (
                                    <div className="bg-slate-900/90 dark:bg-[#111827]/95 border border-white/10 p-4 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">{label}</p>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-[10px] font-black text-yellow-500/50">Bs.</span>
                                            <span className="text-xl font-black text-white tracking-tighter">
                                                {payload[0].value?.toLocaleString('es-BO')}
                                            </span>
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        }}
                    />
                    <Area
                        type="monotone"
                        dataKey="total"
                        stroke="#eab308"
                        strokeWidth={4}
                        fillOpacity={1}
                        fill="url(#colorTotal)"
                        animationDuration={2000}
                        animationEasing="ease-in-out"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
