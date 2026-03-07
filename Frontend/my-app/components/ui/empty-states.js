'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import {
    Sparkles, Zap, Terminal, Rocket,
    Coffee, Code, Target, TrendingUp
} from 'lucide-react';

export function EmptyAutomations() {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20 px-6 font-sans"
        >
            {/* Icon */}
            <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{
                    type: 'spring',
                    stiffness: 200,
                    damping: 15,
                    delay: 0.2
                }}
                className="relative w-32 h-32 mx-auto mb-8"
            >
                {/* Glow effect */}
                <motion.div
                    animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.3, 0.5, 0.3]
                    }}
                    transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: 'easeInOut'
                    }}
                    className="absolute inset-0 rounded-full bg-emerald-500/20 blur-2xl"
                />

                {/* Icon container */}
                <div className="relative w-32 h-32 rounded-2xl bg-[#0A0A0A] border border-white/10 flex items-center justify-center">
                    <motion.div
                        animate={{
                            y: [0, -5, 0]
                        }}
                        transition={{
                            duration: 4,
                            repeat: Infinity,
                            ease: 'easeInOut'
                        }}
                    >
                        <Zap className="w-16 h-16 text-emerald-500" />
                    </motion.div>
                </div>

                {/* Floating sparkles */}
                {[...Array(3)].map((_, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{
                            opacity: [0, 1, 0],
                            scale: [0, 1, 0],
                            x: [0, (i - 1) * 30],
                            y: [0, -20 - i * 10]
                        }}
                        transition={{
                            duration: 2,
                            repeat: Infinity,
                            delay: i * 0.4
                        }}
                        className="absolute top-1/2 left-1/2"
                    >
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                    </motion.div>
                ))}
            </motion.div>

            {/* Title */}
            <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-3xl font-bold mb-3 text-white"
            >
                No Automations Yet
            </motion.h2>

            {/* Description */}
            <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-[#9CA3AF] mb-8 max-w-md mx-auto text-sm leading-relaxed"
            >
                Start building your first workflow by describing what you want to automate in natural language.
            </motion.p>

            {/* CTA Button */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
            >
                <Link href="/dashboard/create">
                    <motion.button
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        className="px-8 py-4 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-semibold flex items-center gap-2 shadow-lg shadow-emerald-900/20 hover:shadow-emerald-500/20 transition-all mx-auto"
                    >
                        <Zap className="w-5 h-5" />
                        Create Your First Automation
                        <motion.div
                            animate={{ x: [0, 5, 0] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                        >
                            →
                        </motion.div>
                    </motion.button>
                </Link>
            </motion.div>

            {/* Example prompts */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="mt-12 max-w-2xl mx-auto"
            >
                <p className="text-xs font-semibold text-[#4B5563] uppercase tracking-wider mb-4">Example Workflows</p>
                <div className="grid md:grid-cols-3 gap-3">
                    {[
                        { icon: TrendingUp, text: 'Track stock prices' },
                        { icon: Coffee, text: 'Daily email digest' },
                        { icon: Target, text: 'Monitor webhooks' }
                    ].map((example, i) => {
                        const Icon = example.icon;
                        return (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.7 + i * 0.1 }}
                                whileHover={{ y: -2, scale: 1.02 }}
                                className="bg-[#111111] rounded-lg p-4 border border-[#1F2937] hover:border-emerald-500/30 transition-all cursor-pointer text-left"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-emerald-500/10">
                                        <Icon className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                    </div>
                                    <span className="text-sm text-gray-300">{example.text}</span>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </motion.div>
        </motion.div>
    );
}


export function EmptySearchResults({ query, onClear }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16 px-6 font-sans"
        >
            <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200 }}
                className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-900/30 border-2 border-red-700 flex items-center justify-center"
            >
                <Code className="w-10 h-10 text-red-500" />
            </motion.div>

            <h3 className="text-xl font-bold mb-2 text-emerald-400">
                {'>'} search.error("no_results")
            </h3>
            <p className="text-[#4B5563] mb-6 text-sm">
                // Query "{query}" returned 0 matches
            </p>

            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onClear}
                className="px-6 py-2 rounded-lg glass border border-emerald-700 text-emerald-400 hover:bg-emerald-900/30 transition-all"
            >
                Clear Search
            </motion.button>
        </motion.div>
    );
}

export function SuccessCelebration({ message, onClose }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm font-sans"
            onClick={onClose}
        >
            {/* Confetti effect */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {[...Array(20)].map((_, i) => (
                    <motion.div
                        key={i}
                        initial={{
                            x: '50%',
                            y: '50%',
                            opacity: 1
                        }}
                        animate={{
                            x: `${Math.random() * 100}%`,
                            y: `${Math.random() * 100}%`,
                            opacity: 0,
                            rotate: Math.random() * 360
                        }}
                        transition={{
                            duration: 1.5,
                            delay: i * 0.05
                        }}
                        className="absolute w-3 h-3 rounded-full"
                        style={{
                            backgroundColor: ['#10B981', '#059669', '#34d399', '#064E3B'][i % 4]
                        }}
                    />
                ))}
            </div>

            <motion.div
                initial={{ y: 50 }}
                animate={{ y: 0 }}
                className="relative glass-strong rounded-2xl p-12 border-2 border-emerald-500 text-center max-w-md"
            >
                <motion.div
                    animate={{
                        scale: [1, 1.2, 1],
                        rotate: [0, 360]
                    }}
                    transition={{ duration: 0.6 }}
                    className="w-24 h-24 mx-auto mb-6 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center"
                >
                    <Rocket className="w-12 h-12 text-emerald-400" />
                </motion.div>

                <h2 className="text-3xl font-bold mb-3 text-emerald-400">
                    Success!
                </h2>
                <p className="text-[#9CA3AF] mb-6">{message}</p>

                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onClose}
                    className="px-6 py-3 rounded-lg bg-emerald-900/70 border-2 border-emerald-700 text-emerald-300 font-semibold"
                >
                    Continue
                </motion.button>
            </motion.div>
        </motion.div>
    );
}
