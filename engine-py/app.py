"""
Smart Workflow Automation Tool - Python AI Engine (v2)

Self-healing AI service with:
- Auto-retry for generation failures (max 3 attempts)
- Registry-aware tool validation
- Dynamic prompt injection from tool registry
- Dynamic code generation for capability gaps (feature-flagged)
- Backward-compatible API
"""

import os
import json
import re
import logging
import httpx
import time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator
from typing import Optional, List
from datetime import datetime

from config import (
    OPENROUTER_API_KEY, GEMINI_API_KEY, LLM_MODEL, GEMINI_MODEL, ALLOWED_STEPS,
    GROQ_API_KEY, GROQ_MODEL, HUGGINGFACE_API_KEY, HUGGINGFACE_MODEL
)
from prompts import (
    PARSE_INTENT_PROMPT, 
    ENTITY_EXTRACTION_PROMPT, 
    TWITTER_RESEARCH_PROMPT,
    RETRY_CORRECTION_PROMPT,
    INTENT_ANALYSIS_PROMPT,
    CODE_GENERATION_PROMPT,
    build_generation_prompt,
    fetch_registry,
    get_allowed_tool_names,
    get_tool_prompt_text
)

from validator import validate_automation, sanitize_automation
from clarification import ClarificationHandler
from required_fields import normalize_channel_response
from dynamic_resolver import resolve_capability_gaps
from sandbox import execute_in_sandbox

# ─── Feature Flag ───────────────────────────────────────────────────────
DYNAMIC_FEATURES_ENABLED = os.getenv("DYNAMIC_FEATURES_ENABLED", "false").lower() == "true"

# OpenRouter API endpoint
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

