"""
LLM Prompts for Automation Generation (v2)

Key changes from v1:
- Dynamic tool injection from registry API
- Retry correction prompt for self-healing
- Stricter JSON enforcement
- All original prompts preserved for backward compatibility
"""

import json
import logging
import httpx
from config import ALLOWED_STEPS, ALLOWED_TRIGGERS

logger = logging.getLogger(__name__)

# ─── Registry Integration ────────────────────────────────────────────────

# Cache for registry data (fetched once at startup, refreshed on demand)
_registry_cache = {
    "tools": None,
    "prompt_text": None,
    "tool_names": None,
    "version": None
}

def fetch_registry(base_url: str = "http://localhost:3000") -> dict:
    """Fetch tool definitions from the Node.js registry endpoint."""
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.get(f"{base_url}/registry/prompt")
            response.raise_for_status()
            data = response.json()
            
            _registry_cache["prompt_text"] = data.get("promptText", "")
            _registry_cache["tool_names"] = data.get("toolNames", [])
            _registry_cache["version"] = data.get("registryVersion", "unknown")
            
            logger.info(f"✅ Registry loaded: {len(_registry_cache['tool_names'])} tools (v{_registry_cache['version']})")
            return data
    except Exception as e:
        logger.warning(f"⚠️ Could not fetch registry from {base_url}: {e}. Using hardcoded ALLOWED_STEPS.")
        return None

def get_tool_prompt_text() -> str:
    """Get tool descriptions for prompt injection. Uses registry if available, falls back to ALLOWED_STEPS."""
    if _registry_cache["prompt_text"]:
        return _registry_cache["prompt_text"]
    
    # Fallback to hardcoded list from config.py
    return "\n".join(f"- {step}" for step in ALLOWED_STEPS)

def get_allowed_tool_names() -> list:
    """Get list of allowed tool names. Uses registry if available."""
    if _registry_cache["tool_names"]:
        return _registry_cache["tool_names"]
    return ALLOWED_STEPS

# ─── System Prompts ──────────────────────────────────────────────────────

# System prompt for intent parsing (unchanged from v1)
PARSE_INTENT_PROMPT = f"""You are an intent parser for an automation system.

Extract the user's intent from their natural language request.

Return a JSON object with:
- "intent": one of ["stock_monitor", "crypto_monitor", "job_alert", "notification", "email_alert", "custom"]
- "entities": extracted values like symbol, interval, recipient, etc.
- "channel": notification channel ["notification", "email", "whatsapp", "sms"]

RULES:
- Output ONLY valid JSON
- No explanations, no markdown, no code blocks
- If unclear, use reasonable defaults
- Use interval format: <number><unit> (e.g., 1m, 5m, 30s, 1h, 2d)

Example input: "Send me AAPL stock price every 5 minutes"
Example output: {{"intent": "stock_monitor", "entities": {{"symbol": "AAPL", "interval": "5m"}}, "channel": "notification"}}
"""


