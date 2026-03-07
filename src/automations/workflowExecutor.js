/**
 * Workflow Executor v2
 * 
 * Self-healing workflow execution engine with:
 * - Step-level retry with exponential backoff
 * - Context memory layer (cross-step data sharing)
 * - Execution state machine (PENDING → RUNNING → [RETRYING] → SUCCESS | FAILED)
 * - Structured logging with state transitions
 * - Workflow version tracking
 * 
 * Backward compatible: same external API as v1
 */

import { db } from '../config/firebase.js';
import { isStepSupported, getStepHandler } from './stepRegistry.js';
import { EXECUTION_STATUS } from '../utils/constants.js';
import logger from '../utils/logger.js';
import {
    logStateTransition,
    updateExecutionStatus,
    logStepResult,
    ContextMemory,
    stampWorkflowVersion,
    trackWorkflowVersion
} from '../utils/executionLogger.js';

// ─── Configuration ─────────────────────────────────────────────────────

// Python AI Engine URL (for dynamic code execution)
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

const RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 1000,         // 1s, 2s, 4s exponential
    maxDelayMs: 10000,
    retryableErrors: [
        'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND',
        'rate limit', 'Rate limit', '429', '503', '504',
        'timeout', 'Timeout', 'TIMEOUT',
        'network error', 'Network Error',
        'socket hang up', 'EAI_AGAIN'
    ]
};

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Recursively remove undefined values from an object (Firestore compat)
 */
const removeUndefined = (obj) => {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
        return obj.map(item => removeUndefined(item)).filter(item => item !== undefined);
    }
    return Object.entries(obj).reduce((acc, [key, value]) => {
        const cleanValue = removeUndefined(value);
        if (cleanValue !== undefined) {
            acc[key] = cleanValue;
        }
        return acc;
    }, {});
};

/**
 * Check if an error is retryable (transient)
 */
function isRetryable(error) {
    const message = (error?.message || '').toLowerCase();
    const code = error?.code || '';

    return RETRY_CONFIG.retryableErrors.some(pattern =>
        message.includes(pattern.toLowerCase()) || code === pattern
    );
}

/**
 * Calculate delay for exponential backoff
 */
function getRetryDelay(attempt) {
    const delay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
    // Add jitter (±25%)
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    return Math.min(delay + jitter, RETRY_CONFIG.maxDelayMs);
}

/**
 * Sleep for a specified duration
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Variable Resolution ─────────────────────────────────────────────

function resolveVariables(data, context) {
    if (typeof data === 'string') {
        // Check for full replacement (preserving type)
        // Matches {{variable}} exactly (no extra text)
        const fullMatch = data.match(/^\s*{{\s*([\w.]+)\s*}}\s*$/);
        if (fullMatch) {
            const path = fullMatch[1];
            const value = getPathValue(path, context);
            return value !== undefined ? value : data;
        }

        // Check for partial replacement (string interpolation)
        // Matches "Start {{variable}} End"
        return data.replace(/{{\s*([\w.]+)\s*}}/g, (match, path) => {
            const value = getPathValue(path, context);
            if (value === undefined) return match;
            // JSON.stringify objects/arrays to avoid [object Object]
            if (typeof value === 'object' && value !== null) {
                try { return JSON.stringify(value); } catch { return String(value); }
            }
            return String(value);
        });
    }

    if (Array.isArray(data)) {
        return data.map(item => resolveVariables(item, context));
    }

    if (typeof data === 'object' && data !== null) {
        const resolved = {};
        for (const [key, value] of Object.entries(data)) {
            resolved[key] = resolveVariables(value, context);
        }
        return resolved;
    }

    return data;
}

function getPathValue(path, context) {
    const parts = path.split('.');

    // 1. Try stepOutputs shortcuts (e.g. "step_1" -> context.stepOutputs.step_1)
    if (context.stepOutputs && context.stepOutputs[parts[0]]) {
        let current = context.stepOutputs[parts[0]];
        for (let i = 1; i < parts.length; i++) {
            if (current == null) return undefined;
            current = current[parts[i]];
        }
        return current;
    }

    // 2. Try direct context access (e.g. "user.email", "trigger.type")
    let current = context;
    for (const part of parts) {
        if (current == null) return undefined;
        current = current[part];
    }
    return current;
}

// ─── Step Execution with Retry ─────────────────────────────────────────

/**
 * Execute a single step with retry logic for transient failures.
 * 
 * @param {Object} step - The step definition (type, params)
 * @param {Object} context - Execution context with stepOutputs
 * @param {number} stepNumber - Step index (1-based)
 * @param {string} executionId - Execution ID for logging
 * @returns {Object} { output, duration_ms, retries, error }
 */
