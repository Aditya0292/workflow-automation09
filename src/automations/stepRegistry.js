// CRITICAL: Load environment variables FIRST before any service imports
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Now safe to import services that need environment variables
import logger from '../utils/logger.js';
import { sendEmail as sendEmailService } from '../integrations/email/emailService.js';
import { fetchData, fetchStockPrice, fetchCryptoPrice } from '../integrations/fetch/fetchHandler.js';
import whatsappService from '../integrations/whatsapp/whatsappService.js';
import smsService from '../integrations/sms/smsService.js';
import webScraper from '../integrations/web/webScraperService.js';
import discordService from '../integrations/messaging/discordService.js';
import slackService from '../integrations/messaging/slackService.js';
import { httpRequest } from '../integrations/http/httpRequestHandler.js';
import { aiSummarize } from '../integrations/ai/aiSummarizeHandler.js';
import { fetchRssFeed } from '../integrations/rss/rssFeedHandler.js';
import { readGoogleSheet, writeGoogleSheet, appendGoogleSheet } from '../integrations/sheets/googleSheetsHandler.js';
import { sendGmail } from '../integrations/gmail/gmailHandler.js';
import { uploadToDrive, listDriveFiles } from '../integrations/drive/googleDriveHandler.js';
import { createCalendarEvent, listCalendarEvents } from '../integrations/calendar/googleCalendarHandler.js';

/**
 * Generic Notify Handler
 * Routes notifications to appropriate channel
 */

/**
 * Format phone number with country code
 * Auto-detects Indian numbers (10 digits starting with 6-9)
 */
const formatPhoneNumber = (phone) => {
    if (!phone) return null;

    // Remove any whitespace
    let cleaned = phone.toString().replace(/\s+/g, '');

    // Already has + prefix, return as is
    if (cleaned.startsWith('+')) {
        return cleaned;
    }

    // Check if it's a 10-digit Indian number (starts with 6, 7, 8, or 9)
    if (/^[6-9]\d{9}$/.test(cleaned)) {
        return '+91' + cleaned; // Add India country code
    }

    // Otherwise, just add + prefix
    return '+' + cleaned;
};

const notify = async (params, context) => {
    const { channel, to, subject } = params;
    let { message, body } = params;

    // Auto-stringify object messages/bodies (e.g. generic HTTP responses)
    [message, body].forEach((val, i) => {
        if (typeof val === 'object' && val !== null) {
            try {
                const str = JSON.stringify(val, null, 2);
                if (i === 0) message = str;
                else body = str;
            } catch (e) {
                const str = String(val);
                if (i === 0) message = str;
                else body = str;
            }
        }
    });

    switch (channel) {
        case 'email':
            return await sendEmailService({ to, subject, body: body || message });

        case 'notification':
        case 'console':
            logger.info(`[NOTIFICATION] ${message}`);
            return {
                sent: true,
                channel: 'notification',
                message,
                timestamp: new Date().toISOString()
            };

        case 'whatsapp':
            if (!whatsappService.isReady()) {
                logger.warn('WhatsApp service not configured, skipping message');
                return {
                    success: false,
                    error: 'WhatsApp service not configured',
                    channel: 'whatsapp'
                };
            }
            return await whatsappService.sendMessage(to, message);

        case 'sms':
            if (!smsService.isReady()) {
                logger.warn('SMS service not configured, skipping message');
                return {
                    success: false,
                    error: 'SMS service not configured',
                    channel: 'sms'
                };
            }
            return await smsService.sendSMS(to, message);

        case 'discord':
            if (!discordService.isReady() && !params.webhook_url) {
                logger.warn('Discord service not configured, skipping message');
                return {
                    success: false,
                    error: 'Discord webhook not configured',
                    channel: 'discord'
                };
            }
            return await discordService.sendMessage(params.webhook_url, message, params.options || {});

        case 'slack':
            if (!slackService.isReady() && !params.webhook_url) {
                logger.warn('Slack service not configured, skipping message');
                return {
                    success: false,
                    error: 'Slack webhook not configured',
                    channel: 'slack'
                };
            }
            return await slackService.sendMessage(params.webhook_url, message, params.options || {});

        default:
            // Default to console notification if no channel specified
            logger.info(`[NOTIFICATION] ${message}`);
            return {
                sent: true,
                channel: channel || 'notification',
                message,
                timestamp: new Date().toISOString()
            };
    }
};

