'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader, Sparkles, Zap, Terminal } from 'lucide-react';

export function LoadingSpinner({ size = 'md', text = '' }) {
    const sizes = {
        sm: 'w-4 h-4',
        md: 'w-8 h-8',
        lg: 'w-12 h-12'
    };

    return (
        <div className="flex flex-col items-center justify-center gap-3">
            <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
                <Loader className={`${sizes[size]} text-emerald-500`} />
            </motion.div>
            {text && (
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-sm text-emerald-400 font-sans"
                >
                    {text}
                </motion.p>
            )}
        </div>
    );
}

export function AIThinkingLoader({ message = 'AI is processing your request...' }) {
    return (
        <div className="flex items-center justify-center py-12">
            <div className="glass-strong rounded-2xl p-8 border border-emerald-700/50 max-w-md w-full">
                <div className="flex items-center gap-4">
                    {/* Animated AI Brain */}
                    <motion.div
                        animate={{
                            scale: [1, 1.1, 1],
                            rotate: [0, 5, -5, 0]
                        }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-900/50 to-emerald-900/50 border-2 border-emerald-500 flex items-center justify-center"
                    >
                        <Sparkles className="w-8 h-8 text-emerald-400" />
                    </motion.div>

                    {/* Loading Text with Dots */}
                    <div className="flex-1">
                        <motion.p
                            className="text-emerald-400 font-sans mb-2"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                        >
                            {message}
                        </motion.p>
                        <div className="flex gap-1">
                            {[...Array(3)].map((_, i) => (
                                <motion.div
                                    key={i}
                                    animate={{
                                        scale: [1, 1.5, 1],
                                        opacity: [0.5, 1, 0.5]
                                    }}
                                    transition={{
                                        duration: 1,
                                        repeat: Infinity,
                                        delay: i * 0.2
                                    }}
                                    className="w-2 h-2 rounded-full bg-emerald-500"
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Progress Bar */}
                <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="h-1 bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full mt-4 origin-left"
                />
            </div>
        </div>
    );
}

export function ProgressBar({ progress = 0, steps = [], currentStep = 0 }) {
    return (
        <div className="w-full">
            {/* Steps */}
            <div className="flex items-center justify-between mb-4">
                {steps.map((step, index) => (
                    <motion.div
                        key={index}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="flex flex-col items-center gap-2 flex-1"
                    >
                        <motion.div
                            animate={{
                                scale: index === currentStep ? [1, 1.1, 1] : 1
                            }}
                            transition={{ duration: 0.5 }}
                            className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-sans text-sm ${index < currentStep
                                ? 'bg-emerald-500 border-emerald-500 text-black'
                                : index === currentStep
                                    ? 'border-emerald-500 text-emerald-400 bg-emerald-900/30'
                                    : 'border-emerald-900 text-emerald-800 bg-black/30'
                                }`}
                        >
                            {index < currentStep ? '✓' : index + 1}
                        </motion.div>
                        <span
                            className={`text-xs font-sans ${index <= currentStep ? 'text-emerald-400' : 'text-emerald-800'
                                }`}
                        >
                            {step}
                        </span>
                    </motion.div>
                ))}
            </div>

            {/* Progress Bar */}
            <div className="relative h-2 bg-emerald-950 rounded-full overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full"
                />
            </div>

            {/* Percentage */}
            <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-right text-sm text-[#9CA3AF] font-sans mt-2"
            >
                {progress}% complete
            </motion.p>
        </div>
    );
}

export function PulseLoader() {
    return (
        <div className="flex items-center gap-2">
            {[...Array(3)].map((_, i) => (
                <motion.div
                    key={i}
                    animate={{
                        scale: [1, 1.5, 1],
                        backgroundColor: ['#10B981', '#059669', '#10B981']
                    }}
                    transition={{
                        duration: 1,
                        repeat: Infinity,
                        delay: i * 0.15
                    }}
                    className="w-3 h-3 rounded-full bg-emerald-500"
                />
            ))}
        </div>
    );
}

export function TerminalLoader({ commands = [] }) {
    const [currentCommand, setCurrentCommand] = useState(0);

    useEffect(() => {
        if (currentCommand < commands.length - 1) {
            const timer = setTimeout(() => {
                setCurrentCommand(c => c + 1);
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [currentCommand, commands]);

    return (
        <div className="glass-strong rounded-xl p-6 border border-emerald-700/50 font-mono max-w-2xl mx-auto">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-emerald-900">
                <Terminal className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-emerald-600">terminal</span>
            </div>

            <div className="space-y-2">
                {commands.slice(0, currentCommand + 1).map((cmd, index) => (
                    <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-2"
                    >
                        <span className="text-emerald-500">$</span>
                        <span className="text-emerald-400">{cmd}</span>
                        {index === currentCommand && (
                            <motion.span
                                animate={{ opacity: [1, 0] }}
                                transition={{ duration: 0.8, repeat: Infinity }}
                                className="inline-block w-2 h-4 bg-emerald-500"
                            />
                        )}
                    </motion.div>
                ))}
            </div>
        </div>
    );
}