async function executeStepWithRetry(step, context, stepNumber, executionId) {
    const handler = getStepHandler(step.type);

    if (!handler) {
        throw new Error(`No handler found for step type: ${step.type}`);
    }

    let lastError = null;
    let retries = 0;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
        const stepStartTime = Date.now();

        try {
            // Resolve variables in step properties (params, etc.)
            // We clone input step to avoid mutating the original definition
            const resolvedStep = resolveVariables(step, context);

            const output = await handler(resolvedStep, context);
            const duration_ms = Date.now() - stepStartTime;

            if (retries > 0) {
                logger.info(`Step ${stepNumber} succeeded after ${retries} retries`, {
                    executionId,
                    stepType: step.type,
                    duration_ms
                });
            }

            return {
                output,
                duration_ms,
                retries,
                error: null
            };

        } catch (error) {
            lastError = error;
            const duration_ms = Date.now() - stepStartTime;

            // Non-retryable error: fail immediately
            if (!isRetryable(error) || attempt === RETRY_CONFIG.maxRetries) {
                logger.error(`Step ${stepNumber} failed (${step.type})`, {
                    executionId,
                    attempt: attempt + 1,
                    retryable: isRetryable(error),
                    error: error.message,
                    duration_ms
                });

                return {
                    output: null,
                    duration_ms,
                    retries,
                    error: error.message
                };
            }

            // Retryable error: log and wait
            retries++;
            const delayMs = getRetryDelay(attempt);

            logger.warn(`Step ${stepNumber} failed (retryable), attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}`, {
                executionId,
                stepType: step.type,
                error: error.message,
                nextRetryMs: delayMs
            });

            // Log retry state transition
            await logStateTransition(executionId, EXECUTION_STATUS.RUNNING, EXECUTION_STATUS.RETRYING, {
                step: stepNumber,
                stepType: step.type,
                attempt: attempt + 1,
                error: error.message,
                retryDelayMs: delayMs
            });

            await sleep(delayMs);

            // Log transition back to running
            await logStateTransition(executionId, EXECUTION_STATUS.RETRYING, EXECUTION_STATUS.RUNNING, {
                step: stepNumber,
                stepType: step.type,
                retryAttempt: attempt + 2
            });
        }
    }

    // Should not reach here, but safety net
    return {
        output: null,
        duration_ms: 0,
        retries,
        error: lastError?.message || 'Unknown error after retries'
    };
}

// ─── Main Executor ─────────────────────────────────────────────────────

/**
 * Execute a workflow automation with retry, context memory, and state tracking.
 * 
 * @param {Object} automation - The automation object with steps
 * @param {string} executionId - The execution record ID
 * @param {Object} user - The user object (id, email, name)
 * @returns {Promise<Object>} Execution result with step outputs
 */