app = FastAPI(
    title="Workflow AI Engine",
    description="Self-healing AI service for automation generation with auto-retry",
    version="2.0.0"
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─── Retry Configuration ────────────────────────────────────────────────

RETRY_CONFIG = {
    "max_attempts": 3,
    "base_delay_seconds": 1,    # 1s, 2s, 4s exponential
    "max_delay_seconds": 10,
}

# CORS for Node.js backend and frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "https://workflow-automation-green.vercel.app",
        "https://*.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# Startup Event — Load Tool Registry
# ============================================================

@app.on_event("startup")
async def startup_event():
    """Load tool registry from Node.js backend on startup."""
    logger.info("🚀 AI Engine starting up...")
    try:
        fetch_registry("http://localhost:3000")
    except Exception as e:
        logger.warning(f"⚠️ Registry fetch failed at startup (will use fallback): {e}")


# ============================================================
# Request/Response Models
# ============================================================

class TextRequest(BaseModel):
    """Request model with user text"""
    text: str


class ConversationRequest(BaseModel):
    """Request model for multi-turn conversation"""
    text: str
    input_mode: str = "text"  # "voice" or "text"
    context: Optional[dict] = None


class GenerateRequest(BaseModel):
    """Request model for generic generation"""
    prompt: str
    user_request: Optional[str] = None


class IntentResponse(BaseModel):
    """Response model for parsed intent"""
    intent: str
    entities: dict
    channel: str


class DynamicExecuteRequest(BaseModel):
    """Request model for dynamic code execution"""
    generated_code: str
    inputs: dict = {}
    context: dict = {}

    @validator("generated_code")
    def code_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("generated_code cannot be empty")
        return v


# ============================================================
# Helper Functions
# ============================================================

def extract_json_from_response(text: str) -> dict:
    """
    Extract JSON from LLM response, handling markdown code blocks.
    """
    text = text.strip()
    
    # Try to find JSON in code blocks
    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
    if json_match:
        text = json_match.group(1)
    
    # Try to find raw JSON object
    json_match = re.search(r'\{[\s\S]*\}', text)
    if json_match:
        text = json_match.group(0)
    
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse JSON: {e}")


# ─── LLM Provider URLs ───────────────────────────────────────────────
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
HUGGINGFACE_URL = "https://api-inference.huggingface.co/models"


def call_llm(full_prompt: str) -> str:
    """
    Call LLM with 4-provider cascade:
    1. Groq (primary — fast & free)
    2. HuggingFace Inference (free)
    3. OpenRouter (fallback)
    4. Google Gemini (last resort)
    """
    providers = []
    errors = {}

    # Build ordered provider list (only if API key is configured)
    if GROQ_API_KEY:
        providers.append(("Groq", call_groq, "⚡"))
    else:
        errors["Groq"] = "API key not set"

    if HUGGINGFACE_API_KEY:
        providers.append(("HuggingFace", call_huggingface, "🤗"))
    else:
        errors["HuggingFace"] = "API key not set"

    if OPENROUTER_API_KEY:
        providers.append(("OpenRouter", call_openrouter, "🔄"))
    else:
        errors["OpenRouter"] = "API key not set"

    if GEMINI_API_KEY:
        providers.append(("Gemini", call_gemini, "�"))
    else:
        errors["Gemini"] = "API key not set"

    if not providers:
        raise HTTPException(
            status_code=500,
            detail="No AI provider API keys configured. Set at least one of: GEMINI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY, HUGGINGFACE_API_KEY"
        )

    # Try each provider in order
    for i, (name, call_fn, icon) in enumerate(providers):
        try:
            label = "Primary" if i == 0 else f"Fallback #{i}"
            logger.info(f"{icon} Using {name} ({label})")
            result = call_fn(full_prompt)
            logger.info(f"✅ {name} successfully generated response")
            return result
        except httpx.HTTPStatusError as e:
            error_msg = f"HTTP {e.response.status_code}: {e.response.text[:200]}"
            errors[name] = error_msg
            if e.response.status_code == 429:
                logger.warning(f"⚠️ {name} rate limited (429), trying next provider...")
            else:
                logger.warning(f"⚠️ {name} failed: {error_msg}")
        except Exception as e:
            errors[name] = str(e)
            logger.warning(f"⚠️ {name} failed: {e}, trying next provider...")

    # All providers failed
    rate_limited_count = sum(1 for err in errors.values() if "429" in str(err))
    configured_count = len(providers)

    if rate_limited_count >= configured_count and configured_count > 0:
        detail = (
            f"All {configured_count} AI providers are rate limited (429). "
            "Please wait a minute and try again. "
            "Tip: Add more free API keys (GROQ_API_KEY, HUGGINGFACE_API_KEY) for extra fallbacks."
        )
        raise HTTPException(status_code=503, detail=detail)
    else:
        error_summary = ", ".join(f"{k}: {v}" for k, v in errors.items())
        raise HTTPException(
            status_code=500,
            detail=f"All AI providers failed. {error_summary}"
        )


def call_openrouter(full_prompt: str) -> str:
    """Call OpenRouter API"""
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Smart Workflow Automation"
    }

    payload = {
        "model": LLM_MODEL,
        "messages": [
            {"role": "user", "content": full_prompt}
        ]
    }

    with httpx.Client(timeout=60.0) as client:
        response = client.post(OPENROUTER_URL, headers=headers, json=payload)
        response.raise_for_status()
        result = response.json()
        return result["choices"][0]["message"]["content"]


def call_gemini(full_prompt: str) -> str:
    """Call Google Gemini API"""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"

    headers = {
        "Content-Type": "application/json"
    }

    payload = {
        "contents": [{
            "parts": [{"text": full_prompt}]
        }]
    }

    with httpx.Client(timeout=60.0) as client:
        response = client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        result = response.json()
        return result["candidates"][0]["content"]["parts"][0]["text"]


def call_groq(full_prompt: str) -> str:
    """
    Call Groq API (free tier: 30 RPM, 14,400 requests/day).
    Uses OpenAI-compatible chat completions endpoint.
    """
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "user", "content": full_prompt}
        ],
        "temperature": 0.7,
        "max_tokens": 4096
    }

    with httpx.Client(timeout=60.0) as client:
        response = client.post(GROQ_URL, headers=headers, json=payload)
        response.raise_for_status()
        result = response.json()
        return result["choices"][0]["message"]["content"]