def build_generation_prompt(user_request: str, tool_prompt_text: str = None) -> str:
    """
    Build the automation generation prompt with dynamic tool injection.
    This replaces the old static GENERATE_AUTOMATION_PROMPT.
    
    Key design:
    - Tool registry definitions are injected dynamically via fetch_registry()
    - Strict JSON-only output enforcement
    - ContextMemory chaining instructions for cross-step data flow
    - Uses only interval triggers (1d for daily) — no 'daily' trigger type
    """
    if tool_prompt_text is None:
        tool_prompt_text = get_tool_prompt_text()
    
    return f"""You are an automation planner. Convert user instructions into a structured automation JSON.

Return ONLY valid JSON. No markdown, no explanation, no code blocks, no preamble.

CRITICAL RULES:
1. Return ONLY a raw JSON object — ANY non-JSON text will cause a failure
2. Use ONLY tools listed in the TOOL REGISTRY below — do NOT invent new tool types
3. If unsure about a parameter value, use a sensible placeholder or null
4. Every automation MUST have at least one notification or output step (send_email, notify, append_google_sheet, etc.)
5. NEVER use a tool type that is not in the TOOL REGISTRY

OUTPUT SCHEMA:
{{
  "name": "string — short descriptive name",
  "description": "string — what this automation does",
  "trigger": {{
    "type": "manual | interval | webhook | rss",
    "every": "interval string like 5m, 1h, 1d (ONLY if type is interval)",
    "url": "RSS feed URL (ONLY if type is rss)",
    "interval": "RSS polling interval like 15m (ONLY if type is rss)"
  }},
  "steps": [
    {{
      "type": "tool_name_from_registry",
      ...tool-specific parameters from registry
    }}
  ]
}}

══════════════════════════════════════════════════
  TOOL REGISTRY (single source of truth)
══════════════════════════════════════════════════
The following tools are dynamically loaded from the MCP-compatible tool registry.
Each entry shows: tool name, description, and parameters.
Use ONLY these tools. Do NOT invent tools not listed here.

{tool_prompt_text}

══════════════════════════════════════════════════
  TRIGGER TYPES
══════════════════════════════════════════════════
- manual    — run once on demand (default if no schedule mentioned)
- interval  — repeating schedule. Use "every" field: 5m, 1h, 1d, 1w
              For "daily" requests, use: {{"type": "interval", "every": "1d"}}
              For "every morning" or "every day", use: {{"type": "interval", "every": "1d"}}
- webhook   — triggered by external HTTP POST to the automation's webhook URL
              Use when user says "triggered by webhook", "on webhook", "when webhook received"
- rss       — polls an RSS feed at an interval. Requires "url" and "interval" fields
              Use when user mentions RSS feeds, subscribing to feeds, or monitoring articles

INTERVAL FORMAT: <number><unit> where unit = s|m|h|d|w
Examples: 30s, 1m, 5m, 1h, 2d, 1w

══════════════════════════════════════════════════
  CONTEXT MEMORY & STEP CHAINING
══════════════════════════════════════════════════
Steps can reference output from previous steps using double-curly-brace variables.
The executor stores each step's output as step_1, step_2, etc.

Syntax: {{{{step_N.field}}}} where N = 1-based step index

Chaining examples:
- Reference RSS items from step 1:        {{{{step_1.items}}}}
- Reference AI summary from step 2:       {{{{step_2.summary}}}}
- Reference HTTP response data:           {{{{step_1.data}}}}
- Reference stock price:                  {{{{step_1.price}}}}
- Reference weather temperature:          {{{{step_1.temperature}}}}
- Access nested fields:                   {{{{step_1.data.rates.USD}}}}

Common output fields per tool:
- fetch_stock_price  → price, symbol, change, percentChange
- fetch_crypto_price → price, symbol, market_cap
- fetch_weather      → temperature, description, humidity, location
- fetch_rss_feed     → items (array), itemCount, title
- http_request       → status, data, headers
- ai_summarize       → summary, format, input_length
- scrape_hackernews  → stories (array), count

══════════════════════════════════════════════════
  NOTIFICATION PLACEHOLDERS
══════════════════════════════════════════════════
- Email: use "user@example.com" (backend auto-replaces with user's real email)
- WhatsApp/SMS: use "+1234567890" (backend auto-replaces with user's phone)

CHANNEL SELECTION:
- "email", "mail"        → send_email
- "whatsapp", "wa"       → send_whatsapp
- "sms", "text me"       → send_sms
- "discord"              → send_discord
- "slack"                → send_slack
- "notify", "notification" or unspecified → notify

══════════════════════════════════════════════════
  WORKFLOW PATTERNS
══════════════════════════════════════════════════

WEB SCRAPING (always 3 steps):
1. scrape_[provider]  2. format_web_digest  3. notification
Without format_web_digest the notification body will be empty!

CONDITIONAL (always 3 steps):
1. Fetch data  2. {{"type": "condition", "if": "price < 150"}}  3. notification

RSS + SUMMARIZE + NOTIFY:
1. fetch_rss_feed  2. ai_summarize (text: {{{{step_1.items}}}})  3. send_email/notify

HTTP API + SHEETS:
1. http_request  2. append_google_sheet (values reference {{{{step_1.data}}}})

══════════════════════════════════════════════════
  EXAMPLES
══════════════════════════════════════════════════

EXAMPLE 1 — Stock email:
Input: "Send me AAPL stock price every 5 minutes"
{{
  "name": "AAPL Stock Price Monitor",
  "description": "Fetch AAPL stock price every 5 minutes and send email",
  "trigger": {{"type": "interval", "every": "5m"}},
  "steps": [
    {{"type": "fetch_stock_price", "symbol": "AAPL"}},
    {{"type": "send_email", "to": "user@example.com", "subject": "AAPL Stock Update", "body": "Current AAPL price: {{{{step_1.price}}}}"}}
  ]
}}

EXAMPLE 2 — HackerNews digest:
Input: "Email me top HackerNews stories every morning"
{{
  "name": "HackerNews Daily Digest",
  "description": "Top HackerNews stories delivered daily",
  "trigger": {{"type": "interval", "every": "1d"}},
  "steps": [
    {{"type": "scrape_hackernews", "story_type": "top", "count": 10}},
    {{"type": "format_web_digest", "provider": "hackernews"}},
    {{"type": "send_email", "to": "user@example.com", "subject": "Top HackerNews Stories", "body": "Digest below"}}
  ]
}}

EXAMPLE 3 — Conditional SMS:
Input: "Track Apple stock and SMS me if it drops below $150"
{{
  "name": "Apple Stock Alert",
  "description": "SMS notification when AAPL drops below $150",
  "trigger": {{"type": "interval", "every": "5m"}},
  "steps": [
    {{"type": "fetch_stock_price", "symbol": "AAPL"}},
    {{"type": "condition", "if": "stockPrice < 150"}},
    {{"type": "send_sms", "to": "+1234567890", "message": "ALERT: AAPL dropped below $150!"}}
  ]
}}

EXAMPLE 3b — Gold/Commodity price (use fetch_stock_price, NOT crypto):
Input: "Track gold price every minute and save to Google Sheet"
{{
  "name": "Gold Price Tracker",
  "description": "Track gold price via Yahoo Finance and save to Google Sheets",
  "trigger": {{"type": "interval", "every": "1m"}},
  "steps": [
    {{"type": "fetch_stock_price", "symbol": "GOLD"}},
    {{"type": "append_google_sheet", "range": "Sheet1!A1", "values": [["{{{{step_1.symbol}}}}", "{{{{step_1.price}}}}", "{{{{step_1.currency}}}}", "{{{{step_1.timestamp}}}}"]]}}
  ]
}}
IMPORTANT: Gold, Silver, and commodities use fetch_stock_price (Yahoo Finance), NOT fetch_crypto_price. Symbol mappings: GOLD, SILVER, NIFTY, SENSEX.

EXAMPLE 3c — Crypto price:
Input: "Track Bitcoin price every 2 minutes and save to sheet"
{{
  "name": "Bitcoin Price Tracker",
  "description": "Track Bitcoin price and save to Google Sheets",
  "trigger": {{"type": "interval", "every": "2m"}},
  "steps": [
    {{"type": "fetch_crypto_price", "symbol": "BTC"}},
    {{"type": "append_google_sheet", "range": "Sheet1!A1", "values": [["{{{{step_1.symbol}}}}", "{{{{step_1.price}}}}", "{{{{step_1.changePercent}}}}", "{{{{step_1.timestamp}}}}"]]}}
  ]
}}

EXAMPLE 4 — RSS + AI summarize + email:
Input: "Summarize new TechCrunch articles and email me"
{{
  "name": "TechCrunch RSS Digest",
  "description": "Fetch TechCrunch RSS, summarize with AI, and email",
  "trigger": {{"type": "rss", "url": "https://techcrunch.com/feed/", "interval": "30m"}},
  "steps": [
    {{"type": "fetch_rss_feed", "url": "https://techcrunch.com/feed/", "limit": 5}},
    {{"type": "ai_summarize", "text": "{{{{step_1.items}}}}", "format": "bullets"}},
    {{"type": "send_email", "to": "user@example.com", "subject": "TechCrunch Digest", "body": "{{{{step_2.summary}}}}"}}
  ]
}}

EXAMPLE 5 — HTTP API + Google Sheet:
Input: "Fetch exchange rates and log them to my Google Sheet"
{{
  "name": "Exchange Rate Logger",
  "description": "Fetch exchange rates via API and append to Google Sheet",
  "trigger": {{"type": "interval", "every": "1h"}},
  "steps": [
    {{"type": "http_request", "url": "https://api.exchangerate.host/latest", "method": "GET"}},
    {{"type": "append_google_sheet", "spreadsheetId": "your_sheet_id", "range": "Sheet1!A1", "values": [["{{{{step_1.data.base}}}}", "{{{{step_1.data.rates.USD}}}}"]]}}
  ]
}}

EXAMPLE 6 — Webhook trigger:
Input: "Create automation triggered by webhook that sends a notification"
{{
  "name": "Webhook Notification",
  "description": "Send a notification when a webhook is received",
  "trigger": {{"type": "webhook"}},
  "steps": [
    {{"type": "notify", "message": "Webhook received with payload: {{{{webhookPayload}}}}"}}
  ]
}}

EXAMPLE 7 — Weather + Google Sheet:
Input: "Fetch weather daily and log results to Google Sheet"
{{
  "name": "Daily Weather Logger",
  "description": "Fetch weather every day and append to Google Sheet",
  "trigger": {{"type": "interval", "every": "1d"}},
  "steps": [
    {{"type": "fetch_weather", "location": "New York"}},
    {{"type": "append_google_sheet", "spreadsheetId": "your_sheet_id", "range": "Sheet1!A1", "values": [["{{{{step_1.location}}}}", "{{{{step_1.temperature}}}}", "{{{{step_1.description}}}}"]]}}
  ]
}}

EXAMPLE 8 — RSS + AI summarize + Google Sheet:
Input: "Monitor AI news RSS, summarize updates, and save to Google Sheet"
{{
  "name": "AI News RSS to Sheet",
  "description": "Monitor AI news RSS, summarize with AI, and log to Google Sheet",
  "trigger": {{"type": "rss", "url": "https://news.ycombinator.com/rss", "interval": "30m"}},
  "steps": [
    {{"type": "fetch_rss_feed", "url": "https://news.ycombinator.com/rss", "limit": 10}},
    {{"type": "ai_summarize", "text": "{{{{step_1.items}}}}", "format": "bullets"}},
    {{"type": "append_google_sheet", "spreadsheetId": "your_sheet_id", "range": "Sheet1!A1", "values": [["{{{{step_2.summary}}}}", "{{{{step_1.itemCount}}}}"]]}}
  ]
}}

EXAMPLE 9 — Gmail (send via user's own Gmail):
Input: "Send me an email via Gmail about today's Bitcoin price"
{{
  "name": "Bitcoin Price Gmail",
  "description": "Fetch BTC price and send via Gmail",
  "trigger": {{"type": "manual"}},
  "steps": [
    {{"type": "fetch_crypto_price", "symbol": "BTC"}},
    {{"type": "send_gmail", "to": "user@example.com", "subject": "Bitcoin Price Update", "body": "BTC is currently ${{{{step_1.price}}}} ({{{{step_1.changePercent}}}} 24h)"}}
  ]
}}

EXAMPLE 10 — Google Calendar event:
Input: "Create a meeting on my calendar for tomorrow at 3pm"
{{
  "name": "Create Calendar Event",
  "description": "Create a Google Calendar event",
  "trigger": {{"type": "manual"}},
  "steps": [
    {{"type": "create_calendar_event", "title": "Meeting", "startTime": "tomorrow 3:00 PM", "description": "Meeting created by SmartFlow"}}
  ]
}}

EXAMPLE 11 — Google Drive upload:
Input: "Fetch top Reddit posts and save them to my Google Drive"
{{
  "name": "Reddit to Drive",
  "description": "Scrape Reddit and upload digest to Google Drive",
  "trigger": {{"type": "interval", "every": "1d"}},
  "steps": [
    {{"type": "scrape_reddit", "subreddit": "technology", "sort": "hot", "limit": 10}},
    {{"type": "ai_summarize", "text": "{{{{step_1.items}}}}", "format": "bullets"}},
    {{"type": "upload_to_drive", "fileName": "reddit_digest.txt", "content": "{{{{step_2.summary}}}}"}}
  ]
}}

GOOGLE TOOLS (require user's Google OAuth connection):
- send_gmail: Send email via user's Gmail (preferred over send_email when user says "Gmail")
- upload_to_drive: Upload a file to Google Drive
- list_drive_files: List files in Google Drive
- create_calendar_event: Create a Google Calendar event. IMPORTANT: for startTime, ALWAYS use the user's exact words as natural language (e.g. "tomorrow 10:00 AM", "today 3:00 PM", "next monday 9:00 AM"). NEVER convert to ISO 8601 or UTC. The backend handles timezone conversion.
- list_calendar_events: List upcoming calendar events

Now generate the automation JSON for this request:
User request: {user_request}

Return ONLY valid JSON:"""


