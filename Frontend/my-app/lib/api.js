/**
 * API Client for Smart Workflow Automation
 * Handles communication with Node.js backend (port 3000) and Python AI service (port 8000)
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const AI_BASE_URL = process.env.NEXT_PUBLIC_AI_URL || 'http://localhost:8000';

class APIClient {
    constructor() {
        this.token = null;
        // Load token from localStorage on initialization
        if (typeof window !== 'undefined') {
            this.token = localStorage.getItem('auth_token');
        }
    }

    setToken(token) {
        this.token = token;
        if (typeof window !== 'undefined') {
            localStorage.setItem('auth_token', token);
        }
    }

    getToken() {
        if (this.token) return this.token;
        if (typeof window !== 'undefined') {
            this.token = localStorage.getItem('auth_token');
        }
        return this.token;
    }

    clearToken() {
        this.token = null;
        if (typeof window !== 'undefined') {
            localStorage.removeItem('auth_token');
        }
    }

    async request(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(url, {
                ...options,
                headers,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.error || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    // Auth endpoints
    async register(email, password, name, whatsappNumber) {
        const data = await this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, name, whatsappNumber }),
        });
        if (data.token) {
            this.setToken(data.token);
        }
        return data;
    }

    async login(email, password) {
        const data = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
        if (data.token) {
            this.setToken(data.token);
        }
        return data;
    }

    logout() {
        this.clearToken();
    }

    // Google OAuth helpers
    async getGoogleLoginUrl() {
        return this.request('/auth/google/login');
    }

    async getGoogleConnectionStatus() {
        return this.request('/auth/google/status');
    }

    // User profile endpoints
    async getProfile() {
        return this.request('/user/profile');
    }

    async updateProfile(data) {
        return this.request('/user/profile', {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    // Automation endpoints
    async getAutomations() {
        return this.request('/automations');
    }

    async getAutomation(id) {
        return this.request(`/automations/${id}`);
    }

    async createAutomation(automation) {
        return this.request('/automations', {
            method: 'POST',
            body: JSON.stringify(automation),
        });
    }

    async runAutomation(id) {
        return this.request(`/automations/${id}/run`, {
            method: 'POST',
        });
    }

    async deleteAutomation(id) {
        return this.request(`/automations/${id}`, {
            method: 'DELETE',
        });
    }

    async updateAutomationStatus(id, status) {
        return this.request(`/automations/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
        });
    }

    async getAutomationExecutions(id) {
        return this.request(`/automations/${id}/executions`);
    }

    // AI service endpoints
    async generateAutomation(text, timeout = 120000) {
        const url = `${AI_BASE_URL}/generate-automation`;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            // Check if response is JSON before parsing
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error(`AI service returned non-JSON response (${response.status}). Service may be down.`);
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || data.error || 'AI generation failed');
            }

            return data;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('AI service timeout. Please try again.');
            }
            console.error('AI generation failed:', error);
            throw error;
        }
    }

    // Conversation endpoint with timeout
    async sendConversation(text, inputMode = 'text', context = null, timeout = 90000) {
        const url = `${AI_BASE_URL}/conversation`;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text, input_mode: inputMode, context }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error(`AI service returned non-JSON response (${response.status}). Service may be down.`);
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || data.error || 'AI conversation failed');
            }

            return data;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('AI service timeout. Please try again.');
            }
            console.error('AI conversation failed:', error);
            throw error;
        }
    }
}

export const api = new APIClient();
export default api;