def call_huggingface(full_prompt: str) -> str:
    """
    Call HuggingFace Inference API (free tier).
    Uses the serverless inference endpoint.
    """
    url = f"{HUGGINGFACE_URL}/{HUGGINGFACE_MODEL}/v1/chat/completions"

    headers = {
        "Authorization": f"Bearer {HUGGINGFACE_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": HUGGINGFACE_MODEL,
        "messages": [
            {"role": "user", "content": full_prompt}
        ],
        "max_tokens": 4096,
        "stream": False
    }

    with httpx.Client(timeout=90.0) as client:
        response = client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        result = response.json()
        return result["choices"][0]["message"]["content"]


# ============================================================
# Auto-Retry Generation (NEW)
# ============================================================

def generate_with_retry(user_request: str) -> dict:
    """
    Generate automation JSON with self-healing retry loop.
    
    Flow:
    1. (If DYNAMIC_FEATURES_ENABLED) Analyze intent for capability gaps
    2. Generate with full prompt
    3. Parse JSON response
    4. Validate against schema + registry
    5. If invalid → build retry prompt with error context → re-call LLM
    6. Max 3 attempts with exponential backoff
    
    Returns: { success, automation, attempts, errors }
    """
    # ─── Dynamic Pre-Step: Intent Analysis ───────────────────────────────
    dynamic_steps = []
    if DYNAMIC_FEATURES_ENABLED:
        try:
            logger.info("🧠 Dynamic features enabled — analyzing intent for capability gaps")
            tool_list = get_tool_prompt_text()
            analysis_prompt = INTENT_ANALYSIS_PROMPT.format(
                available_tools=tool_list,
                user_request=user_request
            )
            analysis_response = call_llm(analysis_prompt)
            analysis = extract_json_from_response(analysis_response)

            if not analysis.get("can_fulfill_with_existing", True):
                gaps = analysis.get("gaps", [])
                if gaps:
                    logger.info(f"🔍 Found {len(gaps)} capability gap(s), generating dynamic code")
                    dynamic_steps = resolve_capability_gaps(
                        gaps, call_llm, CODE_GENERATION_PROMPT, original_request=user_request
                    )
                    logger.info(f"✅ Generated {len(dynamic_steps)} dynamic step(s)")
            else:
                logger.info("✅ All capabilities covered by existing tools — proceeding normally")
        except Exception as e:
            logger.warning(f"⚠️ Intent analysis failed, proceeding with standard flow: {e}")
            dynamic_steps = []

    attempts = []
    max_attempts = RETRY_CONFIG["max_attempts"]
    
    for attempt in range(1, max_attempts + 1):
        attempt_start = time.time()
        error_msg = None
        raw_output = None
        
        try:
            if attempt == 1:
                # First attempt: use full generation prompt
                if dynamic_steps:
                    # Dynamic steps exist — tell the LLM that data-fetching is handled
                    dynamic_descriptions = "\n".join(
                        f"  - Step type 'dynamic' (capability: {ds['capability']}): {ds['description']}"
                        for ds in dynamic_steps
                    )
                    dynamic_addendum = (
                        f"\n\n══════════════════════════════════════════════════\n"
                        f"  PRE-HANDLED DYNAMIC STEPS\n"
                        f"══════════════════════════════════════════════════\n"
                        f"The following capabilities are ALREADY handled by dynamic code generation.\n"
                        f"Do NOT add any data-fetching step for these — they will be auto-injected:\n"
                        f"{dynamic_descriptions}\n\n"
                        f"Your job: ONLY generate the notification/output steps (send_email, notify, "
                        f"append_google_sheet, etc.) that consume the data produced by the dynamic steps.\n"
                        f"The dynamic step output includes a 'summary' key with human-readable formatted text.\n"
                        f"For email body or notification message, use {{{{step_1.summary}}}} to get the formatted text.\n"
                        f"Do NOT include scrape_*, fetch_*, http_request, or any data-fetching tool.\n"
                    )
                    full_prompt = build_generation_prompt(user_request) + dynamic_addendum
                    logger.info("📝 Using dynamic-aware generation prompt")
                else:
                    full_prompt = build_generation_prompt(user_request)
            else:
                # Retry: use correction prompt with error context
                prev_error = attempts[-1]["error"]
                prev_output = attempts[-1]["raw_output"] or "No output"
                
                full_prompt = RETRY_CORRECTION_PROMPT.format(
                    error=prev_error,
                    invalid_output=prev_output[:2000],  # Truncate to avoid token limits
                    user_request=user_request,
                    allowed_steps=", ".join(get_allowed_tool_names())
                )
            
            # Call LLM — HTTPException means provider is down, don't retry
            response_text = call_llm(full_prompt)
            raw_output = response_text
            
            # Parse JSON
            automation = extract_json_from_response(response_text)
            
            # Check for error response from LLM
            if "error" in automation:
                error_msg = f"LLM returned error: {automation['error']}"
                raise ValueError(error_msg)
            
            # Validate
            is_valid, validation_error = validate_automation(automation)
            
            if not is_valid:
                error_msg = f"Validation failed: {validation_error}"
                raise ValueError(error_msg)
            
            # Sanitize
            automation = sanitize_automation(automation)
            
            # Inject dynamic steps if any were generated
            if dynamic_steps:
                existing_steps = automation.get("steps", [])
                
                # Strip data-fetching steps that the LLM may have added despite being 
                # told not to — these duplicate the dynamic steps
                data_fetch_prefixes = ("scrape_", "fetch_", "http_request")
                original_count = len(existing_steps)
                existing_steps = [
                    step for step in existing_steps 
                    if not step.get("type", "").startswith(data_fetch_prefixes)
                ]
                stripped = original_count - len(existing_steps)
                if stripped:
                    logger.info(f"🧹 Stripped {stripped} redundant data-fetching step(s) from LLM output")
                
                # Insert dynamic steps at the beginning (position 0)
                # so they become step_1, step_2, etc. and notification steps can reference them
                for i, ds in enumerate(dynamic_steps):
                    existing_steps.insert(i, ds)
                
                automation["steps"] = existing_steps
                logger.info(f"📦 Injected {len(dynamic_steps)} dynamic step(s) into workflow")
            
            # Success!
            duration = time.time() - attempt_start
            attempts.append({
                "attempt": attempt,
                "status": "success",
                "duration_seconds": round(duration, 2),
                "error": None,
                "raw_output": None
            })
            
            logger.info(f"✅ Generation succeeded on attempt {attempt}/{max_attempts}", extra={
                "attempt": attempt,
                "duration": round(duration, 2)
            })
            
            return {
                "success": True,
                "automation": automation,
                "attempts": len(attempts),
                "attempt_details": attempts,
                "dynamic_steps_count": len(dynamic_steps)
            }
            
        except HTTPException:
            # LLM provider is down — don't retry, propagate immediately
            raise
        except ValueError as e:
            error_msg = str(e)
        except Exception as e:
            error_msg = f"Unexpected error: {str(e)}"
        
        # Record failed attempt
        duration = time.time() - attempt_start
        attempts.append({
            "attempt": attempt,
            "status": "failed",
            "duration_seconds": round(duration, 2),
            "error": error_msg,
            "raw_output": raw_output[:500] if raw_output else None
        })
        
        logger.warning(f"⚠️ Generation attempt {attempt}/{max_attempts} failed: {error_msg}")
        
        # Exponential backoff before retry
        if attempt < max_attempts:
            delay = min(
                RETRY_CONFIG["base_delay_seconds"] * (2 ** (attempt - 1)),
                RETRY_CONFIG["max_delay_seconds"]
            )
            logger.info(f"⏳ Waiting {delay}s before retry...")
            time.sleep(delay)
    
    # All attempts failed
    logger.error(f"❌ Generation failed after {max_attempts} attempts")
    
    return {
        "success": False,
        "automation": None,
        "attempts": len(attempts),
        "attempt_details": attempts,
        "final_error": attempts[-1]["error"] if attempts else "Unknown error"
    }


