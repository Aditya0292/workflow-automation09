"""
Sandbox Executor for Dynamic Code

Executes AI-generated Python code with two modes controlled by SANDBOX_MODE env variable:
  - "lambda": Use AWS Lambda (default when AWS credentials present)
  - "local":  Use local exec() directly, skip Lambda entirely

If Lambda invocation fails for any reason, always falls back to local execution silently.
Never crashes the main service.
"""

import os
import json
import signal
import logging
import threading
import traceback

logger = logging.getLogger(__name__)

# ─── Configuration ──────────────────────────────────────────────────────

SANDBOX_MODE = os.getenv("SANDBOX_MODE", "lambda").lower()
LAMBDA_FUNCTION_NAME = os.getenv("LAMBDA_FUNCTION_NAME", "workflow-dynamic-executor")
LAMBDA_REGION = os.getenv("AWS_REGION", "ap-south-1")
LOCAL_TIMEOUT_SECONDS = 10


# ─── Timeout helper (cross-platform: SIGALRM on Linux, threading on Windows) ──

class TimeoutError(Exception):
    pass


class timeout_guard:
    """Context manager for execution timeout. Uses signal.alarm on Linux,
    threading-based timeout on Windows."""

    def __init__(self, seconds):
        self.seconds = seconds
        self.use_signal = hasattr(signal, "SIGALRM")

    def _handler(self, signum, frame):
        raise TimeoutError(f"Execution timed out after {self.seconds} seconds")

    def __enter__(self):
        if self.use_signal:
            self.old_handler = signal.signal(signal.SIGALRM, self._handler)
            signal.alarm(self.seconds)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.use_signal:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, self.old_handler)
        return False


def _run_with_threading_timeout(fn, args=(), kwargs=None, timeout_seconds=10):
    """
    Run a function with a threading-based timeout (works on Windows).
    Returns (result, error) tuple.
    """
    kwargs = kwargs or {}
    result_holder = [None]
    error_holder = [None]

    def target():
        try:
            result_holder[0] = fn(*args, **kwargs)
        except Exception as e:
            error_holder[0] = e

    thread = threading.Thread(target=target, daemon=True)
    thread.start()
    thread.join(timeout=timeout_seconds)

    if thread.is_alive():
        # Thread is still running — timeout exceeded
        # daemon=True ensures it won't block process exit
        raise TimeoutError(f"Execution timed out after {timeout_seconds} seconds")

    if error_holder[0] is not None:
        raise error_holder[0]

    return result_holder[0]


# ─── Local Execution ────────────────────────────────────────────────────

def _execute_local(generated_code: str, inputs: dict, context: dict) -> dict:
    """
    Execute generated code locally using exec() with a restricted namespace.
    
    The generated code must define a `run(inputs, context)` function.
    Only safe imports are allowed: requests, json, re, datetime, bs4.
    """
    try:
        import re
        import datetime
        import math
        import html as html_module
        import urllib.parse
        import collections
        import itertools
        import functools

        # Optional imports — available if installed
        try:
            import requests as requests_lib
        except ImportError:
            requests_lib = None

        try:
            import bs4
        except ImportError:
            bs4 = None

        # Safe import wrapper — only allows whitelisted modules
        ALLOWED_IMPORTS = {
            "requests": requests_lib,
            "json": json,
            "re": re,
            "datetime": datetime,
            "bs4": bs4,
            "math": math,
            "html": html_module,
            "urllib": __import__("urllib"),
            "urllib.parse": urllib.parse,
            "collections": collections,
            "itertools": itertools,
            "functools": functools,
        }

        def safe_import(name, *args, **kwargs):
            if name in ALLOWED_IMPORTS:
                return ALLOWED_IMPORTS[name]
            raise ImportError(f"Import '{name}' is not allowed in sandbox. Allowed: {', '.join(ALLOWED_IMPORTS.keys())}")

        restricted_globals = {
            "__builtins__": {
                "__import__": safe_import,
                "print": print,
                "len": len,
                "str": str,
                "int": int,
                "float": float,
                "bool": bool,
                "list": list,
                "dict": dict,
                "tuple": tuple,
                "set": set,
                "range": range,
                "enumerate": enumerate,
                "zip": zip,
                "map": map,
                "filter": filter,
                "sorted": sorted,
                "reversed": reversed,
                "min": min,
                "max": max,
                "sum": sum,
                "abs": abs,
                "round": round,
                "isinstance": isinstance,
                "type": type,
                "hasattr": hasattr,
                "getattr": getattr,
                "setattr": setattr,
                "any": any,
                "all": all,
                "chr": chr,
                "ord": ord,
                "hex": hex,
                "oct": oct,
                "bin": bin,
                "format": format,
                "repr": repr,
                "hash": hash,
                "id": id,
                "callable": callable,
                "iter": iter,
                "next": next,
                "slice": slice,
                "None": None,
                "True": True,
                "False": False,
                "Exception": Exception,
                "ValueError": ValueError,
                "TypeError": TypeError,
                "KeyError": KeyError,
                "IndexError": IndexError,
                "AttributeError": AttributeError,
                "StopIteration": StopIteration,
                "ImportError": ImportError,
            },
            "requests": requests_lib,
            "json": json,
            "re": re,
            "datetime": datetime,
            "bs4": bs4,
            "math": math,
            "html": html_module,
            "collections": collections,
            "itertools": itertools,
            "functools": functools,
        }

        restricted_locals = {}

        # Determine timeout strategy
        use_signal = hasattr(signal, "SIGALRM")

        if use_signal:
            # Linux: use SIGALRM (more reliable, can interrupt network I/O)
            with timeout_guard(LOCAL_TIMEOUT_SECONDS):
                exec(generated_code, restricted_globals, restricted_locals)

                run_fn = restricted_locals.get("run")
                if not run_fn or not callable(run_fn):
                    return {
                        "success": False,
                        "result": None,
                        "error": "Generated code must define a 'run(inputs, context)' function"
                    }

                result = run_fn(inputs, context)
        else:
            # Windows: use threading-based timeout
            def _exec_and_run():
                exec(generated_code, restricted_globals, restricted_locals)
                run_fn = restricted_locals.get("run")
                if not run_fn or not callable(run_fn):
                    raise ValueError("Generated code must define a 'run(inputs, context)' function")
                return run_fn(inputs, context)

            result = _run_with_threading_timeout(
                _exec_and_run, timeout_seconds=LOCAL_TIMEOUT_SECONDS
            )

        # Validate JSON serializability
        if result is not None:
            json.dumps(result)

        return {
            "success": True,
            "result": result if result is not None else {},
            "error": None
        }

    except TimeoutError as e:
        return {
            "success": False,
            "result": None,
            "error": str(e)
        }
    except json.JSONDecodeError:
        return {
            "success": False,
            "result": None,
            "error": "Generated function returned non-JSON-serializable result"
        }
    except Exception as e:
        return {
            "success": False,
            "result": None,
            "error": f"{type(e).__name__}: {str(e)}"
        }


