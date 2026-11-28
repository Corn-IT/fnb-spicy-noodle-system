#!/usr/bin/env python3
"""Backwards-compatible facade re-exporting lona_bot.ai modules."""

from lona_bot.ai.gemini_client import (  # noqa: F401
    MAX_AI_PER_MINUTE,
    MAX_TOOL_ROUNDS,
    answer_with_gemini,
    answer_with_gemini_detailed,
    probe_gemini_status,
)
from lona_bot.ai.pool_manager import (  # noqa: F401
    GeminiApiError,
    get_model_runtime_states,
    get_model_rpm_used,
    reset_ai_runtime_state,
)
from lona_bot.ai.prompt_builder import TOOL_DECLARATIONS, execute_ai_tool  # noqa: F401
from lona_bot.state.memory import AiRateLimiter  # noqa: F401