def build_automation_from_context(context: dict) -> dict:
    """Build automation JSON from collected context."""
    intent = context.get("intent", "custom")
    
    # Build trigger
    interval = context.get("interval", "5m")
    trigger = {"type": "interval", "every": interval}
    
    # Build steps based on intent
    steps = []
    
    if intent == "stock_monitor":
        symbol = context.get("symbol", "UNKNOWN")
        steps.append({"type": "fetch_stock_price", "symbol": symbol.upper()})
    elif intent == "crypto_monitor":
        symbol = context.get("symbol", "BTC")
        steps.append({"type": "fetch_crypto_price", "symbol": symbol.upper()})
    elif intent == "job_alert":
        query = context.get("query", "developer")
        steps.append({"type": "job_search", "query": query})
    
    # Add notification step
    channel = context.get("notification_channel", "send_notification")
    if channel.startswith("send_"):
        notification_type = channel
    else:
        notification_type = normalize_channel_response(channel)
    
    symbol = context.get("symbol", "")
    steps.append({
        "type": notification_type,
        "message": f"{symbol.upper()} update" if symbol else "Automation update"
    })
    
    # Build name
    name = f"{context.get('symbol', 'Automation').upper()} {intent.replace('_', ' ').title()}"
    
    return {
        "name": name,
        "description": f"Auto-generated {intent} automation",
        "trigger": trigger,
        "steps": steps,
        "status": "draft"
    }


