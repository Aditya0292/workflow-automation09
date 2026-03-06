"""
AWS Lambda Function: Dynamic Code Executor

Executes AI-generated Python code in a sandboxed Lambda environment.
Used by the Smart Workflow Automation system to run dynamically generated
capabilities that don't exist in the pre-built tool registry.

Handler: lambda_handler(event, context)
Timeout: 10 seconds (configured in deployment)
"""

import json
import traceback


def lambda_handler(event, context):
    """
    Execute generated Python code safely.

    Event format:
    {
        "generated_code": str,   # Python function as string
        "inputs": dict,          # Input parameters for the function
        "context": dict          # Execution context (step outputs, etc.)
    }

    Returns:
    {
        "success": bool,
        "result": dict or None,
        "error": str or None
    }
    """
    try:
        generated_code = event.get("generated_code", "")
        inputs = event.get("inputs", {})
        exec_context = event.get("context", {})

        if not generated_code:
            return {
                "success": False,
                "result": None,
                "error": "No generated_code provided"
            }

        # Restricted namespace — only safe imports allowed
        import requests
        import re
        import datetime
        import math
        import html as html_module
        import collections
        import itertools
        import functools
        try:
            import bs4
        except ImportError:
            bs4 = None

        # Safe import wrapper
        ALLOWED_IMPORTS = {
            "requests": requests, "json": json, "re": re,
            "datetime": datetime, "bs4": bs4, "math": math,
            "html": html_module, "collections": collections,
            "itertools": itertools, "functools": functools,
        }

        def safe_import(name, *args, **kwargs):
            if name in ALLOWED_IMPORTS:
                return ALLOWED_IMPORTS[name]
            raise ImportError(f"Import '{name}' not allowed")

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
                "format": format,
                "repr": repr,
                "callable": callable,
                "iter": iter,
                "next": next,
                "None": None,
                "True": True,
                "False": False,
                "Exception": Exception,
                "ValueError": ValueError,
                "TypeError": TypeError,
                "KeyError": KeyError,
                "IndexError": IndexError,
                "AttributeError": AttributeError,
                "ImportError": ImportError,
            },
            "requests": requests,
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

        # Execute the generated code to define the function
        exec(generated_code, restricted_globals, restricted_locals)

        # Find the 'run' function in the executed code
        run_fn = restricted_locals.get("run")
        if not run_fn or not callable(run_fn):
            return {
                "success": False,
                "result": None,
                "error": "Generated code must define a 'run(inputs, context)' function"
            }

        # Call the function
        result = run_fn(inputs, exec_context)

        # Ensure result is JSON-serializable
        if result is not None:
            json.dumps(result)  # Validate serializability

        return {
            "success": True,
            "result": result if result is not None else {},
            "error": None
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
