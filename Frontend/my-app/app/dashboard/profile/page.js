'use client';

import { useAuth } from '@/providers/auth-provider';
import { motion } from 'framer-motion';
import { User, Trophy, Calendar, Zap, Activity, Clock, Shield } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '@/lib/api';

export default function ProfilePage() {
    const { user } = useAuth();
    const [stats, setStats] = useState({
        totalCreated: 0,
        successRate: 100,
        dayStreak: 0,
        totalExecutions: 0
    });
    const [recentActivity, setRecentActivity] = useState([]);

    useEffect(() => {
        const loadProfileData = async () => {
            try {
                const automations = await api.getAutomations();
                const automationList = automations.automations || [];
                const totalCreated = automationList.length;

                // Calculate real stats
                let totalExecs = 0;
                let successExecs = 0;
                let latestActivity = [];

                for (const auto of automationList) {
                    try {
                        const execs = await api.getAutomationExecutions(auto.id);
                        totalExecs += execs.length;
                        successExecs += execs.filter(e => e.status === 'COMPLETED' || e.status === 'completed').length;

                        if (execs.length > 0) {
                            latestActivity.push({
                                name: auto.name,
                                status: execs[0].status,
                                time: execs[0].created_at,
                            });
                        }
                    } catch (e) { /* skip */ }
                }

                const successRate = totalExecs > 0 ? Math.round((successExecs / totalExecs) * 100) : 100;

                setStats({
                    totalCreated,
                    successRate,
                    dayStreak: 1,
                    totalExecutions: totalExecs
                });

                // Sort activity by most recent
                latestActivity.sort((a, b) => new Date(b.time) - new Date(a.time));
                setRecentActivity(latestActivity.slice(0, 5));
            } catch (e) {
                console.error("Failed to load profile stats", e);
            }
        };
        loadProfileData();
    }, []);

    // Generate heatmap data
    const heatmapData = Array.from({ length: 52 * 7 }).map((_, i) => ({
        level: Math.random() > 0.9 ? Math.floor(Math.random() * 4) : 0
    }));

    const getJoinDate = () => {
        if (user?.createdAt) {
            return new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        }
        return 'Dec 2024';
    };

    const formatTimeAgo = (dateStr) => {
        if (!dateStr) return '';
        const diff = Date.now() - new Date(dateStr).getTime();
        const minutes = Math.floor(diff / 60000);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `about ${hours} hour${hours > 1 ? 's' : ''} ago`;
        const days = Math.floor(hours / 24);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    };

    return (
        <div className="font-sans max-w-5xl mx-auto">
            {/* Profile Header */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#0A0A0A] border border-[#1F2937] rounded-2xl p-8 mb-8 flex flex-col md:flex-row items-center gap-6"
            >
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 border-2 border-emerald-500/30 flex items-center justify-center relative">
                    <span className="text-4xl font-bold text-emerald-500">{user?.name?.[0]?.toUpperCase() || 'U'}</span>
                    <div className="absolute -bottom-2 px-3 py-1 rounded-full bg-amber-500 text-[10px] font-bold text-black border border-amber-400">
                        Bronze
                    </div>
                </div>

                <div className="flex-1 text-center md:text-left">
                    <h1 className="text-3xl font-bold text-white mb-1">{user?.name || 'User'}</h1>
                    <p className="text-[#9CA3AF] mb-2">@{user?.email?.split('@')[0] || 'user'} • Joined {getJoinDate()}</p>

                    <div className="flex items-center justify-center md:justify-start gap-2">
                        <Activity className="w-4 h-4 text-emerald-500" />
                        <span className="text-sm text-emerald-500 font-medium">Rank: Bronze</span>
                    </div>
                </div>

                <button className="px-4 py-2 rounded-lg border border-[#1F2937] hover:bg-white/5 text-sm font-medium text-white transition">
                    Edit Profile
                </button>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Automation Stats */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-[#0A0A0A] border border-[#1F2937] rounded-2xl p-6"
                >
                    <div className="flex items-center gap-2 mb-6">
                        <Shield className="w-4 h-4 text-[#4B5563]" />
                        <h2 className="text-xs font-bold text-[#4B5563] uppercase tracking-wider">Automation Stats</h2>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-4 rounded-xl bg-white/5 border border-[#1F2937]">
                            <div className="text-2xl font-bold text-white mb-1">{stats.totalCreated}</div>
                            <div className="text-xs text-[#9CA3AF]">Total Created</div>
                        </div>
                        <div className="text-center p-4 rounded-xl bg-white/5 border border-[#1F2937]">
                            <div className="text-2xl font-bold text-emerald-500 mb-1">{stats.successRate}%</div>
                            <div className="text-xs text-[#9CA3AF]">Success Rate</div>
                        </div>
                        <div className="text-center p-4 rounded-xl bg-white/5 border border-[#1F2937]">
                            <div className="text-2xl font-bold text-white mb-1">{stats.dayStreak}</div>
                            <div className="text-xs text-[#9CA3AF]">Day Streak</div>
                        </div>
                        <div className="text-center p-4 rounded-xl bg-white/5 border border-[#1F2937]">
                            <div className="text-2xl font-bold text-emerald-400 mb-1">{stats.totalExecutions}</div>
                            <div className="text-xs text-[#9CA3AF]">Executions</div>
                        </div>
                    </div>
                </motion.div>

                {/* Heatmap & Activity */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Heatmap */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="bg-[#0A0A0A] border border-[#1F2937] rounded-2xl p-6"
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-sm font-bold text-white">{stats.totalExecutions} executions in the last year</h2>
                            <span className="text-xs text-[#4B5563]">Total active days: {stats.dayStreak}</span>
                        </div>

                        <div className="flex gap-1 overflow-x-auto pb-2">
                            <div className="grid grid-rows-7 grid-flow-col gap-1">
                                {heatmapData.map((d, i) => (
                                    <div
                                        key={i}
                                        className={`w-3 h-3 rounded-sm ${d.level === 0 ? 'bg-[#1A1A1A]' :
                                            d.level === 1 ? 'bg-emerald-900' :
                                                d.level === 2 ? 'bg-emerald-700' :
                                                    d.level === 3 ? 'bg-emerald-500' : 'bg-emerald-400'
                                            }`}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 mt-4 justify-end text-xs text-[#4B5563]">
                            <span>Less</span>
                            <div className="flex gap-1">
                                <div className="w-3 h-3 rounded-sm bg-[#1A1A1A]" />
                                <div className="w-3 h-3 rounded-sm bg-emerald-900" />
                                <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                            </div>
                            <span>More</span>
                        </div>
                    </motion.div>

                    {/* Recent Activity */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="bg-[#0A0A0A] border border-[#1F2937] rounded-2xl p-6"
                    >
                        <h2 className="text-sm font-bold text-white mb-6">Recent Activity</h2>

                        <div className="space-y-4">
                            {recentActivity.length > 0 ? recentActivity.map((item, i) => (
                                <div key={i} className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition">
                                    <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                        <Zap className="w-5 h-5 text-emerald-500" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-sm font-medium text-white">{item.name}</h3>
                                        <p className="text-xs text-[#4B5563]">Status: {item.status}</p>
                                    </div>
                                    <span className="text-xs text-[#4B5563] flex items-center gap-1">
                                        {formatTimeAgo(item.time)}
                                    </span>
                                </div>
                            )) : (
                                <div className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition">
                                    <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                        <Zap className="w-5 h-5 text-emerald-500" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-sm font-medium text-white">No recent activity</h3>
                                        <p className="text-xs text-[#4B5563]">Create your first automation to get started</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Badges Section */}
            <div className="mt-6">
                <div className="bg-[#0A0A0A] border border-[#1F2937] rounded-2xl p-6 w-full md:w-1/3">
                    <div className="flex items-center gap-2 mb-4">
                        <Trophy className="w-4 h-4 text-[#4B5563]" />
                        <h2 className="text-xs font-bold text-[#4B5563] uppercase tracking-wider">Badges</h2>
                    </div>
                    <div className="flex gap-2">
                        <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2">
                            <Trophy className="w-3 h-3" />
                            Novice Builder
                        </div>
                        <div className="w-8 h-8 rounded-lg border border-dashed border-[#1F2937] flex items-center justify-center text-[#4B5563]">
                            +
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
