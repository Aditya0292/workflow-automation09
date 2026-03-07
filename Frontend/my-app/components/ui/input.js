'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export function Input({
    label,
    error,
    className,
    icon: Icon,
    ...props
}) {
    return (
        <div className="w-full">
            {label && (
                <label className="block text-sm font-semibold text-emerald-500 mb-2 font-sans">
                    {label}
                </label>
            )}
            <div className="relative">
                {Icon && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-700">
                        <Icon className="w-5 h-5" />
                    </div>
                )}
                <motion.input
                    whileFocus={{ scale: 1.01 }}
                    className={cn(
                        'w-full px-4 py-3 rounded-lg bg-black/60 border border-[#1F2937]',
                        'text-[#F9FAFB] placeholder-[#4B5563] font-sans',
                        'focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500',
                        'transition-all duration-200',
                        Icon && 'pl-11',
                        error && 'border-red-800 focus:ring-red-700',
                        className
                    )}
                    {...props}
                />
            </div>
            {error && (
                <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-1 text-sm text-red-400"
                >
                    {error}
                </motion.p>
            )}
        </div>
    );
}