# ============================================================
# Health Check
# ============================================================

@app.get("/health")
async def health_check():
    """Service health check endpoint"""
    configured_providers = []
    if GEMINI_API_KEY: configured_providers.append("gemini")
    if OPENROUTER_API_KEY: configured_providers.append("openrouter")
    if GROQ_API_KEY: configured_providers.append("groq")
    if HUGGINGFACE_API_KEY: configured_providers.append("huggingface")

    features = ["clarification", "voice_mode", "multi_turn", "auto_retry", "registry_aware", "multi_provider_fallback"]
    if DYNAMIC_FEATURES_ENABLED:
        features.append("dynamic_code_generation")

    return {
        "status": "python service ready",
        "timestamp": datetime.now().isoformat(),
        "version": "2.2.0",
        "llm_providers": configured_providers,
        "llm_provider_count": len(configured_providers),
        "llm_configured": len(configured_providers) > 0,
        "primary_model": GEMINI_MODEL if GEMINI_API_KEY else (GROQ_MODEL if GROQ_API_KEY else LLM_MODEL),
        "allowed_steps": get_allowed_tool_names(),
        "features": features,
        "dynamic_code_generation": DYNAMIC_FEATURES_ENABLED
    }


# ============================================================
# Intent Parsing
# ============================================================

