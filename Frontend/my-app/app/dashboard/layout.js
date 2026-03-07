'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Home, Plus, Settings, LogOut, Menu, X, Zap,
    ChevronRight, User, LayoutGrid, FolderOpen
} from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { MouseGlow } from '@/components/ui/mouse-glow';
import { DashboardCacheProvider } from '@/providers/dashboard-cache-provider';

export default function DashboardLayout({ children }) {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const { user, logout } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    const menuItems = [
        { icon: LayoutGrid, label: 'Overview', href: '/dashboard' },
        { icon: Plus, label: 'New Workflow', href: '/dashboard/create' },
        { icon: User, label: 'Profile', href: '/dashboard/profile' },
        { icon: Settings, label: 'Settings', href: '/dashboard/settings' },
    ];

    const isActive = (path) => pathname === path;

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white font-sans selection:bg-emerald-500/30 selection:text-emerald-200 flex">
            <MouseGlow />

            {/* Subtle Grid Background */}
            <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-0">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:4rem_4rem]" />
            </div>

            {/* Mobile Menu Button */}
            <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="fixed top-4 left-4 z-50 md:hidden bg-[#111111] border border-[#1F2937] p-2 rounded-lg text-white"
            >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </motion.button>

            {/* Sidebar - Desktop */}
            <motion.aside
                initial={{ width: 280 }}
                animate={{ width: sidebarOpen ? 280 : 80 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="fixed left-0 top-0 h-full bg-[#0A0A0A] border-r border-[#1F2937] z-40 hidden md:block overflow-hidden"
            >
                <div className="flex flex-col h-full p-6">
                    {/* Logo */}
                    <div className={`flex items-center gap-3 mb-10 ${!sidebarOpen ? 'justify-center' : ''}`}>
                        <div className="bg-emerald-500 p-1.5 rounded-lg shadow-lg shadow-emerald-900/20 shrink-0">
                            <Zap className="w-5 h-5 text-white fill-white" />
                        </div>
                        {sidebarOpen && (
                            <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-xl font-bold tracking-tight text-white"
                            >
                                SmartFlow
                            </motion.span>
                        )}
                    </div>

                    {/* Create New - Prominent Button */}
                    {sidebarOpen ? (
                        <Link href="/dashboard/create" className="mb-8">
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center gap-2"
                            >
                                <Plus className="w-5 h-5" />
                                Create Flow
                            </motion.button>
                        </Link>
                    ) : (
                        <Link href="/dashboard/create" className="mb-8 flex justify-center">
                            <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                className="p-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-900/20 transition-all"
                            >
                                <Plus className="w-5 h-5" />
                            </motion.button>
                        </Link>
                    )}

                    {/* Navigation */}
                    <nav className="flex-1 space-y-2">
                        {menuItems.map((item, index) => {
                            const active = isActive(item.href);
                            return (
                                <Link
                                    key={index}
                                    href={item.href}
                                    className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all group relative ${active
                                        ? 'bg-white/5 text-emerald-400'
                                        : 'text-[#9CA3AF] hover:bg-white/5 hover:text-white'
                                        } ${!sidebarOpen ? 'justify-center' : ''}`}
                                >
                                    {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-emerald-500 rounded-r-full" />}

                                    <item.icon className={`w-5 h-5 ${active ? 'text-emerald-400' : 'text-[#9CA3AF] group-hover:text-white'} transition-colors`} />

                                    {sidebarOpen && (
                                        <span className="font-medium">{item.label}</span>
                                    )}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* User Profile */}
                    <div className="border-t border-[#1F2937] pt-4 mt-auto">
                        <div className={`flex items-center gap-3 ${!sidebarOpen ? 'justify-center' : ''}`}>
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-[#1F2937] flex items-center justify-center shrink-0">
                                <span className="text-sm font-bold text-white">
                                    {user?.name?.[0]?.toUpperCase() || 'U'}
                                </span>
                            </div>

                            {sidebarOpen && (
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-white truncate">{user?.name || 'User'}</p>
                                    <p className="text-xs text-emerald-500 font-medium truncate">PRO PLAN</p>
                                </div>
                            )}

                            {sidebarOpen && (
                                <button
                                    onClick={logout}
                                    className="p-2 text-[#9CA3AF] hover:text-white hover:bg-white/5 rounded-lg transition"
                                >
                                    <LogOut className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </motion.aside>

            {/* Sidebar - Mobile */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setMobileMenuOpen(false)}
                            className="fixed inset-0 bg-black/80 z-30 md:hidden backdrop-blur-sm"
                        />
                        <motion.aside
                            initial={{ x: -280 }}
                            animate={{ x: 0 }}
                            exit={{ x: -280 }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="fixed left-0 top-0 h-full w-72 bg-[#0A0A0A] border-r border-[#1F2937] z-40 md:hidden"
                        >
                            <div className="flex flex-col h-full p-6">
                                {/* Logo */}
                                <div className="flex items-center gap-3 mb-8">
                                    <div className="bg-emerald-500 p-1.5 rounded-lg shadow-lg shadow-emerald-900/20">
                                        <Zap className="w-5 h-5 text-white fill-white" />
                                    </div>
                                    <span className="text-xl font-bold tracking-tight text-white">
                                        SmartFlow
                                    </span>
                                </div>

                                <Link href="/dashboard/create" onClick={() => setMobileMenuOpen(false)} className="mb-8">
                                    <button className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium shadow-lg shadow-emerald-900/20">
                                        + Create Flow
                                    </button>
                                </Link>

                                {/* Navigation */}
                                <nav className="flex-1 space-y-2">
                                    {menuItems.map((item, index) => {
                                        const active = isActive(item.href);
                                        return (
                                            <Link
                                                key={index}
                                                href={item.href}
                                                onClick={() => setMobileMenuOpen(false)}
                                                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${active
                                                    ? 'bg-white/5 text-emerald-400'
                                                    : 'text-[#9CA3AF] hover:bg-white/5 hover:text-white'
                                                    }`}
                                            >
                                                <item.icon className="w-5 h-5" />
                                                <span className="font-medium">{item.label}</span>
                                            </Link>
                                        );
                                    })}
                                </nav>

                                {/* User Profile */}
                                <div className="border-t border-[#1F2937] pt-4 mt-auto">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-[#1F2937] flex items-center justify-center">
                                            <span className="text-sm font-bold text-white">
                                                {user?.name?.[0]?.toUpperCase() || 'U'}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-white">{user?.name || 'User'}</p>
                                            <p className="text-xs text-emerald-500 font-medium">PRO PLAN</p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={logout}
                                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all font-medium"
                                    >
                                        <LogOut className="w-5 h-5" />
                                        <span>Log out</span>
                                    </button>
                                </div>
                            </div>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>

            {/* Main Content */}
            <main className={`flex-1 min-h-screen transition-all duration-300 ${sidebarOpen ? 'md:pl-72' : 'md:pl-20'} relative z-10`}>
                <div className="p-6 md:p-10 max-w-[1600px] mx-auto">
                    <DashboardCacheProvider>
                        {children}
                    </DashboardCacheProvider>
                </div>
            </main>
        </div>
    );
}
