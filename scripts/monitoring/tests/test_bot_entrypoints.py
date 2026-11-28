"""Tests for lona_bot dispatcher, toggles, telegram entrypoints, alert probe, daily report, and compat facades."""

from __future__ import annotations

import importlib.util
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

MONITORING_DIR = Path(__file__).resolve().parents[1]
if str(MONITORING_DIR) not in sys.path:
    sys.path.insert(0, str(MONITORING_DIR))

from lona_bot import bot_commands, dispatcher, dispatcher_chat
from lona_bot.core import config
from lona_bot.handlers import alert_probe
from lona_bot.state.memory import AiRateLimiter, ConversationMemory
from lona_bot.state.telemetry import TelemetryStore


def _load_script_module(filename: str, mod_name: str):
    spec = importlib.util.spec_from_file_location(mod_name, str(MONITORING_DIR / filename))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class TestBotEntrypointsAndDispatcher(unittest.TestCase):
    def setUp(self) -> None:
        config.reset_toggle_cache()
        self.cfg = {
            "project_name": "Ăn Vặt Tran",
            "project_dir": "/tmp",
            "bot_token": "",
            "chat_id": "-1001",
            "gemini_api_key": "test-key",
            "gemini_model": "gemini-3.5-flash-lite",
        }

    def test_dispatcher_slash_commands_wake_and_runtime_toggles(self) -> None:
        limiter = AiRateLimiter()
        with tempfile.TemporaryDirectory() as tmp:
            mem = ConversationMemory(persist_path=Path(tmp) / "mem.json")
            tel = TelemetryStore(stats_path=Path(tmp) / "stats.json", qa_log_path=Path(tmp) / "qa.jsonl")

            # Bot1 redirect for server commands
            redir = dispatcher_chat.dispatch_message_detailed("/vps", self.cfg, limiter)
            self.assertIn("POS_ServerNoti", redir["text"])

            # /quen clears memory cleanly
            mem.append_turn("-1001", "Hi", "Yo")
            clr = dispatcher_chat.dispatch_message_detailed("/quen", self.cfg, limiter, memory=mem, chat_id="-1001")
            self.assertEqual(clr["route"], "local")
            self.assertEqual(mem.get_history("-1001"), [])

            # /token probes Gemini & prints telemetry
            with mock.patch.object(dispatcher_chat, "probe_gemini_status", return_value={"configured": True, "key_valid": True, "models": []}):
                tok_res = dispatcher_chat.dispatch_message_detailed("/token", self.cfg, limiter, telemetry=tel)
                self.assertEqual(tok_res["route"], "command")

            # /tongquan slash command dispatches cleanly
            with mock.patch.dict(dispatcher_chat.COMMAND_HANDLERS, {"tongquan": lambda arg, cfg: "<b>TỔNG QUAN OK</b>"}):
                tq = dispatcher_chat.dispatch_message_detailed("/tongquan homnay", self.cfg, limiter, memory=mem, chat_id="-1001")
                self.assertIn("TỔNG QUAN OK", tq["text"])

            # Bare wake word responds warmly at 0 tokens
            wake = dispatcher_chat.dispatch_message_detailed("Lona ơi", self.cfg, limiter, memory=mem, chat_id="-1001")
            self.assertEqual(wake["route"], "local")

            # Toggle 1: master enabled=False disables conversational AI politely
            with mock.patch.object(dispatcher_chat, "resolve_ai_engine_toggles", return_value={"enabled": False, "local_enabled": False, "gemini_enabled": False, "synced_from_web": True}):
                off = dispatcher_chat.dispatch_message_detailed("Lona ơi doanh thu hôm nay?", self.cfg, limiter)
                self.assertEqual(off["route"], "guardrail_block")
                self.assertIn("tạm tắt", off["text"])

            # Toggle 2: local=True, gemini=False blocks Gemini fallback politely
            with mock.patch.object(dispatcher_chat, "resolve_ai_engine_toggles", return_value={"enabled": True, "local_enabled": True, "gemini_enabled": False, "synced_from_web": True}):
                no_gem = dispatcher_chat.dispatch_message_detailed("Lona ơi phân tích xu hướng kinh doanh tháng này giúp anh", self.cfg, limiter)
                self.assertEqual(no_gem["route"], "local")
                self.assertIn("AI Gemini", no_gem["text"])
                hoi_off = dispatcher_chat.dispatch_message_detailed("/hoi Tại sao vắng khách?", self.cfg, limiter)
                self.assertEqual(hoi_off["route"], "guardrail_block")

            # Toggle 3: local=False, gemini=True skips local engine cleanly and hits Gemini with miss tagging
            with (
                mock.patch.object(dispatcher_chat, "resolve_ai_engine_toggles", return_value={"enabled": True, "local_enabled": False, "gemini_enabled": True, "synced_from_web": True}),
                mock.patch.object(dispatcher_chat, "answer_with_gemini_detailed", return_value={"text": "Gemini Answer", "is_refusal": False, "model_used": "gemini-3.5-flash-lite", "usage": {"prompt_tokens": 10, "output_tokens": 5, "total_tokens": 15}}),
            ):
                gem_only = dispatcher_chat.dispatch_message_detailed("Lona ơi món nào bán chạy nhất?", self.cfg, limiter)
                self.assertEqual(gem_only["route"], "gemini")
                self.assertIn("Gemini Answer", gem_only["text"])

            # /hoi valid + /hoi empty + pre-guardrail block + mention + hybrid off-topic + fast_path dispatch
            self.assertTrue(dispatcher_chat.dispatch_message_detailed("/hoi", self.cfg, limiter)["is_refusal"])
            with mock.patch.object(dispatcher_chat, "answer_with_gemini_detailed", return_value={"text": "Phan tich OK", "is_refusal": False, "model_used": "gemini-3.5-flash-lite", "usage": {"prompt_tokens": 20, "output_tokens": 10, "total_tokens": 30}}):
                hoi_ok = dispatcher_chat.dispatch_message_detailed("/hoi Vì sao hôm nay giảm?", self.cfg, limiter, memory=mem, chat_id="-1001")
                self.assertEqual(hoi_ok["route"], "gemini")

            bad = dispatcher_chat.dispatch_message_detailed("Lona ơi viết code Python giải toán", self.cfg, limiter)
            self.assertEqual(bad["route"], "guardrail_block")

            with mock.patch("lona_bot.handlers.local_router.handle_doanhthu", return_value="<b>DOANH THU OK</b>"):
                hyb = dispatcher_chat.dispatch_message("@POS_Lona_bot doanh thu hôm nay và viết code Python", self.cfg, limiter, is_direct=True)
                self.assertIn("DOANH THU OK", hyb)
                self.assertIn("phạm vi", hyb)

    def test_dispatcher_helpers_and_entrypoint_exits(self) -> None:
        self.assertTrue(dispatcher.is_human_or_anonymous_admin_message({"from": {"id": 1, "is_bot": False}}, 999))
        self.assertTrue(dispatcher.is_human_or_anonymous_admin_message({"from": {"id": dispatcher.GROUP_ANONYMOUS_BOT_ID, "is_bot": True}}, 999))
        self.assertFalse(dispatcher.is_human_or_anonymous_admin_message({"from": {"id": 999, "is_bot": True}}, 999))
        self.assertTrue(dispatcher.is_direct_message_to_bot({"text": "hi @POS_Lona_bot"}, 999, "POS_Lona_bot"))
        self.assertEqual(dispatcher.extract_reply_context({"reply_to_message": {"text": "abc"}}), "abc")

        with mock.patch.object(dispatcher, "tg_api", return_value={"ok": True, "result": [{"update_id": 50}]}):
            self.assertEqual(dispatcher.drain_stale_updates("tok"), 51)
        with mock.patch.object(bot_commands, "tg_api", return_value={"ok": True}) as m_reg:
            bot_commands.register_biz_commands("tok")
            self.assertTrue(m_reg.called)

        with (
            mock.patch.object(dispatcher, "get_biz_config", return_value={**self.cfg, "bot_token": "tok", "chat_id": ""}),
            mock.patch.object(dispatcher, "register_biz_commands") as m_cmd,
        ):
            rc = dispatcher.main()
            self.assertEqual(rc, 0)
            m_cmd.assert_called_once_with("tok")

        with mock.patch.object(dispatcher, "get_biz_config", return_value={**self.cfg, "bot_token": ""}):
            self.assertEqual(dispatcher.main(), 0)

        # Exercise main() polling loop safely via controlled mock tg_api sequence
        class _StopPolling(BaseException):
            pass

        updates = {
            "ok": True,
            "result": [
                {"update_id": 100, "message": {"message_id": 1, "chat": {"id": 999}, "from": {"id": 1, "is_bot": False}, "text": "skip"}},
                {"update_id": 101, "message": {"message_id": 2, "chat": {"id": -1001}, "from": {"id": 99, "is_bot": True}, "text": "bot skip"}},
                {"update_id": 102, "message": {"message_id": 3, "chat": {"id": -1001}, "from": {"id": 10, "is_bot": False, "first_name": "Tuấn"}, "text": "Lona ơi"}},
            ],
        }
        tg_seq = [{"ok": True, "result": {"id": 99, "username": "POS_Lona_bot"}}, updates, _StopPolling()]

        def fake_tg(tok, method, payload=None, timeout=35):
            if method == "getUpdates" and payload and payload.get("timeout") == 0:
                return {"ok": True, "result": []}
            if method == "getUpdates":
                item = tg_seq.pop(0) if tg_seq else _StopPolling()
                if isinstance(item, BaseException):
                    raise item
                return item
            if method == "getMe":
                return tg_seq.pop(0)
            return {"ok": True}

        with (
            tempfile.TemporaryDirectory() as tmp,
            mock.patch.object(dispatcher, "get_biz_config", return_value={**self.cfg, "bot_token": "tok", "chat_id": "-1001", "memory_file": f"{tmp}/m.json", "token_stats_file": f"{tmp}/s.json", "qa_log_file": f"{tmp}/q.jsonl", "member_cache_file": f"{tmp}/d.json"}),
            mock.patch.object(dispatcher, "register_biz_commands"),
            mock.patch.object(dispatcher, "tg_api", side_effect=fake_tg),
            mock.patch.object(dispatcher, "send_tg_message") as m_send,
            mock.patch.object(dispatcher, "set_message_reaction"),
            mock.patch.object(dispatcher, "send_chat_action"),
        ):
            with self.assertRaises(_StopPolling):
                dispatcher.main()
            self.assertTrue(m_send.called)

    def test_alert_probe_daily_report_and_compat_facades(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            state_path = Path(tmp) / "alerts.json"
            self.assertEqual(alert_probe.load_state(state_path)["qr_levels"], {})
            overview = {
                "_project_name": "Ăn Vặt Tran",
                "paymentQrAccounts": [{"id": 1, "label": "MB", "bankCode": "MB", "accountNo": "1234", "isActive": True, "status": "NEAR_LIMIT", "dailyLimit": 1000000, "usedDay": 850000}],
                "alerts": {"pendingPaymentEdits": [{"orderId": 10, "orderCode": "ORD-1", "tableLabel": "Bàn 1", "totalAmount": 100000, "currentMethod": "CASH", "requestedMethod": "TRANSFER", "requestedAt": "t1"}]},
            }
            void_rows = [{"id": 7, "order_code": "ORD-7", "est_amount": 200000, "void_reason": "Sai món", "actor_name": "Lan"}]
            msgs, next_st = alert_probe.collect_business_alerts(overview, void_rows, {}, "2026-11-28", 150000)
            self.assertEqual(len(msgs), 3)
            # Re-running with same state deduplicates cleanly
            msgs2, _ = alert_probe.collect_business_alerts(overview, void_rows, next_st, "2026-11-28", 150000)
            self.assertEqual(msgs2, [])
            alert_probe.save_state(state_path, next_st)
            self.assertEqual(alert_probe.load_state(state_path)["voided_ids"], ["7"])

            # Alert probe main() CLI --stdout --dry-run on fresh state
            fresh_state = Path(tmp) / "fresh_alerts.json"
            with (
                mock.patch.object(alert_probe, "get_biz_config", return_value={**self.cfg, "alert_state_file": str(fresh_state), "high_void_threshold": "150000"}),
                mock.patch.object(alert_probe, "call_internal_biz", return_value=overview),
                mock.patch.object(alert_probe, "run_readonly_sql_json", return_value=void_rows),
                mock.patch.object(sys, "argv", ["biz-alert-probe.py", "--stdout", "--dry-run"]),
            ):
                buf_a = io.StringIO()
                with redirect_stdout(buf_a):
                    self.assertEqual(alert_probe.main(), 0)
                self.assertIn("ORD-7", buf_a.getvalue())

        daily_mod = _load_script_module("daily_biz_report_test", "daily-biz-report.py") if False else _load_script_module("daily-biz-report.py", "daily_biz_report_mod")
        with (
            mock.patch.object(daily_mod, "get_biz_config", return_value=self.cfg),
            mock.patch.object(daily_mod, "build_daily_close_report", return_value="DAILY_OK"),
            mock.patch.object(sys, "argv", ["daily-biz-report.py", "--mode", "daily", "--stdout"]),
        ):
            buf = io.StringIO()
            with redirect_stdout(buf):
                self.assertEqual(daily_mod.main(), 0)
            self.assertIn("DAILY_OK", buf.getvalue())

        # Verify backwards-compatible facade imports cleanly
        import biz_bot_ai
        import biz_bot_common
        import biz_bot_guardrail
        import biz_bot_kb
        import biz_bot_local
        import biz_bot_nlp
        import biz_bot_queries
        import biz_bot_state

        self.assertTrue(callable(biz_bot_common.parse_period_spec))
        self.assertTrue(callable(biz_bot_nlp.match_semantic_intent))
        self.assertTrue(callable(biz_bot_guardrail.check_pre_guardrail))
        self.assertTrue(callable(biz_bot_kb.search_system_docs))
        self.assertTrue(callable(biz_bot_local.try_answer_locally))
        self.assertTrue(callable(biz_bot_queries.handle_tongquan))
        self.assertTrue(callable(biz_bot_ai.answer_with_gemini_detailed))
        self.assertTrue(hasattr(biz_bot_state, "TelemetryStore"))