/**
 * Backward compatibility wrappers
 */
const sendNotification = async (params, context) => {
    return notify({ channel: 'notification', ...params }, context);
};

const sendEmail = async (params, context) => {
    // Auto-replace generic email with logged-in user's email
    let recipientEmail = params.to;

    if (!recipientEmail || recipientEmail === 'user@example.com') {
        recipientEmail = context.user?.email;

        if (!recipientEmail) {
            throw new Error('No recipient email specified and user email not available');
        }

        logger.info('Using logged-in user email for notification', { email: recipientEmail });
    }

    // ─── Collect ALL previous step outputs ──────────────────────────────
    const previousStepOutputs = context.stepOutputs || {};
    const outputs = Object.values(previousStepOutputs);

    // DIGEST CHECK - if format_web_digest produced a result, use it directly
    const formattedDigest = outputs.find(o => typeof o === 'object' && o?.digest);
    if (formattedDigest?.digest) {
        logger.info('📧 Using formatted web digest');
        return notify({
            channel: 'email',
            ...params,
            to: recipientEmail,
            body: formattedDigest.digest
        }, context);
    }

    // ─── Smart Content Builder ─────────────────────────────────────────
    // Categorize all step outputs by type
    const stockData = [];
    const cryptoData = [];
    const weatherData = [];
    const scraperData = [];
    const otherData = [];

    for (const output of outputs) {
        if (!output || typeof output !== 'object') continue;

        if (output.provider === 'coingecko' || (output.symbol && output.change24h !== undefined)) {
            cryptoData.push(output);
        } else if (output.symbol && output.price && output.marketState !== undefined) {
            stockData.push(output);
        } else if (output.symbol && output.price && output.currency) {
            stockData.push(output);
        } else if (output.location && output.temperature !== undefined) {
            weatherData.push(output);
        } else if (output.stories || output.posts || output.repos || output.items || Array.isArray(output.results)) {
            scraperData.push(output);
        } else if (output.sent || output.placeholder || output.digest) {
            // skip notification/placeholder outputs
        } else {
            otherData.push(output);
        }
    }

    // ─── Build email body based on what was collected ───────────────────
    let emailBody = '';
    const automationName = context.automation?.name || 'Automation';

    // Crypto comparison / report
    if (cryptoData.length > 0) {
        if (cryptoData.length === 1) {
            const c = cryptoData[0];
            const arrow = parseFloat(c.change24h) >= 0 ? '📈' : '📉';
            emailBody += `${arrow} Crypto Update: ${c.symbol}\n\n`;
            emailBody += `   Price:      $${c.price}\n`;
            emailBody += `   24h Change: ${c.changePercent} ${parseFloat(c.change24h) >= 0 ? '▲' : '▼'}\n`;
            emailBody += `   Source:     ${c.provider || 'CoinGecko'}\n`;
            emailBody += `   Updated:    ${new Date(c.timestamp).toLocaleString()}\n`;
        } else {
            emailBody += `📊 Crypto Comparison Report\n`;
            emailBody += `${'═'.repeat(40)}\n\n`;

            // Table header
            emailBody += `${'Coin'.padEnd(8)} ${'Price'.padStart(12)} ${'24h Change'.padStart(12)}\n`;
            emailBody += `${'─'.repeat(8)} ${'─'.repeat(12)} ${'─'.repeat(12)}\n`;

            for (const c of cryptoData) {
                const arrow = parseFloat(c.change24h) >= 0 ? '▲' : '▼';
                emailBody += `${(c.symbol || '').padEnd(8)} ${('$' + c.price).padStart(12)} ${(c.changePercent + ' ' + arrow).padStart(12)}\n`;
            }

            emailBody += `\n`;

            // Quick analysis
            const sorted = [...cryptoData].sort((a, b) => parseFloat(b.change24h) - parseFloat(a.change24h));
            emailBody += `🏆 Best Performer:  ${sorted[0].symbol} (${sorted[0].changePercent})\n`;
            emailBody += `📉 Worst Performer: ${sorted[sorted.length - 1].symbol} (${sorted[sorted.length - 1].changePercent})\n`;
        }
    }

    // Stock market report
    if (stockData.length > 0) {
        if (emailBody) emailBody += '\n';

        if (stockData.length === 1) {
            const s = stockData[0];
            const arrow = parseFloat(s.change) >= 0 ? '📈' : '📉';
            emailBody += `${arrow} Stock Update: ${s.symbol}\n\n`;
            emailBody += `   Price:        ${s.currency || '$'} ${s.price}\n`;
            emailBody += `   Change:       ${s.change} (${s.changePercent})\n`;
            emailBody += `   Market State: ${s.marketState || 'N/A'}\n`;
            emailBody += `   Updated:      ${new Date(s.timestamp).toLocaleString()}\n`;
        } else {
            emailBody += `📊 Stock Market Report\n`;
            emailBody += `${'═'.repeat(40)}\n\n`;

            emailBody += `${'Symbol'.padEnd(10)} ${'Price'.padStart(12)} ${'Change'.padStart(12)}\n`;
            emailBody += `${'─'.repeat(10)} ${'─'.repeat(12)} ${'─'.repeat(12)}\n`;

            for (const s of stockData) {
                const arrow = parseFloat(s.change) >= 0 ? '▲' : '▼';
                emailBody += `${(s.symbol || '').padEnd(10)} ${((s.currency || '$') + s.price).padStart(12)} ${(s.changePercent + ' ' + arrow).padStart(12)}\n`;
            }

            emailBody += '\n';
            const sorted = [...stockData].sort((a, b) => parseFloat(b.change) - parseFloat(a.change));
            emailBody += `🏆 Top Gainer: ${sorted[0].symbol} (${sorted[0].changePercent})\n`;
        }
    }

    // Weather report
    if (weatherData.length > 0) {
        if (emailBody) emailBody += '\n';

        for (const w of weatherData) {
            const isMock = w.mock ? ' (Mock Data)' : '';
            emailBody += `🌤️ Weather Update for ${w.location}${isMock}\n\n`;
            emailBody += `   Temperature: ${w.temperature}°C (${w.temperature_f}°F)\n`;
            emailBody += `   Condition:   ${w.condition}${w.description ? ' - ' + w.description : ''}\n`;
            emailBody += `   Feels Like:  ${w.feels_like}°C\n`;
            emailBody += `   Humidity:    ${w.humidity}%\n`;
            emailBody += `   Wind Speed:  ${w.wind_speed} km/h\n`;
            emailBody += `   Updated:     ${new Date(w.timestamp).toLocaleString()}\n`;

            if (w.error) {
                emailBody += `\n   ⚠️ ${w.error}\n   ${w.help}\n`;
            }
        }
    }

    // Scraper data (HackerNews, GitHub, Reddit, etc.)
    if (scraperData.length > 0) {
        if (emailBody) emailBody += '\n';

        for (const data of scraperData) {
            if (data.stories) {
                // HackerNews
                emailBody += `📰 HackerNews Digest\n`;
                emailBody += `${'═'.repeat(40)}\n\n`;
                const stories = Array.isArray(data.stories) ? data.stories.slice(0, 10) : [];
                stories.forEach((story, i) => {
                    emailBody += `${i + 1}. ${story.title || story.name || 'Untitled'}\n`;
                    if (story.url) emailBody += `   🔗 ${story.url}\n`;
                    if (story.points) emailBody += `   ⬆️ ${story.points} points | 💬 ${story.comments || 0} comments\n`;
                    emailBody += '\n';
                });
            } else if (data.repos) {
                // GitHub
                emailBody += `🐙 GitHub Summary\n`;
                emailBody += `${'═'.repeat(40)}\n\n`;
                const repos = Array.isArray(data.repos) ? data.repos.slice(0, 10) : [];
                repos.forEach((repo, i) => {
                    emailBody += `${i + 1}. ${repo.name || repo.full_name || 'Untitled'}\n`;
                    if (repo.description) emailBody += `   ${repo.description}\n`;
                    emailBody += `   ⭐ ${repo.stars || 0} stars\n\n`;
                });
            } else if (data.posts) {
                // Reddit
                emailBody += `🔴 Reddit Digest\n`;
                emailBody += `${'═'.repeat(40)}\n\n`;
                const posts = Array.isArray(data.posts) ? data.posts.slice(0, 10) : [];
                posts.forEach((post, i) => {
                    emailBody += `${i + 1}. ${post.title || 'Untitled'}\n`;
                    if (post.url) emailBody += `   🔗 ${post.url}\n`;
                    emailBody += `   ⬆️ ${post.upvotes || post.score || 0} upvotes\n\n`;
                });
            }
        }
    }

    // Fallback: use params body/message or describe other data
    if (!emailBody) {
        emailBody = params.body || params.message || '';

        // If there's uncategorized data, format it neatly
        if (otherData.length > 0 && !emailBody) {
            emailBody = `📋 Automation Report\n${'═'.repeat(40)}\n\n`;
            for (const data of otherData) {
                emailBody += Object.entries(data)
                    .map(([key, val]) => `   ${key}: ${typeof val === 'object' ? JSON.stringify(val) : val}`)
                    .join('\n');
                emailBody += '\n\n';
            }
        }

        if (!emailBody) {
            emailBody = 'Automation notification';
        }
    }

    // Add footer
    emailBody += `\n---\nPowered by SmartFlow • ${new Date().toLocaleString()}`;

    logger.info('📧 Smart email built', {
        crypto: cryptoData.length,
        stocks: stockData.length,
        weather: weatherData.length,
        scrapers: scraperData.length
    });

    return notify({
        channel: 'email',
        ...params,
        to: recipientEmail,
        subject: params.subject || automationName,
        body: emailBody
    }, context);
};