# Keep old prompt for backward compatibility
GENERATE_AUTOMATION_PROMPT = build_generation_prompt("{user_request_placeholder}")


# ─── Retry Correction Prompt ─────────────────────────────────────────────

RETRY_CORRECTION_PROMPT = """You are an automation planner. Your previous attempt to generate automation JSON failed.

PREVIOUS ERROR:
{error}

INVALID OUTPUT (what you generated):
{invalid_output}

ORIGINAL USER REQUEST:
{user_request}

FIX INSTRUCTIONS:
1. Analyze the error message above
2. Fix ONLY the specific issue mentioned in the error
3. Return a corrected JSON object
4. Output ONLY valid JSON — NO markdown, NO code blocks, NO explanations
5. Do NOT change parts of the JSON that were already correct

ALLOWED STEP TYPES: {allowed_steps}

Corrected JSON output:"""


# ─── Entity Extraction Prompt (unchanged from v1) ────────────────────────

ENTITY_EXTRACTION_PROMPT = f"""You are an entity extractor for an automation system.

Extract all information from the user's request into a structured format.

Return a JSON object with:
- "intent": one of ["stock_monitor", "crypto_monitor", "job_alert", "price_alert", "custom"]
- "entities": object containing extracted values

ENTITIES TO EXTRACT (include ONLY if present in the request):
- symbol: stock ticker or crypto symbol (e.g., "AAPL", "BTC", "SBIN")
- interval: time interval (format: <number><unit> like 1m, 2m, 30s, 1h, 2d)
- notification_channel: where to send updates (e.g., "whatsapp", "email", "notification")
- query: search query (for job alerts)
- condition: price condition (e.g., "above 150", "below 100")
- threshold: price threshold number

RULES:
- Output ONLY valid JSON - no explanations, no markdown
- Only include fields that are EXPLICITLY mentioned
- Do NOT guess or infer missing information
- If notification channel is mentioned (WhatsApp, email, etc.), include it
- If no channel is mentioned, do NOT include notification_channel

Examples:

Input: "Check SBIN stock every 5 minutes"
Output: {{"intent": "stock_monitor", "entities": {{"symbol": "SBIN", "interval": "5m"}}}}

Input: "WhatsApp me AAPL updates every hour"
Output: {{"intent": "stock_monitor", "entities": {{"symbol": "AAPL", "interval": "1h", "notification_channel": "whatsapp"}}}}

Input: "Send me Bitcoin price on email daily"
Output: {{"intent": "crypto_monitor", "entities": {{"symbol": "BTC", "interval": "1d", "notification_channel": "email"}}}}
"""


