"""
Dynamic Resolver — Capability Gap Resolution via LLM Code Generation

Takes a list of capability gaps identified during intent analysis and
generates working Python code for each gap using the existing multi-LLM cascade.

The generated code is returned as "dynamic_step" objects that can be
injected into the workflow and executed by the sandbox.

Learned tools are stored in Firebase Firestore for persistence across deploys.
Includes auto-retry with error correction (up to 3 attempts per gap).
"""

import ast
import json
import logging
import os
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

MAX_CODE_GEN_ATTEMPTS = 3

# ─── Firebase Firestore Setup ───────────────────────────────────────────

_firestore_db = None


def _get_firestore_db():
    """Lazy-initialize Firebase Admin SDK and return Firestore client."""
    global _firestore_db
    if _firestore_db is not None:
        return _firestore_db

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore

        if not firebase_admin._apps:
            # Look for serviceAccountKey.json in project root (one level up from engine-py)
            key_paths = [
                os.path.join(os.path.dirname(__file__), "..", "serviceAccountKey.json"),
                os.path.join(os.path.dirname(__file__), "serviceAccountKey.json"),
                "serviceAccountKey.json",
            ]
            key_path = None
            for p in key_paths:
                if os.path.exists(p):
                    key_path = os.path.abspath(p)
                    break

            if not key_path:
                logger.warning("⚠️ serviceAccountKey.json not found — learned tools disabled")
                return None

            cred = credentials.Certificate(key_path)
            firebase_admin.initialize_app(cred)
            logger.info(f"🔥 Firebase Admin initialized for learned tools (key: {key_path})")

        _firestore_db = firestore.client()
        return _firestore_db

    except Exception as e:
        logger.warning(f"⚠️ Could not initialize Firestore for learned tools: {e}")
        return None


# ─── Learned Tools Storage (Firestore) ──────────────────────────────────

LEARNED_TOOLS_COLLECTION = "learned_tools"


def _lookup_learned_tool(capability: str) -> dict | None:
    """Look up a previously saved tool by capability name in Firestore.
    Returns the tool dict or None. Increments use_count on hit."""
    try:
        db = _get_firestore_db()
        if db is None:
            return None

        doc_ref = db.collection(LEARNED_TOOLS_COLLECTION).document(capability)
        doc = doc_ref.get()

        if not doc.exists:
            return None

        tool = doc.to_dict()

        # Increment use count
        from google.cloud.firestore_v1 import Increment
        doc_ref.update({"use_count": Increment(1)})

        use_count = tool.get("use_count", 0) + 1
        logger.info(f"♻️ Found learned tool for: {capability} (used {use_count} times)")
        return tool

    except Exception as e:
        logger.warning(f"⚠️ Firestore lookup failed for '{capability}': {e}")
        return None