# ─── Lambda Execution ───────────────────────────────────────────────────

def _execute_lambda(generated_code: str, inputs: dict, context: dict) -> dict:
    """
    Execute generated code via AWS Lambda.
    Returns the Lambda response or raises an exception on failure.
    """
    try:
        import boto3

        client = boto3.client("lambda", region_name=LAMBDA_REGION)

        payload = json.dumps({
            "generated_code": generated_code,
            "inputs": inputs,
            "context": context
        })

        response = client.invoke(
            FunctionName=LAMBDA_FUNCTION_NAME,
            InvocationType="RequestResponse",
            Payload=payload
        )

        # Parse Lambda response
        response_payload = json.loads(response["Payload"].read().decode("utf-8"))

        # Check for Lambda-level errors (function error, not application error)
        if response.get("FunctionError"):
            error_msg = response_payload.get("errorMessage", "Unknown Lambda error")
            raise RuntimeError(f"Lambda function error: {error_msg}")

        return response_payload

    except ImportError:
        raise RuntimeError("boto3 not installed — cannot use Lambda mode")
    except Exception as e:
        raise RuntimeError(f"Lambda invocation failed: {type(e).__name__}: {str(e)}")


# ─── Lambda Infrastructure Error Detection ──────────────────────────────

def _is_lambda_infra_error(result: dict) -> bool:
    """
    Check if a Lambda result represents an infrastructure error (not a code error).
    Infrastructure errors should trigger fallback to local execution.
    Code errors (bad data, wrong output) should pass through as-is.
    """
    error = result.get("error", "")
    if not error:
        return False

    infra_error_patterns = [
        "Task timed out",
        "Runtime.ExitError",
        "Runtime.OOMError",
        "Lambda service error",
        "Lambda function error",
        "RequestEntityTooLargeException",
        "ServiceException",
        "TooManyRequestsException",
    ]

    return any(pattern.lower() in error.lower() for pattern in infra_error_patterns)


# ─── Public API ─────────────────────────────────────────────────────────

def execute_in_sandbox(generated_code: str, inputs: dict, context: dict) -> dict:
    """
    Execute generated Python code in the configured sandbox.

    Args:
        generated_code: Python source code defining a run(inputs, context) function
        inputs: Dict of input parameters
        context: Dict of execution context (step outputs, etc.)

    Returns:
        { "success": bool, "result": dict, "error": str or None }
    """
    mode = SANDBOX_MODE

    if mode == "local":
        logger.info("🔧 Executing dynamic code in LOCAL sandbox")
        return _execute_local(generated_code, inputs, context)

    # Lambda mode (default) — with fallback to local
    if mode == "lambda":
        try:
            logger.info("☁️ Executing dynamic code via AWS Lambda")
            result = _execute_lambda(generated_code, inputs, context)

            # Check for Lambda infrastructure errors — fallback to local
            if not result.get("success") and _is_lambda_infra_error(result):
                logger.warning(f"⚠️ Lambda infrastructure error, falling back to local: {result.get('error')}")
                return _execute_local(generated_code, inputs, context)

            logger.info("✅ Lambda execution completed")
            return result
        except RuntimeError as e:
            logger.warning(f"⚠️ Lambda failed, falling back to local: {e}")
            return _execute_local(generated_code, inputs, context)

    # Unknown mode — default to local
    logger.warning(f"⚠️ Unknown SANDBOX_MODE '{mode}', using local execution")
    return _execute_local(generated_code, inputs, context)
