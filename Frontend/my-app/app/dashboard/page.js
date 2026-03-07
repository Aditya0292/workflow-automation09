'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Clock, LayoutGrid, Zap, Shield, Play, Pause, Trash2, Edit, List, Calendar, CheckCircle, Activity, Settings2 } from 'lucide-react';
import { EmptyAutomations } from '@/components/ui/empty-states';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/providers/toast-provider';
import { useDashboardCache } from '@/providers/dashboard-cache-provider';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

// Stats Card Component - clean icon-based design
const StatCard = ({ icon: Icon, label, value, subtext, isHighlighted = false }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-[#111111] border border-[#1F2937] p-6 rounded-2xl relative overflow-hidden group hover:border-emerald-500/20 transition-colors ${isHighlighted ? 'border-b-2 border-b-emerald-500' : ''}`}
    >
        <div className="relative z-10">
            {/* Icon in emerald-tinted circle */}
            <div className="w-10 h-10 rounded-full bg-[#064E3B] flex items-center justify-center mb-4">
                <Icon className="w-4 h-4 text-emerald-500" />
            </div>

            <h3 className="text-4xl font-bold text-white mb-1">{value}</h3>
            <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">{label}</p>
            <p className="text-xs text-[#4B5563]">{subtext}</p>
        </div>
    </motion.div>
);

// Format date to cleaner format
const formatLastRun = (dateStr) => {
    if (!dateStr) return 'No runs yet';
    const date = new Date(dateStr);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();

    if (isToday) {
        return `Last run: Today at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    }

    return `Last run: ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
};

export default function DashboardPage() {
    const {
        automations,
        executions,
        loading,
        loadAutomations,
        refreshSilent,
        updateAutomationStatus,
        removeAutomation,
        updateAutomation,
    } = useDashboardCache();
    const [viewMode, setViewMode] = useState('grid');
    const [selectedIds, setSelectedIds] = useState([]);
    const { user, isAuthenticated, loading: authLoading } = useAuth();
    const { success, error: showError } = useToast();
    const router = useRouter();

    useEffect(() => {
        if (authLoading) return;
        if (!isAuthenticated) {
            router.push('/login');
            return;
        }
        // Uses cached data if available (60s TTL)
        loadAutomations();
    }, [isAuthenticated, authLoading, router, loadAutomations]);

    const handleToggle = async (id, currentStatus) => {
        const newStatus = currentStatus === 'active' ? 'paused' : 'active';
        try {
            // Optimistic update via cache
            updateAutomationStatus(id, newStatus);
            await api.updateAutomationStatus(id, newStatus);
            success(`Automation ${newStatus === 'active' ? 'activated' : 'paused'}`);
        } catch (error) {
            showError('Failed to update status');
            // Revert silently in background
            refreshSilent();
        }
    };

    const handleDelete = async (id) => {
        if (confirm('Delete this automation?')) {
            try {
                // Optimistic remove from cache
                removeAutomation(id);
                await api.deleteAutomation(id);
                success('Automation deleted');
            } catch (error) {
                showError('Failed to delete automation');
                refreshSilent();
            }
        }
    };

    const handleTestRun = async (id, name) => {
        try {
            updateAutomation(id, { isTestRunning: true });
            await api.runAutomation(id);
            success(`Test run started for "${name}"`);
            updateAutomation(id, { isTestRunning: false });
            // Silently refresh data in background after a delay
            setTimeout(() => refreshSilent(), 3000);
        } catch (error) {
            showError('Failed to start test run');
            updateAutomation(id, { isTestRunning: false });
        }
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === automations.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(automations.map(a => a.id));
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        if (confirm(`Delete ${selectedIds.length} automations?`)) {
            try {
                // Optimistic removal
                selectedIds.forEach(id => removeAutomation(id));
                await Promise.all(selectedIds.map(id => api.deleteAutomation(id)));
                success(`${selectedIds.length} automations deleted`);
                setSelectedIds([]);
            } catch (error) {
                showError('Failed to delete some automations');
                refreshSilent();
            }
        }
    };

    const activeCount = automations.filter(a => a.status === 'active').length;

    return (
        <div className="font-sans">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-1">Dashboard</h1>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-[#4B5563]">Status:</span>
                        <span className="text-sm font-bold text-emerald-500">ONLINE</span>
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                    </div>
                </div>

                <Link href="/dashboard/create">
                    <Button className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-900/20 font-semibold">
                        <Plus className="w-4 h-4 mr-2" />
                        Create Automation
                    </Button>
                </Link>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                <StatCard
                    icon={Zap}
                    label="TOTAL EXECUTIONS"
                    value={executions.total || 0}
                    subtext="Processing Time: 840ms avg"
                />
                <StatCard
                    icon={LayoutGrid}
                    label="ACTIVE WORKFLOWS"
                    value={activeCount}
                    subtext={`${automations.length} Total Definitions`}
                />
                <StatCard
                    icon={Activity}
                    label="DAILY EXECUTIONS"
                    value={executions.daily || 0}
                    subtext="Runs in last 24h"
                />
                <StatCard
                    icon={Settings2}
                    label="TOTAL AUTOMATIONS"
                    value={automations.length}
                    subtext="All created workflows"
                    isHighlighted={true}
                />
            </div>

            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg font-bold text-white">Active Workflows</h2>

                    {/* Bulk Selection Actions */}
                    <div className="flex items-center gap-3 pl-4 border-l border-[#1F2937]">
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <div className="relative flex items-center">
                                <input
                                    type="checkbox"
                                    checked={automations.length > 0 && selectedIds.length === automations.length}
                                    onChange={toggleSelectAll}
                                    className="peer h-4 w-4 opacity-0 absolute cursor-pointer"
                                />
                                <div className="h-4 w-4 border border-[#1F2937] rounded bg-white/5 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all flex items-center justify-center">
                                    <CheckCircle className={`w-3 h-3 text-black font-bold ${selectedIds.length === automations.length ? 'block' : 'hidden'}`} />
                                </div>
                            </div>
                            <span className="text-xs font-medium text-[#9CA3AF] group-hover:text-white transition-colors uppercase tracking-wider">Select All</span>
                        </label>

                        {selectedIds.length > 0 && (
                            <motion.button
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                onClick={handleBulkDelete}
                                className="flex items-center gap-1.5 px-3 py-1 rounded bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 text-xs font-bold uppercase transition-all"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete ({selectedIds.length})
                            </motion.button>
                        )}
                    </div>
                </div>
                <div className="flex gap-1 bg-[#111111] p-1 rounded-lg border border-[#1F2937]">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-2 rounded transition ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-[#4B5563] hover:text-white hover:bg-white/5'}`}
                    >
                        <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-2 rounded transition ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-[#4B5563] hover:text-white hover:bg-white/5'}`}
                    >
                        <List className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-20">
                    <div className="w-8 h-8 mx-auto border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-[#4B5563]">Loading your workspace...</p>
                </div>
            ) : automations.length === 0 ? (
                <EmptyAutomations />
            ) : (
                <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-3' : 'space-y-3'}>
                    {automations.map((automation) => (
                        <div
                            key={automation.id}
                            className={`bg-[#111111] border border-[#1F2937] rounded-xl p-6 group hover:border-emerald-500/30 transition-all ${automation.status === 'active' ? 'border-l-2 border-l-emerald-500' : ''}`}
                        >
                            {viewMode === 'grid' ? (
                                /* Grid View - Compact card */
                                <div className="flex flex-col h-full">
                                    <div className="flex items-start justify-between gap-2 mb-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <label className="relative flex items-center cursor-pointer shrink-0">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.includes(automation.id)}
                                                    onChange={() => toggleSelect(automation.id)}
                                                    className="peer h-4 w-4 opacity-0 absolute cursor-pointer"
                                                />
                                                <div className="h-4 w-4 border border-[#1F2937] rounded bg-white/5 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all flex items-center justify-center">
                                                    <CheckCircle className={`w-3 h-3 text-black font-bold ${selectedIds.includes(automation.id) ? 'block' : 'hidden'}`} />
                                                </div>
                                            </label>
                                            <div className={`w-2 h-2 rounded-full shrink-0 ${automation.status === 'active' ? 'bg-emerald-500' : 'bg-[#4B5563]'}`} />
                                            <h3 className="text-base font-semibold text-white truncate">{automation.name}</h3>
                                        </div>
                                        {automation.status === 'active' && (
                                            <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-500 font-bold border border-emerald-500/20 uppercase shrink-0">
                                                Active
                                            </span>
                                        )}
                                        {automation.status === 'paused' && (
                                            <span className="px-2 py-0.5 rounded text-[10px] bg-orange-500/10 text-orange-500 font-bold border border-orange-500/20 uppercase shrink-0">
                                                Paused
                                            </span>
                                        )}
                                    </div>

                                    <p className="text-[#9CA3AF] text-sm mb-4 line-clamp-2 flex-1">
                                        {automation.description || 'No description provided.'}
                                    </p>

                                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-[#1F2937]">
                                        <span className="flex items-center gap-1.5 text-xs text-[#4B5563]">
                                            <Clock className="w-3.5 h-3.5" />
                                            {formatLastRun(automation.lastRun)}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                onClick={() => handleToggle(automation.id, automation.status)}
                                                className={`h-7 px-2.5 text-[10px] font-semibold ${automation.status === 'active'
                                                    ? 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 border border-yellow-500/20'
                                                    : 'bg-transparent border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10'
                                                    }`}
                                            >
                                                {automation.status === 'active' ? 'Pause' : 'Activate'}
                                            </Button>
                                            <button
                                                onClick={() => handleTestRun(automation.id, automation.name)}
                                                disabled={automation.isTestRunning}
                                                className="p-1.5 text-[#4B5563] hover:text-emerald-500 hover:bg-emerald-500/10 rounded transition disabled:opacity-50"
                                                title="Test Run"
                                            >
                                                {automation.isTestRunning ? (
                                                    <div className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                    <Play className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                            <button
                                                onClick={() => handleDelete(automation.id)}
                                                className="p-1.5 text-[#4B5563] hover:text-red-400 hover:bg-red-500/10 rounded transition"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* List View - Full width row */
                                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                    <div className="flex items-start gap-4 flex-1">
                                        {/* Selection Checkbox */}
                                        <div className="pt-1">
                                            <label className="relative flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.includes(automation.id)}
                                                    onChange={() => toggleSelect(automation.id)}
                                                    className="peer h-4 w-4 opacity-0 absolute cursor-pointer"
                                                />
                                                <div className="h-4 w-4 border border-[#1F2937] rounded bg-white/5 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all flex items-center justify-center">
                                                    <CheckCircle className={`w-3 h-3 text-black font-bold ${selectedIds.includes(automation.id) ? 'block' : 'hidden'}`} />
                                                </div>
                                            </label>
                                        </div>

                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                {/* Status dot */}
                                                <div className={`w-2 h-2 rounded-full ${automation.status === 'active' ? 'bg-emerald-500' : 'bg-[#4B5563]'}`} />
                                                <h3 className="text-lg font-semibold text-white">{automation.name}</h3>
                                                {automation.status === 'paused' && (
                                                    <span className="px-2 py-1 rounded text-[10px] bg-orange-500/10 text-orange-500 font-bold border border-orange-500/20 uppercase flex items-center gap-1">
                                                        <Pause className="w-3 h-3" /> Paused
                                                    </span>
                                                )}
                                                {automation.status === 'active' && (
                                                    <span className="px-2 py-1 rounded text-[10px] bg-emerald-500/10 text-emerald-500 font-bold border border-emerald-500/20 uppercase flex items-center gap-1">
                                                        <Play className="w-3 h-3 fill-emerald-500" /> Active
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[#9CA3AF] text-sm mb-4 line-clamp-2 max-w-2xl">
                                                {automation.description || 'No description provided.'}
                                            </p>

                                            <div className="flex items-center gap-4 text-xs text-[#4B5563]">
                                                <span className="flex items-center gap-1.5">
                                                    <Clock className="w-3.5 h-3.5" />
                                                    {formatLastRun(automation.lastRun)}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            {/* Activate/Pause Button */}
                                            <Button
                                                onClick={() => handleToggle(automation.id, automation.status)}
                                                className={`h-9 px-4 text-xs font-semibold ${automation.status === 'active'
                                                    ? 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 border border-yellow-500/20'
                                                    : 'bg-transparent border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10'
                                                    }`}
                                            >
                                                {automation.status === 'active' ? (
                                                    <><Pause className="w-3.5 h-3.5 mr-1.5" /> Pause</>
                                                ) : (
                                                    <><Play className="w-3.5 h-3.5 mr-1.5 fill-emerald-500" /> Activate</>
                                                )}
                                            </Button>

                                            {/* Action Icons */}
                                            <div className="flex items-center gap-0.5 bg-black/40 p-1 rounded-lg border border-[#1F2937]">
                                                <button
                                                    onClick={() => handleTestRun(automation.id, automation.name)}
                                                    disabled={automation.isTestRunning}
                                                    className="p-2 text-[#4B5563] hover:text-emerald-500 hover:bg-emerald-500/10 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Test Run (Run Once)"
                                                >
                                                    {automation.isTestRunning ? (
                                                        <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                                    ) : (
                                                        <Play className="w-4 h-4" />
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(automation.id)}
                                                    className="p-2 text-[#4B5563] hover:text-red-400 hover:bg-red-500/10 rounded transition"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