def _save_learned_tool(capability: str, description: str, generated_code: str, inputs: dict):
    """Save a successfully generated tool to Firestore for future reuse."""
    try:
        db = _get_firestore_db()
        if db is None:
            return

        doc_ref = db.collection(LEARNED_TOOLS_COLLECTION).document(capability)
        doc = doc_ref.get()

        if doc.exists:
            # Update only the generated code (preserve use_count)
            doc_ref.update({
                "generated_code": generated_code,
                "description": description,
                "inputs_schema": inputs,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info(f"💾 Updated learned tool: {capability}")
        else:
            # Create new document
            doc_ref.set({
                "capability": capability,
                "description": description,
                "generated_code": generated_code,
                "inputs_schema": inputs,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "use_count": 0,
            })
            logger.info(f"💾 Saved new learned tool: {capability}")

    except Exception as e:
        logger.warning(f"⚠️ Firestore save failed for '{capability}': {e}")


# ─── Test Runner ────────────────────────────────────────────────────────

def _test_generated_code(generated_code: str, inputs: dict) -> dict:
    """Quick test run of generated code using local sandbox.
    Used to verify code works before returning it as a dynamic step."""
    try:
        from sandbox import execute_in_sandbox
        # Force local mode for test runs regardless of SANDBOX_MODE
        result = execute_in_sandbox(
            generated_code,
            inputs,
            {},
            force_local=True
        )
        return result
    except Exception as e:
        return {"success": False, "error": str(e)}


# ─── Core Resolver ──────────────────────────────────────────────────────

def resolve_capability_gaps(gaps: list, call_llm_fn, code_gen_prompt: str, original_request: str = "") -> list:
    """
    For each capability gap, generate a Python function via LLM.
    Includes auto-retry (up to 3 attempts) with error correction prompts.

    Args:
        gaps: List of gap dicts from intent analysis, e.g.:
            [{ "capability": "fetch_rss_feed_custom", "description": "...", "inputs": {...} }]
        call_llm_fn: The call_llm function from app.py (uses multi-LLM cascade)
        code_gen_prompt: The CODE_GENERATION_PROMPT template string
        original_request: The original user request text for context

    Returns:
        List of dynamic_step dicts ready to be injected into workflow steps
    """
    dynamic_steps = []

    for gap in gaps:
        capability = gap.get("capability", "unknown_capability")
        description = gap.get("description", "")
        inputs = gap.get("inputs", {})

        logger.info(f"🔧 Resolving capability gap: {capability}")

        # Check for previously learned tool first
        learned = _lookup_learned_tool(capability)
        if learned:
            dynamic_step = {
                "type": "dynamic",
                "capability": capability,
                "description": description,
                "generated_code": learned["generated_code"],
                "inputs": inputs,
                "outputAs": capability,
                "save_as_learned_tool": False  # Already saved
            }
            dynamic_steps.append(dynamic_step)
            logger.info(f"♻️ Reusing learned tool for: {capability}")
            continue

        # Build base prompt
        base_prompt = code_gen_prompt.format(
            capability=capability,
            description=description,
            inputs_schema=json.dumps(inputs, indent=2),
            original_request=original_request
        )

        generated_code = None
        prompt = base_prompt

        try:
            for attempt in range(1, MAX_CODE_GEN_ATTEMPTS + 1):
                logger.info(f"🔄 Attempt {attempt}/{MAX_CODE_GEN_ATTEMPTS} for: {capability}")

                # Call LLM cascade to generate code
                raw_response = call_llm_fn(prompt)

                # Extract code from response (handle markdown code blocks)
                code = _extract_code(raw_response)

                if not code:
                    logger.warning(f"⚠️ Attempt {attempt}: LLM returned no valid code for: {capability}")
                    continue

                # Validate syntax
                if not _validate_syntax(code):
                    logger.warning(f"⚠️ Attempt {attempt}: syntax errors for: {capability}")
                    continue

                # Validate that it defines a run() function
                if not _has_run_function(code):
                    logger.warning(f"⚠️ Attempt {attempt}: missing run() function for: {capability}")
                    continue

                # Quick test run with the gap's example inputs
                test_result = _test_generated_code(code, inputs)

                if test_result.get("success") and not test_result.get("result", {}).get("error"):
                    # Code works — use it
                    generated_code = code
                    logger.info(f"✅ Attempt {attempt}: code passed test run for: {capability}")
                    break
                else:
                    # Code failed — build error correction prompt and retry
                    error_msg = (
                        test_result.get("result", {}).get("error")
                        or test_result.get("error", "Unknown error")
                    )
                    logger.warning(f"⚠️ Attempt {attempt} failed for {capability}: {error_msg}")

                    if attempt < MAX_CODE_GEN_ATTEMPTS:
                        # Add error context to next prompt for self-correction
                        prompt = base_prompt + f"""

IMPORTANT — YOUR PREVIOUS ATTEMPT FAILED WITH THIS ERROR:
{error_msg}

Common causes and fixes:
- If error is "404" or "Not Found" → the URL is wrong, use the KNOWN RSS FEEDS list
- If error is "NoneType has no attribute" → add None checks before accessing tag content
- If error is "Connection refused" → the URL may be blocked, try the RSS feed instead
- If error is "No items found" → the CSS selectors are wrong, try different tag names
- If error mentions "tree builder" or "xml" → use "html.parser" instead of "xml"
- If error is "Timeout" → reduce the number of items or simplify the logic

Fix the specific error above and regenerate the function.
Output ONLY the corrected Python code:"""
                    else:
                        logger.error(f"❌ All {MAX_CODE_GEN_ATTEMPTS} attempts failed for: {capability}")

            if not generated_code:
                logger.error(f"❌ Could not generate working code for: {capability}")
                continue

            dynamic_step = {
                "type": "dynamic",
                "capability": capability,
                "description": description,
                "generated_code": generated_code,
                "inputs": inputs,
                "outputAs": capability,
                "save_as_learned_tool": True  # Will be saved AFTER successful execution (not here)
            }

            dynamic_steps.append(dynamic_step)
            logger.info(f"✅ Generated dynamic step for: {capability}")

        except Exception as e:
            logger.error(f"❌ Failed to resolve gap '{capability}': {e}")
            continue

    return dynamic_steps


def _extract_code(response: str) -> str:
    """
    Extract Python code from LLM response, handling markdown code blocks.
    """
    response = response.strip()

    # Try to find code in ```python ... ``` blocks
    import re
    code_match = re.search(r'```(?:python)?\s*([\s\S]*?)\s*```', response)
    if code_match:
        return code_match.group(1).strip()

    # If no code block, check if the response itself looks like Python code
    # (starts with def, import, or a comment)
    lines = response.strip().split('\n')
    if lines and (
        lines[0].startswith('def ') or
        lines[0].startswith('import ') or
        lines[0].startswith('#') or
        lines[0].startswith('"""')
    ):
        return response.strip()

    return ""


def _validate_syntax(code: str) -> bool:
    """
    Check if the generated code is syntactically valid Python.
    """
    try:
        ast.parse(code)
        return True
    except SyntaxError as e:
        logger.debug(f"Syntax error in generated code: {e}")
        return False


def _has_run_function(code: str) -> bool:
    """
    Check if the generated code defines a run(inputs, context) function.
    """
    try:
        tree = ast.parse(code)
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name == "run":
                return True
        return False
    except SyntaxError:
        return False