const sendWhatsapp = async (params, context) => {
    // Auto-replace generic phone with logged-in user's WhatsApp number
    let recipientPhone = params.to;

    if (!recipientPhone || recipientPhone === '+1234567890') {
        // Simplified - only use whatsapp_number field
        recipientPhone = context.user?.whatsapp_number || context.user?.whatsappNumber;

        if (!recipientPhone) {
            throw new Error('No WhatsApp number specified. Please update your profile.');
        }

        // Format with country code (auto-detect India)
        recipientPhone = formatPhoneNumber(recipientPhone);

        logger.info('Using logged-in user WhatsApp number', { phone: recipientPhone });
    } else {
        // Format explicit phone number too
        recipientPhone = formatPhoneNumber(recipientPhone);
    }

    // Build message with data from previous steps
    let message = params.message || 'Automation notification';

    // If there's stock price data from previous step, include it
    const previousStepOutputs = context.stepOutputs || {};
    const stockData = Object.values(previousStepOutputs).find(output => output?.symbol && output?.price);

    if (stockData) {
        message = `
📊 Stock Update: ${stockData.symbol}

💰 Price: ${stockData.currency || ''} ${stockData.price}
📈 Change: ${stockData.change} (${stockData.changePercent})
🕒 ${new Date(stockData.timestamp).toLocaleString()}

Powered by Smart Workflow Automation
        `.trim();

        logger.info('Enhanced WhatsApp message with stock data', { symbol: stockData.symbol, price: stockData.price });
    }

    return notify({
        channel: 'whatsapp',
        ...params,
        to: recipientPhone,
        message
    }, context);
};

