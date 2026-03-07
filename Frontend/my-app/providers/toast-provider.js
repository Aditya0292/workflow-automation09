'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, Info, AlertTriangle, X, Terminal } from 'lucide-react';

const ToastContext = createContext(undefined);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
}

const toastIcons = {
    success: CheckCircle,
    error: XCircle,
    info: Terminal,
    warning: AlertTriangle,
};

const toastColors = {
    success: 'bg-emerald-950/90 border-emerald-700 text-emerald-400',
    error: 'bg-red-950/90 border-red-800 text-red-400',
    info: 'bg-black/90 border-emerald-800 text-emerald-500',
    warning: 'bg-yellow-950/90 border-yellow-700 text-yellow-400',
};

function Toast({ id, type, message, onClose }) {
    const Icon = toastIcons[type];

    return (
        <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 300, scale: 0.9 }}
            className={`backdrop-blur-sm rounded border-2 ${toastColors[type]} shadow-lg shadow-emerald-900/30 min-w-[320px] max-w-md p-4 font-sans`}
        >
            <div className="flex items-start gap-3">
                <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="flex-1 text-sm">{message}</p>
                <button
                    onClick={onClose}
                    className="text-emerald-800 hover:text-emerald-500 transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </motion.div>
    );
}

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const showToast = useCallback((message, type = 'info', duration = 5000) => {
        const id = Date.now();
        setToasts((prev) => [...prev, { id, message, type }]);

        if (duration > 0) {
            setTimeout(() => {
                removeToast(id);
            }, duration);
        }

        return id;
    }, []);

    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const success = useCallback((message, duration) => showToast(message, 'success', duration), [showToast]);
    const error = useCallback((message, duration) => showToast(message, 'error', duration), [showToast]);
    const info = useCallback((message, duration) => showToast(message, 'info', duration), [showToast]);
    const warning = useCallback((message, duration) => showToast(message, 'warning', duration), [showToast]);

    return (
        <ToastContext.Provider value={{ showToast, success, error, info, warning, removeToast }}>
            {children}

            {/* Toast Container */}
            <div className="fixed top-4 right-4 z-[100] flex flex-col gap-3">
                <AnimatePresence>
                    {toasts.map((toast) => (
                        <Toast
                            key={toast.id}
                            {...toast}
                            onClose={() => removeToast(toast.id)}
                        />
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
}
