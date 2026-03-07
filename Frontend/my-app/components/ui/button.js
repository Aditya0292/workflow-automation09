'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const variants = {
    default: 'bg-emerald-900/70 border-2 border-emerald-700 text-emerald-300 hover:bg-emerald-800/70 shadow-lg shadow-emerald-900/30 hover:shadow-emerald-700/50 font-sans',
    secondary: 'bg-black/60 border border-emerald-900 text-emerald-600 hover:bg-emerald-950/30 hover:border-emerald-700 font-sans',
    outline: 'border-2 border-emerald-700 text-emerald-500 hover:bg-emerald-950/30 font-sans',
    ghost: 'hover:bg-emerald-950/30 text-emerald-500 font-sans',
    danger: 'bg-red-950/50 border-2 border-red-800 text-red-500 hover:bg-red-900/50 hover:border-red-700 font-sans'
};

const sizes = {
    default: 'h-10 px-4 py-2',
    sm: 'h-9 px-3 text-sm',
    lg: 'h-12 px-6 text-base',
};

export function Button({
    children,
    variant = 'default',
    size = 'default',
    className,
    ...props
}) {
    return (
        <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
                'inline-flex items-center justify-center rounded-lg font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:pointer-events-none disabled:opacity-50',
                variants[variant],
                sizes[size],
                className
            )}
            {...props}
        >
            {children}
        </motion.button>
    );
}