const sendSms = async (params, context) => {
    // Auto-replace generic phone with logged-in user's WhatsApp number (same as WhatsApp)
    let recipientPhone = params.to;

    if (!recipientPhone || recipientPhone === '+1234567890') {
        // Try user's saved phone number (check both field naming conventions)
        recipientPhone = context.user?.phoneNumber || context.user?.phone_number ||
            context.user?.whatsapp_number || context.user?.whatsappNumber;

        if (!recipientPhone) {
            throw new Error('No phone number found. Please go to Settings → Account and save your phone number first.');
        }

        // Format with country code (auto-detect India)
        recipientPhone = formatPhoneNumber(recipientPhone);

        logger.info('Using logged-in user phone for SMS', { phone: recipientPhone });
    } else {
        // Format explicit phone number too
        recipientPhone = formatPhoneNumber(recipientPhone);
    }

    // DIGEST CHECK - look for format_web_digest step output
    const digestCheckSMS = context.stepOutputs || {};
    const formattedDigestSMS = Object.values(digestCheckSMS).find(o => typeof o === 'object' && o?.digest);

    if (formattedDigestSMS?.digest) {
        logger.info('📱 Using formatted web digest for SMS');
        return notify({
            channel: 'sms',
            ...params,
            to: recipientPhone,
            message: formattedDigestSMS.digest
        }, context);
    }

    // Build message with data from previous steps
    let message = params.message || 'Automation notification';

    // If there's stock price data from previous step, include it
    const previousStepOutputs = context.stepOutputs || {};
    const stockData = Object.values(previousStepOutputs).find(output => output?.symbol && output?.price);

    if (stockData) {
        message = `Stock Update: ${stockData.symbol}\nPrice: ${stockData.currency || ''} ${stockData.price}\nChange: ${stockData.change} (${stockData.changePercent})\n${new Date(stockData.timestamp).toLocaleString()}`;

        logger.info('Enhanced SMS message with stock data', { symbol: stockData.symbol, price: stockData.price });
    }

    return notify({
        channel: 'sms',
        ...params,
        to: recipientPhone,
        message
    }, context);
};