# ─── Twitter Research Prompt (unchanged from v1) ─────────────────────────

TWITTER_RESEARCH_PROMPT = """You are a social media researcher.
Your task is to provide a summary of the latest 5 tweets/posts from the specified Twitter handle.

Input: @{username}

Output Format (STRICT Markdown):
🐦 **Recent Insights from @{username}**
_(Source: AI Research - Live scraping currently restricted)_

📝 **Recent Update**
[Detailed summary of a recent tweet, statement, or activity by the user. Be specific about the topic, e.g., a recent interview, investment, or opinion.]
🔗 [View on Twitter](https://twitter.com/{username})

---

📝 **Recent Update**
[Summary of another recent activity...]
🔗 [View on Twitter](https://twitter.com/{username})

... (Total 5 updates)

---
_Note: This summary was generated using AI research to provide relevant context while direct live scraping is unavailable._

RULES:
- Be factual and specific based on your training data.
- Do NOT hallucinate specific dates if unsure; use "Recently" or "Recent Update".
- Focus on the most impactful recent activity (podcasts, business moves, public statements).
- Output ONLY the markdown content.
"""


# ─── Dynamic Code Generation Prompts ─────────────────────────────────────

INTENT_ANALYSIS_PROMPT = """You are an intent analyzer for a workflow automation system.

Your job: Given a user's automation request and the list of available tools below,
determine if ALL required capabilities can be fulfilled using ONLY the existing tools.

AVAILABLE TOOLS:
{available_tools}

USER REQUEST:
{user_request}

ANALYSIS RULES:
1. Break the user request into individual capabilities needed
2. For each capability, check if a PURPOSE-BUILT tool DIRECTLY matches:
   - fetch_stock_price → stock prices (AAPL, GOOGL, etc.)
   - fetch_crypto_price → cryptocurrency prices (BTC, ETH, etc.)
   - fetch_weather → weather data by city
   - scrape_hackernews → HackerNews stories
   - fetch_reddit → Reddit posts
   - scrape_github → GitHub user profiles
   - send_email / send_gmail → email sending
   - send_sms / send_whatsapp → SMS/WhatsApp sending
   - send_discord / send_slack → Discord/Slack webhooks
   - read_google_sheet / write_google_sheet / append_google_sheet → Google Sheets
   - create_calendar_event / list_calendar_events → Google Calendar
   - upload_to_drive / list_drive_files → Google Drive
   ONLY these purpose-built matches count as "existing tool can handle it"

3. ALWAYS flag as a GAP when the user mentions ANY of these:
   - A specific named news source (Times of India, NDTV, BBC, CNN, The Hindu, etc.)
   - A specific named website to scrape (GitHub trending, ProductHunt, etc.)
   - A specific API or data provider not in the tools list
   - A specific URL or RSS feed
   - Government or financial data sources (RBI, SEBI, BSE, NSE, data.gov.in, IRCTC)
   - Any social platform not in the tools list (LinkedIn, Instagram, Twitter/X)
   Generic tools (fetch_rss_feed, http_request, fetch_url) do NOT cover these —
   they lack the site-specific parsing, URL knowledge, and output formatting needed.

4. If ALL capabilities have purpose-built matches → set "can_fulfill_with_existing" to true
5. If ANY capability has NO purpose-built match → flag as gap
6. When in doubt → flag as gap. Generating specific code is always safer
   than using a generic tool incorrectly.

KNOWN RSS FEEDS (for reference when analyzing news-related requests):
  * Times of India: https://timesofindia.indiatimes.com/rssfeedstopstories.cms
  * NDTV: https://feeds.feedburner.com/ndtvnews-top-stories
  * The Hindu: https://www.thehindu.com/feeder/default.rss
  * Indian Express: https://indianexpress.com/feed/
  * Hindustan Times: https://www.hindustantimes.com/feeds/rss/latest/rssfeed.xml
  * BBC News: http://feeds.bbci.co.uk/news/rss.xml
  * CNN: http://rss.cnn.com/rss/edition.rss
  * Reuters: https://www.rss.reuters.com/news/topNews
  * TechCrunch: https://techcrunch.com/feed/
  * Hacker News: https://hnrss.org/frontpage

KNOWN SOURCES THAT ALWAYS REQUIRE DYNAMIC CODE:
  - Any named news website not handled by a purpose-built tool
  - Any RSS feed URL mentioned explicitly by the user
  - Government data sources (data.gov.in, RBI, SEBI, IRCTC, BSE, NSE)
  - Social platforms not in the tool list (LinkedIn, Instagram, X/Twitter)
  - Custom API endpoints mentioned by URL
  - GitHub trending, ProductHunt, Kaggle, StackOverflow, etc.

Return ONLY valid JSON:
{{
  "can_fulfill_with_existing": true/false,
  "capabilities_needed": [
    {{
      "description": "what capability is needed",
      "existing_tool": "tool_name or null if no match",
      "is_gap": true/false
    }}
  ],
  "gaps": [
    {{
      "capability": "short_snake_case_name",
      "description": "Detailed description of what this capability should do, including the specific source URL if known",
      "inputs": {{ "param_name": "actual_value_from_user_request" }}
    }}
  ]
}}

IMPORTANT:
- Output ONLY valid JSON — no markdown, no explanations, no code blocks
- gaps array should be empty if can_fulfill_with_existing is true
- Include the ACTUAL values from the user request in the inputs (URLs, names, keywords)
- Be aggressive about flagging gaps — it is better to generate specific dynamic code
  than to use a generic tool that produces bad output"""


