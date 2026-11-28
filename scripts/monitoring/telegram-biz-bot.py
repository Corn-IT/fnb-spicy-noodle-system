#!/usr/bin/env python3
"""Thin systemd entrypoint wrapper for @POS_Lona_bot (delegates to lona_bot.dispatcher)."""

from lona_bot.dispatcher import *  # noqa: F401,F403
from lona_bot.dispatcher import main

if __name__ == "__main__":
    raise SystemExit(main())
