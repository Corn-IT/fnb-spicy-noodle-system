"""Tests for lona_bot.state (ConversationMemory, TelemetryStore, TelemetryReportMixin, TelegramMemberDirectory)."""

from __future__ import annotations

import datetime as dt
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

MONITORING_DIR = Path(__file__).resolve().parents[1]
if str(MONITORING_DIR) not in sys.path:
    sys.path.insert(0, str(MONITORING_DIR))

from lona_bot.core import config, vi_text
from lona_bot.state import member_directory, memory, telemetry


class TestStateMemoryAndMembers(unittest.TestCase):
    def test_conversation_memory_persistence_ttl_and_slots(self) -> None:
        now = [1000.0]
        with tempfile.TemporaryDirectory() as tmp:
            mem_file = Path(tmp) / "memory.json"
            mem = memory.ConversationMemory(max_turns=3, ttl_sec=600, clock=lambda: now[0], persist_path=mem_file)
            mem.append_turn("-100", "Món bán chạy nhất?", "Mì Cay Bò", slots={"intent": "topmon_best", "product_id": 1, "product_name": "Mì Cay Bò"})
            self.assertEqual(len(mem.get_history("-100")), 1)
            self.assertEqual(mem.get_slots("-100")["product_id"], 1)

            # Reload from disk preserves unexpired turns
            mem2 = memory.ConversationMemory(max_turns=3, ttl_sec=600, clock=lambda: now[0] + 10, persist_path=mem_file)
            self.assertEqual(len(mem2.get_history("-100")), 1)

            # TTL expiry purges old thread
            now[0] += 700
            self.assertEqual(mem2.get_history("-100"), [])

            # Explicit clear removes thread
            mem2.append_turn("-200", "Hỏi", "Đáp")
            mem2.clear("-200")
            self.assertEqual(mem2.get_history("-200"), [])

        slots = memory.extract_slots_from_text("Đơn ORD-2026-0008 hôm qua tại Bàn 05")
        self.assertEqual(slots.get("order_code"), "ORD-2026-0008")
        self.assertEqual(slots.get("table_name"), "Bàn 05")

    def test_telemetry_store_missed_intent_digest_and_quota_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            stats_path = Path(tmp) / "stats.json"
            qa_path = Path(tmp) / "qa.jsonl"
            tel = telemetry.TelemetryStore(stats_path=stats_path, qa_log_path=qa_path)
            now_dt = dt.datetime(2026, 11, 28, 15, 30, 0, tzinfo=vi_text.VN_TZ)

            tel.record_interaction("Món nào bán chạy?", "Mì Cay Bò", "local", "Tuấn", now_dt=now_dt)
            tel.record_interaction("Viết code", "Từ chối", "guardrail_block", "Tuấn", is_refusal=True, now_dt=now_dt)
            tel.record_interaction(
                "Món gì hay đi kèm cấp độ 7?",
                "Mì cay bò + trà sữa",
                "gemini",
                "Tuấn",
                prompt_tokens=300,
                output_tokens=120,
                total_tokens=420,
                now_dt=now_dt,
                model_used="gemini-3.5-flash-lite",
                api_requests=1,
                nlu_miss_candidate=True,
            )
            tel.record_interaction(
                "Món gì hay đi kèm cấp độ 7?",
                "Mì cay bò",
                "gemini",
                "Tuấn",
                prompt_tokens=200,
                output_tokens=80,
                total_tokens=280,
                now_dt=now_dt,
                model_used="gemini-3.5-flash-lite",
                nlu_miss_candidate=True,
            )
            tel.record_gemini_error(429, "Quota exceeded for model", now_dt=now_dt)

            digest = tel.build_missed_intent_digest()
            self.assertEqual(len(digest), 1)
            self.assertEqual(digest[0]["count"], 2)

            live_probe = {
                "configured": True,
                "key_valid": True,
                "models": [
                    {
                        "role": "Chính",
                        "short": "3.5 Lite",
                        "tier": "Primary",
                        "rpd": 200,
                        "rpm": 15,
                        "rpm_used_60s": 2,
                        "cooldown": None,
                        "model": "gemini-3.5-flash-lite",
                        "ok": True,
                        "status_code": 200,
                        "latency_ms": 120,
                        "input_limit": 1000000,
                        "output_limit": 65536,
                    }
                ],
            }
            report = tel.format_token_report(
                project_name="Ăn Vặt Tran",
                cfg={"gemini_model": "gemini-3.5-flash-lite", "gemini_model_pool": ",".join(config.DEFAULT_GEMINI_MODEL_POOL)},
                live_probe=live_probe,
                runtime_states={},
                now_dt=now_dt,
            )
            self.assertIn("TÌNH TRẠNG AI", report)
            self.assertIn("700", report)  # 420 + 280 total tokens today

            # Reload from disk preserves accumulated stats
            tel2 = telemetry.TelemetryStore(stats_path=stats_path, qa_log_path=qa_path)
            self.assertTrue(stats_path.exists())
            self.assertEqual(len(tel2.build_missed_intent_digest()), 1)

        rst = telemetry.google_quota_reset_info(dt.datetime(2026, 11, 28, 15, 30, 0, tzinfo=vi_text.VN_TZ))
        self.assertIn("countdown_str", rst)
        self.assertIn("15:00", rst["reset_vn_str"])

    def test_telegram_member_directory_and_aliases(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "members.json"
            md = member_directory.TelegramMemberDirectory(persist_path=path)
            admins_payload = {
                "ok": True,
                "result": [
                    {"user": {"id": 101, "is_bot": False, "first_name": "Thanh", "last_name": "Loan", "username": "thanhloan"}},
                    {"user": {"id": 102, "is_bot": True, "first_name": "Bot", "username": "somebot"}},
                ],
            }
            with mock.patch.object(member_directory, "tg_api", return_value=admins_payload):
                md.refresh_admins("tok", "-1001", force=True)

            md.observe_message({"from": {"id": 103, "is_bot": False, "first_name": "Minh", "last_name": "Tuấn", "username": ""}})
            exact, short = md.build_alias_maps()
            self.assertIn("thanh loan", exact)
            self.assertIn("minh tuan", exact)
            self.assertIn("loan", short)

            md_reloaded = member_directory.TelegramMemberDirectory(persist_path=path)
            exact2, _ = md_reloaded.build_alias_maps()
            self.assertIn("thanh loan", exact2)
