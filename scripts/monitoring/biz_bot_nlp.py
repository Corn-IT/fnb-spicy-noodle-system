#!/usr/bin/env python3
"""Backwards-compatible facade re-exporting lona_bot.nlu.invocation & semantic_engine."""

from lona_bot.nlu.invocation import *  # noqa: F401,F403
from lona_bot.nlu.semantic_engine import match_semantic_intent  # noqa: F401
