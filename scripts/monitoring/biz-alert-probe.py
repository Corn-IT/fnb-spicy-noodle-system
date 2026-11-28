#!/usr/bin/env python3
"""Thin timer entrypoint wrapper for business alerts (delegates to lona_bot.handlers.alert_probe)."""

from lona_bot.handlers.alert_probe import collect_business_alerts, load_state, main, save_state  # noqa: F401

if __name__ == "__main__":
    raise SystemExit(main())
