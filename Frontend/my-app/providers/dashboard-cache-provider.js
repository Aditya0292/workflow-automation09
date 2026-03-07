'use client';

import { createContext, useContext, useState, useCallback, useRef } from 'react';
import api from '@/lib/api';

const DashboardCacheContext = createContext(undefined);

const CACHE_TTL = 60 * 1000; // 60 seconds

export function useDashboardCache() {
    const context = useContext(DashboardCacheContext);
    if (!context) {
        throw new Error('useDashboardCache must be used within DashboardCacheProvider');
    }
    return context;
}

export function DashboardCacheProvider({ children }) {
    const [automations, setAutomations] = useState([]);
    const [executions, setExecutions] = useState({ total: 0, daily: 0 });
    const [loading, setLoading] = useState(true);
    const lastFetchRef = useRef(0);
    const fetchingRef = useRef(false);

    // silent = true means no loading spinner (background refresh)
    const loadAutomations = useCallback(async (force = false, silent = false) => {
        const now = Date.now();
        // Skip if we fetched recently and not forced
        if (!force && lastFetchRef.current && (now - lastFetchRef.current) < CACHE_TTL && automations.length > 0) {
            setLoading(false);
            return;
        }

        // Prevent duplicate concurrent fetches
        if (fetchingRef.current) return;
        fetchingRef.current = true;

        try {
            // Only show loading spinner on initial load, not background refreshes
            if (!silent) setLoading(true);

            const data = await api.getAutomations();
            const automationData = data.automations || [];

            let totalExecutions = 0;
            let dailyExecutions = 0;
            const today = new Date().toDateString();

            const enrichedAutomations = await Promise.all(automationData.map(async (auto) => {
                try {
                    const execs = await api.getAutomationExecutions(auto.id);
                    totalExecutions += execs.length;
                    const todayExecs = execs.filter(e => new Date(e.created_at).toDateString() === today).length;
                    dailyExecutions += todayExecs;
                    return { ...auto, lastRun: execs[0]?.created_at, executionCount: execs.length };
                } catch (e) {
                    return { ...auto, executionCount: 0 };
                }
            }));

            setAutomations(enrichedAutomations);
            setExecutions({ total: totalExecutions, daily: dailyExecutions });
            lastFetchRef.current = Date.now();
        } catch (error) {
            console.error('Failed to load automations:', error);
        } finally {
            setLoading(false);
            fetchingRef.current = false;
        }
    }, [automations.length]);

    // Background refresh — updates data without loading spinner
    const refreshSilent = useCallback(() => {
        lastFetchRef.current = 0;
        loadAutomations(true, true);
    }, [loadAutomations]);

    // Optimistic update for status toggle
    const updateAutomationStatus = useCallback((id, newStatus) => {
        setAutomations(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
    }, []);

    // Remove from cache on delete
    const removeAutomation = useCallback((id) => {
        setAutomations(prev => prev.filter(a => a.id !== id));
    }, []);

    // Update a single automation's field (e.g. isTestRunning)
    const updateAutomation = useCallback((id, updates) => {
        setAutomations(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    }, []);

    // Force refresh (after create, delete, etc.)
    const invalidate = useCallback(() => {
        lastFetchRef.current = 0;
    }, []);

    return (
        <DashboardCacheContext.Provider value={{
            automations,
            executions,
            loading,
            loadAutomations,
            refreshSilent,
            updateAutomationStatus,
            removeAutomation,
            updateAutomation,
            invalidate,
        }}>
            {children}
        </DashboardCacheContext.Provider>
    );
}