/**
 * Mock implementations (to be replaced with generic handlers)
 */
const jobSearch = async (params, context) => {
    const { query, location } = params;
    logger.info(`[MOCK] Searching jobs: ${query} in ${location || 'any location'}`);

    return {
        query,
        location: location || 'Remote',
        results: [
            { title: `Senior ${query}`, company: 'TechCorp', salary: '$150k' },
            { title: `${query} Lead`, company: 'StartupXYZ', salary: '$130k' }
        ],
        count: 2,
        timestamp: new Date().toISOString()
    };
};

const jobApply = async (params, context) => {
    const { jobId } = params;
    logger.info(`[MOCK] Applying to job: ${jobId || 'latest'}`);

    return {
        applied: true,
        jobId: jobId || 'mock-job-123',
        timestamp: new Date().toISOString()
    };
};

const fetchUrl = async (params, context) => {
    const { url } = params;
    logger.info(`[MOCK] Fetching URL: ${url}`);

    return {
        url,
        status: 200,
        data: { mock: true },
        timestamp: new Date().toISOString()
    };
};

/**
 * Fetch Weather Data (Real API)
 * Uses OpenWeatherMap API (free tier)
 */
const fetchWeather = async (params, context) => {
    const { location } = params;
    const apiKey = process.env.WEATHER_API_KEY;

    // If no API key, return mock data with warning
    if (!apiKey) {
        logger.warn('WEATHER_API_KEY not set, using mock data');
        return {
            location: location || 'Unknown',
            temperature: 25,
            temperature_f: 77,
            condition: 'Partly Cloudy',
            humidity: 65,
            feels_like: 26,
            wind_speed: 12,
            timestamp: new Date().toISOString(),
            mock: true,
            warning: 'Set WEATHER_API_KEY in .env for real data'
        };
    }

    try {
        // Handle "current" location - default to London for now  
        // TODO: Could add IP-based geolocation in future
        let city = location;
        if (!city || city === 'current' || city === 'Current') {
            city = 'London';
            logger.info('Using default location: London (current location not implemented yet)');
        }

        // OpenWeatherMap API (free tier: 1000 calls/day)
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`;

        logger.info(`Fetching weather for: ${city}`);

        const response = await fetch(url);

        if (!response.ok) {
            // Handle specific error codes
            if (response.status === 401) {
                logger.error('Weather API 401: Invalid API key', {
                    apiKeyPresent: !!apiKey,
                    apiKeyLength: apiKey?.length
                });
                // Return mock data with helpful error
                return {
                    location: city,
                    temperature: 25,
                    temperature_f: 77,
                    condition: 'Partly Cloudy',
                    humidity: 65,
                    feels_like: 26,
                    wind_speed: 12,
                    timestamp: new Date().toISOString(),
                    mock: true,
                    error: '401 Unauthorized - Invalid API key',
                    help: 'OpenWeatherMap API key may be invalid or not activated yet. Keys can take 1-2 hours to activate after signup. Using mock data for now.'
                };
            }
            throw new Error(`Weather API error: ${response.status}`);
        }

        const data = await response.json();

        return {
            location: data.name,
            country: data.sys.country,
            temperature: Math.round(data.main.temp),
            temperature_f: Math.round((data.main.temp * 9 / 5) + 32),
            condition: data.weather[0].main,
            description: data.weather[0].description,
            humidity: data.main.humidity,
            feels_like: Math.round(data.main.feels_like),
            wind_speed: Math.round(data.wind.speed * 3.6), // m/s to km/h
            pressure: data.main.pressure,
            timestamp: new Date().toISOString(),
            icon: data.weather[0].icon
        };

    } catch (error) {
        logger.error('Weather fetch failed', { error: error.message, location });

        // If it's a 401 error, we already returned mock data above
        if (error.message.includes('401')) {
            throw error; // Already handled
        }

        // For other errors, return mock data with error info
        return {
            location: location || 'Unknown',
            temperature: 25,
            temperature_f: 77,
            condition: 'Partly Cloudy',
            humidity: 65,
            feels_like: 26,
            wind_speed: 12,
            timestamp: new Date().toISOString(),
            mock: true,
            error: error.message,
            help: 'Using mock weather data due to API error'
        };
    }
};

const condition = async (params, context) => {
    const { if: condition } = params;
    logger.info(`[MOCK] Evaluating condition: ${condition}`);

    return {
        condition,
        result: true,
        evaluated: true
    };
};

const delay = async (params, context) => {
    const duration = params.duration || '1s';
    const ms = parseDuration(duration);
    logger.info(`Delaying for ${duration} (${ms}ms)`);

    await new Promise(resolve => setTimeout(resolve, Math.min(ms, 5000)));

    return {
        delayed: true,
        duration,
        ms
    };
};

const parseDuration = (duration) => {
    const match = duration.match(/^(\d+)(s|m|h)$/);
    if (!match) return 1000;

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        default: return 1000;
    }
};

/** 
 * Step Registry
 * 
 * Maps step types to implementations.
 * Moving towards generic actions (fetch_data, notify) while maintaining
 * backward compatibility with specific actions (fetch_stock_price, send_email).
 */

/**
 * Web Scraping Steps
 */
const scrapeGithub = async (params) => {
    const result = await webScraper.scrapeWeb('github', {
        username: params.username || params.github_username,
        repo_type: params.repo_type || 'stars'
    });
    logger.info('GitHub scrape completed', { username: params.username, items: result.data.items.length });
    return result.data;
};

const scrapeHackerNews = async (params) => {
    const result = await webScraper.scrapeWeb('hackernews', {
        story_type: params.story_type || 'top',
        count: params.count || 10
    });
    logger.info('HackerNews scrape completed', { story_type: params.story_type, items: result.data.items.length });
    return result.data;
};

const scrapeReddit = async (params) => {
    const result = await webScraper.scrapeWeb('reddit', {
        subreddit: params.subreddit,
        sort: params.sort || 'hot',
        limit: params.limit || 10
    });
    logger.info('Reddit scrape completed', { subreddit: params.subreddit, items: result.data.items.length });
    return result.data;
};

const scrapeScreener = async (params) => {
    const result = await webScraper.scrapeWeb('screener', {
        symbol: params.symbol
    });
    logger.info('Screener scrape completed', { symbol: params.symbol, items: result.data.items.length });
    return result.data;
};

const scrapeGroww = async (params) => {
    const result = await webScraper.scrapeWeb('groww', {
        url: params.url || 'https://groww.in/gold-rates'
    });
    logger.info('Groww scrape completed', { items: result.data.items.length });
    return result.data;
};

const scrapeHack2Skill = async (params) => {
    const result = await webScraper.scrapeWeb('hack2skill', {
        url: params.url || 'https://hack2skill.com/',
        limit: params.limit
    });
    logger.info('Hack2Skill scrape completed', {
        resultType: typeof result.data,
        length: result.data?.length || 0
    });
    return result.data;
};

const scrapeTwitter = async (params) => {
    // Determine username from params
    // If user says "scrape twitter for nikhilkamath", params might be { query: ... } or { username: ... }
    // We'll standardise on 'username'
    const username = params.username || params.query;

    const result = await webScraper.scrapeWeb('twitter', {
        username: username,
        limit: params.limit || 5
    });

    logger.info('Twitter scrape completed', {
        username,
        resultType: typeof result.data
    });

    return result.data;
};

const formatWebDigest = async (params, context) => {
    const provider = params.provider;
    const previousStep = context.stepOutputs?.['step_1'];

    if (!previousStep) {
        throw new Error('No step_1 data');
    }

    const formatted = await webScraper.formatDigest(provider, previousStep);
    return { digest: formatted };
};
const stepRegistry = {
    // Generic actions (NEW - scalable approach)
    fetch_data: fetchData,
    notify: notify,

    // Specific actions (BACKWARD COMPATIBLE)
    fetch_stock_price: fetchStockPrice,
    fetch_crypto_price: fetchCryptoPrice,
    fetch_weather: fetchWeather,
    send_notification: sendNotification,
    send_email: sendEmail,
    send_whatsapp: sendWhatsapp,
    send_sms: sendSms,
    send_discord: async (params, context) => notify({ channel: 'discord', ...params }, context),
    send_slack: async (params, context) => notify({ channel: 'slack', ...params }, context),

    // Web scraping
    scrape_github: scrapeGithub,
    scrape_hackernews: scrapeHackerNews,
    scrape_reddit: scrapeReddit,
    scrape_screener: scrapeScreener,
    scrape_groww: scrapeGroww,
    scrape_hack2skill: scrapeHack2Skill,
    scrape_twitter: scrapeTwitter,
    format_web_digest: formatWebDigest,

    // Utility actions
    job_search: jobSearch,
    job_apply: jobApply,
    fetch_url: fetchUrl,
    condition: condition,
    delay: delay,

    // HTTP request tool
    http_request: httpRequest,

    // AI tools
    ai_summarize: aiSummarize,

    // RSS feed tool
    fetch_rss_feed: fetchRssFeed,

    // Google Sheets tools
    read_google_sheet: readGoogleSheet,
    write_google_sheet: writeGoogleSheet,
    append_google_sheet: appendGoogleSheet,

    // Gmail (per-user OAuth)
    send_gmail: sendGmail,

    // Google Drive (per-user OAuth)
    upload_to_drive: uploadToDrive,
    list_drive_files: listDriveFiles,

    // Google Calendar (per-user OAuth)
    create_calendar_event: createCalendarEvent,
    list_calendar_events: listCalendarEvents,

    // Alias for placeholder step type
    placeholder: async (params) => {
        logger.warn('Placeholder step executed - needs proper configuration');
        return { placeholder: true, message: params.description || params.action };
    }
};

/**
 * Check if a step type is supported
 */
export const isStepSupported = (stepType) => {
    return stepType in stepRegistry;
};

/**
 * Get step handler
 */
export const getStepHandler = (stepType) => {
    return stepRegistry[stepType] || null;
};

export default stepRegistry;
