#!/usr/bin/env python3
"""Thin cron entrypoint wrapper for daily/weekly reports."""

from __future__ import annotations

import argparse
import datetime as dt
import sys

from lona_bot.core.config import get_biz_config
from lona_bot.core.telegram_io import send_tg_message
from lona_bot.core.vi_text import vn_today_date
from lona_bot.handlers.report_digest import build_daily_close_report, build_weekly_summary_report


def main() -> int:
    parser = argparse.ArgumentParser(description="Send daily or weekly business summary to @POS_Lona_bot group")
    parser.add_argument("--mode", choices=("daily", "weekly"), required=True)
    parser.add_argument("--date", default=None, help="Optional reference YYYY-MM-DD")
    parser.add_argument("--stdout", action="store_true", help="Print report to stdout instead of Telegram")
    args = parser.parse_args()

    cfg = get_biz_config()
    if args.mode == "daily":
        msg = build_daily_close_report(target_date=args.date, cfg=cfg)
    else:
        ref = dt.date.fromisoformat(args.date) if args.date else vn_today_date()
        msg = build_weekly_summary_report(today=ref, cfg=cfg)

    if args.stdout:
        print(msg)
        return 0

    if not cfg["bot_token"] or not cfg["chat_id"]:
        print("[daily-biz-report] Missing FNB_BIZ_BOT_TOKEN or FNB_BIZ_CHAT_ID; skipping send.", file=sys.stderr)
        return 0

    send_tg_message(cfg["bot_token"], cfg["chat_id"], msg)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
