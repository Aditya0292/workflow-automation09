'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { User, Bell, Lock, Key, Globe, Phone, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import api from '@/lib/api';

export default function SettingsPage() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('account');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [whatsappNumber, setWhatsappNumber] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null);
    const [saveMessage, setSaveMessage] = useState('');

    useEffect(() => {
        const loadProfile = async () => {
            try {
                const data = await api.getProfile();
                if (data.user) {
                    setPhoneNumber(data.user.phoneNumber || data.user.phone_number || '');
                    setWhatsappNumber(data.user.whatsappNumber || data.user.whatsapp_number || '');
                }
            } catch (e) {
                console.error('Failed to load profile:', e);
            }
        };
        loadProfile();
    }, []);

    const handleSaveProfile = async () => {
        setSaving(true);
        setSaveStatus(null);
        try {
            const updates = {};
            if (phoneNumber) updates.phoneNumber = phoneNumber;
            if (whatsappNumber) updates.whatsappNumber = whatsappNumber;

            await api.updateProfile(updates);
            setSaveStatus('success');
            setSaveMessage('Profile saved successfully!');
        } catch (e) {
            setSaveStatus('error');
            setSaveMessage(e.message || 'Failed to save profile');
        } finally {
            setSaving(false);
            setTimeout(() => setSaveStatus(null), 4000);
        }
    };

    const sections = [
        { id: 'account', icon: User, label: 'Account' },
        { id: 'notifications', icon: Bell, label: 'Notifications' },
        { id: 'security', icon: Lock, label: 'Security' },
        { id: 'api', icon: Key, label: 'API Keys' },
    ];

    return (
        <div className="font-sans max-w-5xl mx-auto">
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
            >
                <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
                <p className="text-[#9CA3AF] text-sm">Manage your account preferences and workspace settings.</p>
            </motion.div>

            <div className="flex flex-col md:flex-row gap-8">
                {/* Sidebar Navigation */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className="w-full md:w-64 flex-shrink-0"
                >
                    <div className="bg-[#0A0A0A] border border-[#1F2937] rounded-2xl p-4 sticky top-8">
                        {sections.map(section => (
                            <button
                                key={section.id}
                                onClick={() => setActiveTab(section.id)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${activeTab === section.id
                                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-900/20'
                                    : 'text-[#9CA3AF] hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <section.icon className="w-5 h-5" />
                                {section.label}
                            </button>
                        ))}
                    </div>
                </motion.div>

                {/* Content Area */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex-1"
                >
                    <div className="bg-[#0A0A0A] border border-[#1F2937] rounded-2xl p-8 min-h-[500px]">
                        {activeTab === 'account' && (
                            <div className="space-y-6">
                                <div>
                                    <h2 className="text-xl font-bold text-white mb-1">Profile Information</h2>
                                    <p className="text-[#9CA3AF] text-sm">Update your profile details and contact information.</p>
                                </div>
                                <div className="space-y-4 max-w-md">
                                    <div>
                                        <label className="block text-xs font-bold text-[#4B5563] uppercase tracking-wider mb-2">Full Name</label>
                                        <Input defaultValue={user?.name} disabled className="bg-black/40 border-[#1F2937] text-[#9CA3AF] cursor-not-allowed" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-[#4B5563] uppercase tracking-wider mb-2">Email Address</label>
                                        <Input defaultValue={user?.email} disabled className="bg-black/40 border-[#1F2937] text-[#9CA3AF] cursor-not-allowed" />
                                    </div>

                                    {/* Phone Number Section */}
                                    <div className="pt-4 border-t border-[#1F2937]">
                                        <div className="flex items-center gap-2 mb-4">
                                            <Phone className="w-5 h-5 text-emerald-500" />
                                            <h3 className="text-base font-semibold text-white">Phone Numbers</h3>
                                        </div>
                                        <p className="text-[#9CA3AF] text-xs mb-4">
                                            Add your phone number to enable SMS and WhatsApp automations. Use international format (e.g., +919876543210).
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-[#4B5563] uppercase tracking-wider mb-2">
                                            Phone Number (SMS)
                                        </label>
                                        <Input
                                            value={phoneNumber}
                                            onChange={e => setPhoneNumber(e.target.value)}
                                            placeholder="+919876543210"
                                            className="bg-black/40 border-[#1F2937] text-white placeholder:text-[#4B5563]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-[#4B5563] uppercase tracking-wider mb-2">
                                            WhatsApp Number
                                        </label>
                                        <Input
                                            value={whatsappNumber}
                                            onChange={e => setWhatsappNumber(e.target.value)}
                                            placeholder="+919876543210"
                                            className="bg-black/40 border-[#1F2937] text-white placeholder:text-[#4B5563]"
                                        />
                                        <p className="text-[#4B5563] text-xs mt-1">Used for WhatsApp notifications and SMS fallback.</p>
                                    </div>
                                </div>

                                {/* Save Button + Status */}
                                <div className="pt-4 border-t border-[#1F2937] flex items-center gap-4">
                                    <Button
                                        className="bg-emerald-500 hover:bg-emerald-600 text-white"
                                        onClick={handleSaveProfile}
                                        disabled={saving}
                                    >
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </Button>
                                    {saveStatus === 'success' && (
                                        <motion.div
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className="flex items-center gap-1.5 text-emerald-400 text-sm"
                                        >
                                            <CheckCircle className="w-4 h-4" />
                                            {saveMessage}
                                        </motion.div>
                                    )}
                                    {saveStatus === 'error' && (
                                        <motion.div
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className="flex items-center gap-1.5 text-red-400 text-sm"
                                        >
                                            <AlertCircle className="w-4 h-4" />
                                            {saveMessage}
                                        </motion.div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'notifications' && (
                            <div className="space-y-6">
                                <div>
                                    <h2 className="text-xl font-bold text-white mb-1">Notification Preferences</h2>
                                    <p className="text-[#9CA3AF] text-sm">Choose what you want to be notified about.</p>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-[#1F2937]">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                                                <Globe className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-white">Browser Push Notifications</p>
                                                <p className="text-xs text-[#9CA3AF]">Receive notifications on your desktop</p>
                                            </div>
                                        </div>
                                        <Switch />
                                    </div>
                                    <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-[#1F2937]">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
                                                <Bell className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-white">Workflow Failures</p>
                                                <p className="text-xs text-[#9CA3AF]">Get alerted when an automation fails</p>
                                            </div>
                                        </div>
                                        <Switch defaultChecked />
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'security' && (
                            <div className="space-y-6">
                                <div>
                                    <h2 className="text-xl font-bold text-white mb-1">Security Settings</h2>
                                    <p className="text-[#9CA3AF] text-sm">Manage your password and session security.</p>
                                </div>
                                <div className="space-y-4 max-w-md">
                                    <div>
                                        <label className="block text-xs font-bold text-[#4B5563] uppercase tracking-wider mb-2">Current Password</label>
                                        <Input type="password" placeholder="••••••••" className="bg-black/40 border-[#1F2937] text-white" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-[#4B5563] uppercase tracking-wider mb-2">New Password</label>
                                        <Input type="password" placeholder="••••••••" className="bg-black/40 border-[#1F2937] text-white" />
                                    </div>
                                </div>
                                <div className="pt-4 border-t border-[#1F2937]">
                                    <Button variant="outline" className="border-red-500/20 text-red-400 hover:bg-red-500/10">Log out all devices</Button>
                                </div>
                            </div>
                        )}

                        {activeTab === 'api' && (
                            <div className="space-y-6">
                                <div>
                                    <h2 className="text-xl font-bold text-white mb-1">API Access</h2>
                                    <p className="text-[#9CA3AF] text-sm">Manage API keys for external integrations.</p>
                                </div>
                                <div className="p-6 rounded-xl bg-black/40 border border-[#1F2937] text-center">
                                    <Key className="w-10 h-10 text-[#4B5563] mx-auto mb-3" />
                                    <h3 className="text-white font-medium mb-1">No API Keys Generated</h3>
                                    <p className="text-[#9CA3AF] text-xs mb-4">Create a key to access the SmartFlow API programmatically.</p>
                                    <Button variant="outline" className="border-[#1F2937] hover:bg-white/5">Generate New Key</Button>
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