CODE_GENERATION_PROMPT = """You are a Python code generator for a workflow automation system.

Generate a SELF-CONTAINED Python function that fulfills this capability:

CAPABILITY: {capability}
DESCRIPTION: {description}
EXPECTED INPUTS: {inputs_schema}
ORIGINAL USER REQUEST: {original_request}

STRICT REQUIREMENTS:
1. Define exactly ONE function named `run(inputs, context)`:
   - `inputs` is a dict with the parameters listed above
   - `context` is a dict with execution context (may contain previous step outputs)
   - Returns a dict with the results

2. Available modules (pre-loaded in sandbox — use freely via import or as globals):
   - `requests` — for HTTP calls
   - `json` — for JSON parsing
   - `re` — for regex
   - `datetime` — for date/time
   - `bs4` (BeautifulSoup) — for HTML/XML parsing
   - `math`, `html`, `collections`, `itertools`, `functools`

3. Handle errors gracefully — catch exceptions and return error info in the result dict

4. Do NOT use file I/O, subprocess, os, sys, or any other system modules

5. The function must be completely self-contained

6. CRITICAL: The return dict MUST include a "summary" key with a HUMAN-READABLE
   text summary suitable for email/notification. Format it with numbered list,
   line breaks, etc. Do NOT rely on the caller to format your output.

7. The inputs dict passed to run() will ALWAYS be pre-populated with actual values
   extracted from the user's request. Follow these rules:
   - NEVER use placeholder defaults like "https://example.com", "your-value-here",
     or "example@email.com" for required inputs
   - Use inputs.get("url"), inputs.get("query") etc. directly — they will contain
     the correct user-specified values
   - Only use fallback defaults for genuinely optional params (e.g. limit=10)
   - If a required input is missing, return an error dict clearly stating which
     input is missing — never silently use a wrong value
   - Read the ORIGINAL USER REQUEST above to understand exactly what data the
     user wants and extract any specific values (URLs, names, keywords) from it

WEB SCRAPING BEST PRACTICES:
- For RSS/XML feeds: use `bs4.BeautifulSoup(text, "xml")` or `"html.parser"`
- RSS titles are often wrapped in CDATA: `<title><![CDATA[Actual Title]]></title>`
  BeautifulSoup handles CDATA automatically — just use `.get_text()` or `.text`
- Always specify a User-Agent header: `headers={{"User-Agent": "Mozilla/5.0"}}`
- Always set `timeout=10` on requests
- For news sites, common RSS patterns:
  * Items are in `<item>` tags, titles in `<title>`, links in `<link>`
  * Always strip and clean text output

CRITICAL — DO NOT HALLUCINATE URLs. Use only verified URLs:
- KNOWN RSS FEEDS (use these EXACTLY):
  * Times of India: https://timesofindia.indiatimes.com/rssfeedstopstories.cms
  * NDTV: https://feeds.feedburner.com/ndtvnews-top-stories
  * The Hindu: https://www.thehindu.com/feeder/default.rss
  * Indian Express: https://indianexpress.com/feed/
  * Hindustan Times: https://www.hindustantimes.com/feeds/rss/latest/rssfeed.xml
  * BBC News: http://feeds.bbci.co.uk/news/rss.xml
  * CNN: http://rss.cnn.com/rss/edition.rss
  * Reuters: https://www.rss.reuters.com/news/topNews
  * TechCrunch: https://techcrunch.com/feed/
  * Hacker News: https://hnrss.org/frontpage

- If the site is NOT in the list above, discover its RSS feed URL by:
  1. Fetch the homepage HTML
  2. Parse with BeautifulSoup and look for: `soup.find("link", type="application/rss+xml")`
  3. Use the `href` from that tag
  4. If no RSS link found, try common patterns: /feed, /rss, /feeds/posts/default

KNOWN WEB SCRAPING TARGETS (use these selectors):
- GitHub Trending: URL `https://github.com/trending`
  * Repos are in `<article class="Box-row">` tags
  * Repo name: `article.find("h2").find("a")` → href gives `/owner/repo`
  * Description: `article.find("p")` 
  * Stars: `article.find("a", href=lambda h: h and "/stargazers" in h)`
  * Language: `article.find("span", itemprop="programmingLanguage")`
- GitHub Trending uses server-rendered HTML, so `requests` works directly

EXAMPLE OUTPUT:
```python
def run(inputs, context):
    try:
        url = inputs.get("url", "https://example.com/rss")
        headers = {{"User-Agent": "Mozilla/5.0 (compatible; WorkflowBot/1.0)"}}
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()

        soup = bs4.BeautifulSoup(response.text, "xml")
        items = []
        for item in soup.find_all("item")[:10]:
            title = item.find("title")
            link = item.find("link")
            items.append({{
                "title": title.get_text(strip=True) if title else "Untitled",
                "link": link.get_text(strip=True) if link else ""
            }})

        # Build human-readable summary for email
        summary_lines = [f"Top {{len(items)}} stories from Example.com:\\n"]
        for i, item in enumerate(items, 1):
            summary_lines.append(f"{{i}}. {{item['title']}}")
            if item.get("link"):
                summary_lines.append(f"   🔗 {{item['link']}}\\n")

        return {{
            "items": items,
            "count": len(items),
            "source_url": url,
            "summary": "\\n".join(summary_lines)
        }}
    except Exception as e:
        return {{
            "error": str(e),
            "items": [],
            "count": 0,
            "summary": f"Failed to fetch stories: {{str(e)}}"
        }}
```

Now generate the function for the capability described above.
Output ONLY the Python code — no markdown, no explanations, no code blocks:"""
