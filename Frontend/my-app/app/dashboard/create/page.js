'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Sparkles, Loader, Send, Zap, ArrowRight,
    CheckCircle, AlertCircle, Code, Eye, Save, Wand2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/providers/toast-provider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AIThinkingLoader, ProgressBar } from '@/components/ui/loading-states';
import api from '@/lib/api';

// Step type to label mapping
const STEP_LABELS = {
    'dynamic': 'AI Generated',
    'send_email': 'Send Email',
    'send_gmail': 'Send via Gmail',
    'format_web_digest': 'Format Digest',
    'append_google_sheet': 'Save to Sheets',
    'fetch_stock_price': 'Fetch Stock',
    'fetch_weather': 'Fetch Weather',
    'send_whatsapp': 'WhatsApp Alert',
};

const getStepLabel = (type) => STEP_LABELS[type] || 'Action Step';

export default function CreateAutomationPage() {
    const [description, setDescription] = useState('');
    const [generatedAutomation, setGeneratedAutomation] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [step, setStep] = useState('input'); // 'input', 'preview', 'saving'
    const [progress, setProgress] = useState(0);
    const { isAuthenticated, loading: authLoading } = useAuth();
    const { success, error: showError } = useToast();
    const router = useRouter();

    // Handle authentication redirect
    useEffect(() => {
        if (!authLoading && !isAuthenticated) {
            router.push('/login');
        }
    }, [isAuthenticated, authLoading, router]);

    // Show loading while checking auth
    if (authLoading) {
        return null;
    }

    // Don't render if not authenticated (will redirect)
    if (!isAuthenticated) {
        return null;
    }

    const handleGenerate = async () => {
        if (!description.trim()) {
            setError('Please describe what you want to automate');
            return;
        }

        setError('');
        setLoading(true);
        setProgress(0);

        try {
            // Simulate progress for better UX
            const progressInterval = setInterval(() => {
                setProgress(prev => Math.min(prev + 10, 90));
            }, 300);

            const result = await api.generateAutomation(description);

            clearInterval(progressInterval);
            setProgress(100);

            console.log('AI Response:', result);
            console.log('Steps:', result.steps);
            console.log('Automation object:', result.automation);

            // Handle both result.automation and direct result
            const automation = result.automation || result;
            setGeneratedAutomation(automation);
            setStep('preview');
        } catch (err) {
            console.error('Generation failed:', err);
            setError(err.message || 'Failed to generate automation. Please try again.');
            setProgress(0);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        // Ensure automation has ALL required fields matching backend validation
        const automationToSave = {
            // Required: name (string, non-empty)
            name: generatedAutomation.name && generatedAutomation.name !== 'Untitled Automation'
                ? generatedAutomation.name
                : description.slice(0, 50) + (description.length > 50 ? '...' : ''),

            // Required: description (string)
            description: generatedAutomation.description || description,

            // Required: trigger (object with type and config)
            trigger: generatedAutomation.trigger && typeof generatedAutomation.trigger === 'object'
                ? generatedAutomation.trigger
                : {
                    type: 'interval',
                    config: { every: '5m' }
                },

            // Required: steps (non-empty array)
            steps: Array.isArray(generatedAutomation.steps) && generatedAutomation.steps.length > 0
                ? generatedAutomation.steps
                : [
                    {
                        type: 'placeholder',
                        action: 'This automation needs proper steps configuration',
                        description: 'Please edit the automation to add proper workflow steps'
                    }
                ],
        };

        setLoading(true);
        setStep('saving');

        try {
            await api.createAutomation(automationToSave);
            router.push('/dashboard');
        } catch (err) {
            console.error('Save failed:', err);
            setError(err.message || 'Failed to save automation. Please try again.');
            setStep('preview');
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setDescription('');
        setGeneratedAutomation(null);
        setError('');
        setStep('input');
    };

    const examplePrompts = [
        "Fetch Times of India news and email me a summary daily",
        "Track NIFTY 50 price every hour and save to Google Sheets",
        "Send me top AI stories from HackerNews every morning"
    ];

    return (
        <div className="max-w-5xl mx-auto font-sans">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
            >
                <h1 className="text-3xl font-bold mb-2 text-white">Create Automation</h1>
                <p className="text-[#9CA3AF] text-sm">Type anything. If a tool doesn't exist, the AI builds it on the fly.</p>
            </motion.div>

            <div className="grid lg:grid-cols-2 gap-8">
                {/* Left Column - Input */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <div className="bg-[#0A0A0A] rounded-2xl p-8 border border-[#1F2937] shadow-2xl shadow-black/50">
                        <div className="flex items-center gap-2 mb-6">
                            <Sparkles className="w-5 h-5 text-emerald-500" />
                            <h2 className="text-xl font-bold text-white">Describe Workflow</h2>
                        </div>

                        {/* AI Input */}
                        <div className="mb-6">
                            <label className="block text-sm font-semibold text-gray-300 mb-3">
                                What do you want to automate?
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder={"Describe any automation in plain English...\ne.g. 'Fetch Times of India news and email me a summary every morning'"}
                                className="w-full h-40 px-4 py-3 rounded-lg bg-black/40 border border-[#1F2937] text-white placeholder-[#4B5563] focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-all resize-none text-sm"
                                disabled={loading || step !== 'input'}
                            />
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2"
                                >
                                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                                    <p className="text-sm text-red-400">{error}</p>
                                </motion.div>
                            )}
                        </div>

                        {/* Example Prompts - "Try these examples" */}
                        {step === 'input' && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.2 }}
                                className="mb-6"
                            >
                                <p className="text-xs font-semibold text-[#4B5563] uppercase tracking-wider mb-3">Try these examples</p>
                                <div className="flex flex-wrap gap-2">
                                    {examplePrompts.map((prompt, i) => (
                                        <motion.button
                                            key={i}
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => setDescription(prompt)}
                                            className="px-3 py-1.5 rounded-full border border-emerald-500/30 text-xs text-[#9CA3AF] hover:text-white hover:bg-[#064E3B] transition-all"
                                        >
                                            {prompt}
                                        </motion.button>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-3">
                            {step === 'input' && (
                                <Button
                                    onClick={handleGenerate}
                                    disabled={loading || !description.trim()}
                                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-900/20 h-11"
                                >
                                    {loading ? (
                                        <>
                                            <Loader className="w-5 h-5 mr-2 animate-spin" />
                                            Generating...
                                        </>
                                    ) : (
                                        <>
                                            <Wand2 className="w-5 h-5 mr-2" />
                                            Generate with AI
                                        </>
                                    )}
                                </Button>
                            )}

                            {step === 'preview' && (
                                <>
                                    <Button onClick={handleReset} variant="outline" className="flex-1 bg-transparent border-[#1F2937] text-white hover:bg-white/5">
                                        Cancel
                                    </Button>
                                    <Button onClick={handleSave} disabled={loading} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white">
                                        {loading ? (
                                            <>
                                                <Loader className="w-5 h-5 mr-2 animate-spin" />
                                                Saving...
                                            </>
                                        ) : (
                                            <>
                                                <Save className="w-5 h-5 mr-2" />
                                                Create Automation
                                            </>
                                        )}
                                    </Button>
                                </>
                            )}
                        </div>

                        {/* Progress indicator during loading */}
                        {loading && step === 'input' && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-4"
                            >
                                <ProgressBar
                                    progress={progress}
                                    steps={['Analyzing Request', 'Designing Workflow', 'Finalizing Config']}
                                    currentStep={Math.floor(progress / 33)}
                                />
                            </motion.div>
                        )}
                    </div>

                    {/* Try these examples section (replaces Pro Tips) */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="mt-6 p-6 rounded-xl border border-[#1F2937] bg-white/5"
                    >
                        <h3 className="text-sm font-semibold text-emerald-500 mb-3 flex items-center gap-2">
                            <Sparkles className="w-4 h-4" />
                            Try these examples
                        </h3>
                        <div className="space-y-2">
                            {[
                                "Fetch Times of India news and email me a summary daily",
                                "Track NIFTY 50 price every hour and save to Google Sheets",
                                "Send me top AI stories from HackerNews every morning"
                            ].map((prompt, i) => (
                                <button
                                    key={i}
                                    onClick={() => setDescription(prompt)}
                                    className="w-full text-left px-3 py-2 rounded-lg border border-emerald-500/20 text-sm text-[#9CA3AF] hover:text-white hover:bg-[#064E3B] transition-all"
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                </motion.div>

                {/* Right Column - Preview */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="lg:sticky lg:top-8"
                >
                    <AnimatePresence mode="wait">
                        {generatedAutomation ? (
                            <motion.div
                                key="preview"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-[#0A0A0A] rounded-2xl p-8 border border-[#1F2937] shadow-2xl relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 p-4 opacity-5">
                                    <Code className="w-32 h-32" />
                                </div>

                                <div className="flex items-center gap-2 mb-8 relative z-10">
                                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                                        <Eye className="w-5 h-5" />
                                    </div>
                                    <h2 className="text-xl font-bold text-white">Blueprint Preview</h2>
                                </div>

                                {/* Automation Details */}
                                <div className="space-y-6 mb-8 relative z-10">
                                    <div className="p-4 rounded-xl bg-white/5 border border-[#1F2937]">
                                        <label className="text-xs font-bold text-[#4B5563] uppercase tracking-wider mb-1 block">Name</label>
                                        <p className="text-lg font-semibold text-white">{generatedAutomation.name || 'Untitled Automation'}</p>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-[#4B5563] uppercase tracking-wider mb-2 block">Workflow Steps</label>
                                        <div className="space-y-0">
                                            {generatedAutomation.steps?.map((stepItem, index) => {
                                                const isDynamic = stepItem.type === 'dynamic';
                                                return (
                                                    <div key={index} className={`flex gap-4 ${isDynamic ? 'border-l-[3px] border-l-emerald-400 pl-0 ml-0' : ''}`}>
                                                        <div className="flex flex-col items-center">
                                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white z-10 box-content border-4 border-[#0A0A0A] ${isDynamic ? 'bg-emerald-500' : 'bg-[#1F2937]'}`}>
                                                                {index + 1}
                                                            </div>
                                                            {index < (generatedAutomation.steps?.length || 0) - 1 && (
                                                                <div className="w-0.5 flex-1 bg-white/10 min-h-[20px]" />
                                                            )}
                                                        </div>
                                                        <div className="pb-6 pt-0.5">
                                                            <div className="flex items-center gap-2">
                                                                <h4 className="font-semibold text-white text-sm">{getStepLabel(stepItem.type)}</h4>
                                                                {isDynamic && (
                                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#064E3B] text-emerald-300">
                                                                        AI ✨
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-[#9CA3AF] mt-1">{stepItem.description || getStepLabel(stepItem.type)}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* JSON View (Collapsible) */}
                                <details className="relative z-10 group">
                                    <summary className="cursor-pointer text-xs font-semibold text-[#4B5563] hover:text-white transition flex items-center gap-2 select-none">
                                        <Code className="w-3 h-3" />
                                        Show Configuration JSON
                                    </summary>
                                    <pre className="mt-3 p-4 rounded-lg bg-black border border-[#1F2937] text-[10px] text-emerald-400 font-mono overflow-auto max-h-48">
                                        {JSON.stringify(generatedAutomation, null, 2)}
                                    </pre>
                                </details>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="placeholder"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="bg-[#0A0A0A] rounded-2xl p-12 border border-[#1F2937] text-center flex flex-col items-center justify-center h-full min-h-[400px]"
                            >
                                <div className="w-24 h-24 mb-6 relative">
                                    <div className="absolute inset-0 bg-emerald-500 blur-2xl opacity-20 animate-pulse" />
                                    <div className="relative w-full h-full rounded-2xl bg-gradient-to-br from-white/5 to-transparent border border-[#1F2937] flex items-center justify-center">
                                        <Sparkles className="w-10 h-10 text-emerald-500" />
                                    </div>
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">Ready to Build</h3>
                                <p className="text-sm text-[#9CA3AF] max-w-xs mx-auto">
                                    Describe your automation on the left, and watch the AI construct it here in real-time.
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            </div>
        </div>
    );
}