export const executeWorkflow = async (automation, executionId, user = null) => {
    const startTime = Date.now();
    const stepResults = [];

    // Initialize context memory
    const memory = new ContextMemory(executionId, automation.id, user);

    // Inject trigger-specific data into ContextMemory
    // Webhook payloads (set by webhooks.js route)
    if (automation._webhookPayload) {
        memory.set('webhookPayload', automation._webhookPayload);
        memory.set('triggerType', 'webhook');
        logger.debug('Injected webhook payload into ContextMemory', { executionId });
    }

    // RSS feed data (set by rssPoller.js)
    if (automation._rssData) {
        memory.set('rssFeed', automation._rssData.feed);
        memory.set('rssNewItems', automation._rssData.newItems);
        memory.set('triggerType', 'rss');
        logger.debug('Injected RSS data into ContextMemory', {
            executionId,
            newItems: automation._rssData.newItems?.length
        });
    }

    logger.info('Starting workflow execution', {
        executionId,
        automationId: automation.id,
        automationName: automation.name,
        stepCount: automation.steps?.length || 0,
        userId: user?.id
    });

    // Log state: PENDING → RUNNING
    await logStateTransition(executionId, EXECUTION_STATUS.PENDING, EXECUTION_STATUS.RUNNING, {
        automationId: automation.id,
        automationName: automation.name,
        stepCount: automation.steps?.length || 0
    });

    await updateExecutionStatus(executionId, EXECUTION_STATUS.RUNNING, {
        started_at: new Date().toISOString()
    });

    try {
        // Parse steps (handle both parsed and stringified JSON)
        const steps = typeof automation.steps === 'string'
            ? JSON.parse(automation.steps)
            : automation.steps;

        // Execute each step sequentially
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const stepNumber = i + 1;

            // Build context from memory (needed by both dynamic and regular steps)
            const stepContext = memory.buildStepContext();
            stepContext.automation = automation; // attach full automation

            logger.info(`Executing step ${stepNumber}/${steps.length}`, {
                executionId,
                stepType: step.type
            });

            // Check if step type is supported (skip for dynamic steps)
            if (step.type === 'dynamic') {
                // Dynamic step: execute via Python service
                const dynamicStartTime = Date.now();
                logger.info(`Executing DYNAMIC step ${stepNumber}: ${step.capability || 'unknown'}`, {
                    executionId,
                    capability: step.capability
                });

                try {
                    const dynamicResponse = await fetch(`${PYTHON_SERVICE_URL}/execute_dynamic`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            generated_code: step.generated_code,
                            inputs: resolveVariables(step.inputs || {}, stepContext),
                            context: {
                                stepOutputs: stepContext.stepOutputs || {},
                                user: stepContext.user || null,
                                save_as_learned_tool: step.save_as_learned_tool || false,
                                capability: step.capability || '',
                                description: step.description || ''
                            }
                        })
                    });

                    const dynamicResult = await dynamicResponse.json();

                    if (!dynamicResult.success) {
                        throw new Error(dynamicResult.error || 'Dynamic step execution failed');
                    }

                    const dynamicDuration = Date.now() - dynamicStartTime;

                    // Store result in context memory like any other step
                    const result = {
                        output: dynamicResult.result,
                        duration_ms: dynamicDuration,
                        retries: 0,
                        error: null
                    };

                    await logStepResult(executionId, i, `dynamic:${step.capability}`, result);
                    memory.storeStepOutput(i, `dynamic:${step.capability}`, result.output);

                    if (step.outputAs) {
                        memory.stepOutputs[step.outputAs] = result.output;
                    }

                    stepResults.push({
                        step: stepNumber,
                        type: `dynamic:${step.capability}`,
                        output: result.output,
                        duration: dynamicDuration,
                        retries: 0
                    });

                    logger.info(`Dynamic step ${stepNumber} completed: ${step.capability}`, { executionId });
                    continue;

                } catch (dynamicError) {
                    throw new Error(`Dynamic step ${stepNumber} (${step.capability}) failed: ${dynamicError.message}`);
                }
            }

            if (!isStepSupported(step.type)) {
                throw new Error(`Unsupported step type: ${step.type}`);
            }

            // Execute with retry
            const result = await executeStepWithRetry(step, stepContext, stepNumber, executionId);

            // Log step result to Firebase
            await logStepResult(executionId, i, step.type, result);

            // If step failed after retries, abort workflow
            if (result.error) {
                throw new Error(`Step ${stepNumber} (${step.type}) failed: ${result.error}`);
            }

            // Store result in context memory
            memory.storeStepOutput(i, step.type, result.output);

            // Also store named output if specified
            if (step.outputAs) {
                memory.stepOutputs[step.outputAs] = result.output;
            }

            // Build step result record
            const stepResult = {
                step: stepNumber,
                type: step.type,
                output: result.output,
                duration: result.duration_ms,
                retries: result.retries
            };
            stepResults.push(stepResult);

            logger.debug(`Step ${stepNumber} completed`, {
                executionId,
                stepType: step.type,
                duration: result.duration_ms,
                retries: result.retries
            });
        }

        // ─── All steps completed successfully ───────────────────────────
        const totalDuration = Date.now() - startTime;

        logger.info('Workflow execution completed', {
            executionId,
            status: 'success',
            duration: totalDuration,
            totalRetries: stepResults.reduce((sum, s) => sum + (s.retries || 0), 0)
        });

        // Log state: RUNNING → SUCCESS
        await logStateTransition(executionId, EXECUTION_STATUS.RUNNING, EXECUTION_STATUS.SUCCESS, {
            duration_ms: totalDuration,
            stepsCompleted: stepResults.length
        });

        // Persist context memory snapshot
        await memory.persist();

        // Update execution record
        await db.collection('executions').doc(executionId).update({
            status: EXECUTION_STATUS.SUCCESS,
            result: removeUndefined({
                steps: stepResults,
                duration: totalDuration,
                completedAt: new Date().toISOString(),
                totalRetries: stepResults.reduce((sum, s) => sum + (s.retries || 0), 0)
            })
        });

        return {
            success: true,
            executionId,
            status: EXECUTION_STATUS.SUCCESS,
            steps: stepResults,
            duration: totalDuration
        };

    } catch (error) {
        const totalDuration = Date.now() - startTime;

        logger.error('Workflow execution failed', {
            executionId,
            error: error.message,
            duration: totalDuration
        });

        // Log state: RUNNING → FAILED
        await logStateTransition(executionId, EXECUTION_STATUS.RUNNING, EXECUTION_STATUS.FAILED, {
            error: error.message,
            duration_ms: totalDuration,
            stepsCompleted: stepResults.length
        });

        // Persist context memory for debugging
        await memory.persist();

        // Update execution record
        await db.collection('executions').doc(executionId).update({
            status: EXECUTION_STATUS.FAILED,
            error: error.message,
            result: removeUndefined({
                steps: stepResults,
                failedAt: new Date().toISOString(),
                duration: totalDuration
            })
        });

        return {
            success: false,
            executionId,
            status: EXECUTION_STATUS.FAILED,
            steps: stepResults,
            error: error.message,
            duration: totalDuration
        };
    }
};

export default { executeWorkflow };