@app.post("/parse-intent")
async def parse_intent(request: TextRequest):
    """Parse user text into structured intent."""
    try:
        full_prompt = f"{PARSE_INTENT_PROMPT}\n\nUser request: {request.text}"
        response_text = call_llm(full_prompt)
        result = extract_json_from_response(response_text)
        
        return {
            "success": True,
            "intent": result.get("intent", "custom"),
            "entities": result.get("entities", {}),
            "channel": result.get("channel", "notification"),
            "raw_text": request.text
        }
        
    except ValueError as e:
        return {"success": False, "error": str(e), "raw_text": request.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Multi-Turn Conversation
# ============================================================

@app.post("/conversation")
async def conversation(request: ConversationRequest):
    """
    Handle multi-turn conversation for automation creation.
    Uses auto-retry when generating final automation.
    """
    input_mode = request.input_mode
    context = request.context or {}
    previous_answers = context.get("previous_answers", {})
    
    try:
        # Check if this is a continuation (answering a clarification)
        if context.get("awaiting_field"):
            # User is answering a previous question
            awaiting_field = context["awaiting_field"]
            partial_context = context.get("partial_context", {})
            
            # Merge the new answer
            updated_context = ClarificationHandler.merge_context(
                partial_context, 
                awaiting_field, 
                request.text
            )
            
            # Check if more fields are missing
            intent = updated_context.get("intent", "stock_monitor")
            
            if ClarificationHandler.needs_clarification(intent, updated_context):
                # Need more info - ask next question
                clarification = ClarificationHandler.get_next_question(
                    intent, updated_context, input_mode
                )
                clarification["awaiting_field"] = clarification["missing_field"]
                return clarification
            else:
                # All fields collected - generate automation
                automation = build_automation_from_context(updated_context)
                automation = sanitize_automation(automation)
                
                confirmation = ClarificationHandler.generate_confirmation(
                    automation, input_mode
                )
                
                return {
                    "success": True,
                    "needs_clarification": False,
                    "automation": automation,
                    **confirmation
                }
        
        # First turn - parse intent and extract entities
        full_prompt = f"{ENTITY_EXTRACTION_PROMPT}\n\nUser request: {request.text}"
        response_text = call_llm(full_prompt)
        extracted = extract_json_from_response(response_text)
        
        intent = extracted.get("intent", "stock_monitor")
        entities = extracted.get("entities", {})
        
        # Check for missing required fields
        if ClarificationHandler.needs_clarification(intent, entities):
            # Generate clarification question
            clarification = ClarificationHandler.get_next_question(
                intent, entities, input_mode
            )
            clarification["awaiting_field"] = clarification["missing_field"]
            return clarification
        else:
            # All info present - generate automation directly
            automation = build_automation_from_context(entities)
            automation = sanitize_automation(automation)
            
            confirmation = ClarificationHandler.generate_confirmation(
                automation, input_mode
            )
            
            return {
                "success": True,
                "needs_clarification": False,
                "automation": automation,
                **confirmation
            }
    
    except ValueError as e:
        return {
            "success": False,
            "error": str(e),
            "response_mode": input_mode,
            "text": "I'm sorry, I couldn't understand that. Could you try rephrasing?"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Automation Generation (with Auto-Retry)
# ============================================================

@app.post("/generate-automation")
async def generate_automation(request: TextRequest):
    """
    Generate complete automation JSON from user text.
    Now with auto-retry: if generation fails, retries with error context.
    """
    result = generate_with_retry(request.text)
    
    if result["success"]:
        return {
            "success": True,
            "automation": result["automation"],
            "raw_text": request.text,
            "attempts": result["attempts"],
            "retried": result["attempts"] > 1
        }
    else:
        return {
            "success": False,
            "error": result["final_error"],
            "raw_text": request.text,
            "attempts": result["attempts"],
            "attempt_details": result["attempt_details"]
        }


# ============================================================
# Generic Generation (Summarization, Research, etc.)
# ============================================================

@app.post("/generate")
async def generate_text(request: GenerateRequest):
    """
    Generic text generation endpoint.
    Used for summarization, expanding content, etc.
    """
    try:
        # Prefer the full detailed prompt if provided
        full_prompt = request.user_request if request.user_request else request.prompt
        
        logger.info(f"📝 Generative request (len={len(full_prompt)})")
        context_response = call_llm(full_prompt)
        
        return {
            "success": True,
            "result": context_response
        }
    except Exception as e:
        logger.error(f"❌ Generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Registry Refresh
# ============================================================

@app.post("/refresh-registry")
async def refresh_registry():
    """Force refresh of tool registry from Node.js backend."""
    try:
        data = fetch_registry("http://localhost:3000")
        if data:
            return {"success": True, "message": "Registry refreshed", "tools": len(data.get("toolNames", []))}
        else:
            return {"success": False, "message": "Could not reach registry endpoint"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ============================================================
# Twitter Research (Fallback for Scraping)
# ============================================================

@app.post("/research-twitter")
async def research_twitter(request: TextRequest):
    """Research latest tweets/activity for a user via AI when scraping is blocked."""
    try:
        username = request.text.replace('@', '').strip()
        logger.info(f"🔍 Researching Twitter activity for @{username}")
        
        full_prompt = TWITTER_RESEARCH_PROMPT.format(username=username)
        response_text = call_llm(full_prompt)
        
        return {
            "success": True,
            "username": username,
            "data": response_text
        }
    except Exception as e:
        logger.error(f"❌ Twitter research failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Dynamic Code Execution
# ============================================================

# ─── Dynamic Output Validation Helpers ──────────────────────────────────

def _is_good_result(result: dict) -> bool:
    """Check if a sandbox execution result is good enough to cache."""
    if not result.get("success"):
        return False
    output = result.get("result", {})
    # Bad if explicit error key present
    if output.get("error"):
        return False
    # Bad if count is 0 and items is empty
    if output.get("count", 1) == 0 and not output.get("items"):
        return False
    # Bad if summary says "Failed" or "Error"
    summary = str(output.get("summary", ""))
    if summary.startswith("Failed") or summary.startswith("Error"):
        return False
    return True


def _validate_dynamic_output(result: dict) -> tuple:
    """
    Validates dynamic execution output.
    Returns (is_valid, reason_if_invalid)
    """
    if not result.get("success"):
        return False, f"Execution failed: {result.get('error', 'unknown')}"

    output = result.get("result", {})

    # Must have summary for notification steps
    if "summary" not in output:
        return False, "Output missing required 'summary' field"

    # Summary must not be an error message
    summary = str(output.get("summary", ""))
    if any(bad in summary.lower() for bad in ["failed to fetch", "error:", "exception:", "traceback"]):
        return False, f"Output summary indicates failure: {summary[:100]}"

    # If it's a list result, must have at least some items
    if "items" in output and "count" in output:
        if output["count"] == 0:
            return False, "Output returned 0 items — possible wrong URL or selectors"

    return True, "ok"


@app.post("/execute_dynamic")
async def execute_dynamic(request: DynamicExecuteRequest):
    """
    Execute dynamically generated Python code in sandbox.
    Used by the Node.js workflow executor for 'dynamic' step types.
    Validates output quality and conditionally saves to Firestore learned tools.
    """
    try:
        logger.info(f"⚡ Executing dynamic code (len={len(request.generated_code)})")
        result = execute_in_sandbox(
            generated_code=request.generated_code,
            inputs=request.inputs,
            context=request.context
        )

        # Validate output quality (Fix 3)
        is_valid, reason = _validate_dynamic_output(result)
        if not is_valid:
            logger.warning(f"⚠️ Dynamic output validation failed: {reason}")
            result["_validation_failed"] = True
            result["_validation_reason"] = reason
        else:
            logger.info("✅ Dynamic output validated successfully")

        # Conditional save to Firestore (Fix 1)
        # Only save if: result is good + validation passed + request wants to save
        should_save = (
            request.context.get("save_as_learned_tool", False)
            and _is_good_result(result)
            and not result.get("_validation_failed")
        )

        if should_save:
            capability = request.context.get("capability", "")
            description = request.context.get("description", "")
            if capability:
                from dynamic_resolver import _save_learned_tool
                _save_learned_tool(
                    capability=capability,
                    description=description,
                    generated_code=request.generated_code,
                    inputs=request.inputs
                )
                logger.info(f"💾 Saved learned tool after successful execution: {capability}")
        elif request.context.get("save_as_learned_tool", False):
            logger.warning(f"⚠️ Skipped saving learned tool — result did not pass quality checks")

        return result
    except Exception as e:
        logger.error(f"❌ Dynamic execution failed: {str(e)}")
        return {
            "success": False,
            "result": None,
            "error": f"Execution error: {str(e)}"
        }


# ============================================================
# Run with: uvicorn app:app --reload --port 8000
# ============================================================

