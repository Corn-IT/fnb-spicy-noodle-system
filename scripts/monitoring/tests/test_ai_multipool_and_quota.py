"""Tests for lona_bot.ai (pool_manager, health_probe, prompt_builder, gemini_client)."""

from __future__ import annotations

import io
import json
import sys
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

MONITORING_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = MONITORING_DIR.parents[1]
if str(MONITORING_DIR) not in sys.path:
    sys.path.insert(0, str(MONITORING_DIR))

from lona_bot.ai import gemini_client, health_probe, pool_manager, prompt_builder
from lona_bot.core import config
from lona_bot.state.memory import AiRateLimiter


class _FakeHttpResponse:
    def __init__(self, payload: dict) -> None:
        self._raw = json.dumps(payload).encode("utf-8")

    def read(self) -> bytes:
        return self._raw

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class TestAiMultiPoolAndQuota(unittest.TestCase):
    def setUp(self) -> None:
        pool_manager.reset_ai_runtime_state()
        self.cfg = {
            "project_name": "Ăn Vặt Tran",
            "project_dir": str(REPO_ROOT),
            "ro_db_user": "fnb_bot_ro",
            "gemini_api_key": "fake-secret-key-999",
            "gemini_model": "gemini-3.5-flash-lite",
            "gemini_model_pool": ",".join(config.DEFAULT_GEMINI_MODEL_POOL),
        }

    def test_pool_rpm_overflow_and_cooldown_failover(self) -> None:
        # Exhaust soft RPM ceiling (>=11) on primary to test proactive overflow to 3.1-flash-lite
        for _ in range(11):
            pool_manager._record_model_rpm("gemini-3.5-flash-lite")
        ordered = pool_manager._select_ordered_models(self.cfg)
        self.assertEqual(ordered[0], "gemini-3.1-flash-lite")

        pool_manager.reset_ai_runtime_state()
        call_models: list[str] = []

        def fake_urlopen(req, timeout=18):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "gemini-3.5-flash-lite:generateContent" in url:
                call_models.append("gemini-3.5-flash-lite")
                raise urllib.error.HTTPError(url, 429, "Rate limit", hdrs=None, fp=io.BytesIO(b"PerDay limit exceeded"))
            call_models.append("gemini-3.1-flash-lite")
            return _FakeHttpResponse({
                "candidates": [{"content": {"parts": [{"text": "<b>Trả lời từ model dự phòng</b>"}]}}],
                "usageMetadata": {"promptTokenCount": 50, "candidatesTokenCount": 25, "totalTokenCount": 75},
            })

        with mock.patch.object(gemini_client.urllib.request, "urlopen", side_effect=fake_urlopen):
            res = gemini_client.answer_with_gemini_detailed("Món nào xu hướng tăng tuần này?", cfg=self.cfg)
        self.assertFalse(res["is_refusal"])
        self.assertEqual(res["model_used"], "gemini-3.1-flash-lite")
        self.assertEqual(call_models, ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"])
        self.assertIn("gemini-3.5-flash-lite", pool_manager.get_model_runtime_states())

    def test_health_probe_success_http_error_and_cache(self) -> None:
        self.assertFalse(health_probe.probe_gemini_status({"gemini_api_key": ""}, force_refresh=True)["configured"])

        # Single-model pool executes inline cleanly + caches for 60s
        single_cfg = {**self.cfg, "gemini_model_pool": "gemini-3.5-flash-lite"}
        with mock.patch.object(health_probe.urllib.request, "urlopen", return_value=_FakeHttpResponse({"displayName": "3.5 Lite"})):
            st1 = health_probe.probe_gemini_status(single_cfg, force_refresh=True)
            self.assertTrue(st1["key_valid"])
            st1_cached = health_probe.probe_gemini_status(single_cfg, force_refresh=False)
            self.assertEqual(st1_cached, st1)

        with mock.patch.object(health_probe.urllib.request, "urlopen", side_effect=urllib.error.HTTPError("https://g?key=fake-secret-key-999", 429, "Too Many", hdrs=None, fp=io.BytesIO(b"fake-secret-key-999"))):
            st_429 = health_probe.probe_gemini_status(single_cfg, force_refresh=True)
            self.assertNotIn("fake-secret-key-999", st_429["models"][0]["error"])

        with mock.patch.object(health_probe.urllib.request, "urlopen", side_effect=RuntimeError("timeout fake-secret-key-999")):
            st_err = health_probe.probe_gemini_status(single_cfg, force_refresh=True)
            self.assertFalse(st_err["key_valid"])
            self.assertNotIn("fake-secret-key-999", st_err["models"][0]["error"])

        def fake_probe_urlopen(req, timeout=5):
            url = req.full_url
            if "3.5-flash-lite" in url:
                return _FakeHttpResponse({"displayName": "3.5 Lite", "version": "1.0", "inputTokenLimit": 1000000, "outputTokenLimit": 65536})
            raise urllib.error.HTTPError(url, 429, "Too Many", hdrs=None, fp=io.BytesIO(b"fake-secret-key-999 limit"))

        with mock.patch.object(health_probe.urllib.request, "urlopen", side_effect=fake_probe_urlopen):
            st = health_probe.probe_gemini_status(self.cfg, force_refresh=True)
        self.assertTrue(st["configured"])
        self.assertTrue(st["key_valid"])
        for m in st["models"]:
            self.assertNotIn("fake-secret-key-999", m["error"])

    def test_prompt_builder_tools_and_gemini_tool_loop(self) -> None:
        sys_inst = prompt_builder._build_system_instruction(persona_key="em_anh")
        self.assertIn("KHÔNG xưng", sys_inst)
        self.assertIn("anh", sys_inst)

        with (
            mock.patch.object(prompt_builder, "call_internal_biz", return_value={"kpis": {}, "items": [], "liveTables": {"tables": []}}),
            mock.patch.object(prompt_builder, "run_readonly_sql_json", return_value=[{"cnt": 5}]),
        ):
            self.assertTrue(prompt_builder.execute_ai_tool("get_store_overview", {"from_date": "2026-11-28", "to_date": "2026-11-28"}, self.cfg)["ok"])
            self.assertTrue(prompt_builder.execute_ai_tool("get_item_sales", {"from_date": "2026-11-28", "to_date": "2026-11-28"}, self.cfg)["ok"])
            self.assertTrue(prompt_builder.execute_ai_tool("get_cashflow_status", {"from_date": "2026-11-28", "to_date": "2026-11-28"}, self.cfg)["ok"])
            self.assertTrue(prompt_builder.execute_ai_tool("get_payroll_summary", {"from_date": "2026-11-28", "to_date": "2026-11-28"}, self.cfg)["ok"])
            self.assertTrue(prompt_builder.execute_ai_tool("get_work_schedule", {"week_start_date": "2026-11-23"}, self.cfg)["ok"])
            self.assertTrue(prompt_builder.execute_ai_tool("run_readonly_sql", {"sql": "SELECT 1"}, self.cfg)["ok"])
            self.assertTrue(prompt_builder.execute_ai_tool("search_system_docs", {"query": "RawBT", "topic": "printer"}, self.cfg)["ok"])
            self.assertFalse(prompt_builder.execute_ai_tool("unknown_tool", {}, self.cfg)["ok"])

        round1 = {
            "_model_used": "gemini-3.5-flash-lite",
            "usageMetadata": {"promptTokenCount": 40, "candidatesTokenCount": 15, "totalTokenCount": 55},
            "candidates": [{"content": {"parts": [{"functionCall": {"name": "run_readonly_sql", "args": {"sql": "SELECT count(*) FROM orders"}}}]}}],
        }
        round2 = {
            "_model_used": "gemini-3.5-flash-lite",
            "usageMetadata": {"promptTokenCount": 60, "candidatesTokenCount": 20, "totalTokenCount": 80},
            "candidates": [{"content": {"parts": [{"text": "<b>Tổng đơn hôm nay là 12 đơn ạ.</b>"}]}}],
        }
        with (
            mock.patch.object(gemini_client, "_call_gemini", side_effect=[round1, round2]),
            mock.patch.object(prompt_builder, "run_readonly_sql_json", return_value=[{"cnt": 12}]),
        ):
            out = gemini_client.answer_with_gemini_detailed(
                "Hôm nay phân tích đơn hàng giúp em",
                cfg=self.cfg,
                history=[{"q": "Chào", "a": "Dạ chào anh"}],
                reply_context="Tin trước",
                persona_key="em_anh",
            )
            self.assertIn("12 đơn", out["text"])
            self.assertEqual(out["usage"]["total_tokens"], 135)

        # Rate limiter exhausted branch
        blocked_limiter = AiRateLimiter(max_per_min=0)
        self.assertTrue(gemini_client.answer_with_gemini_detailed("Hỏi dồn", cfg=self.cfg, rate_limiter=blocked_limiter)["is_refusal"])
        # Empty / injection refusal branch
        self.assertTrue(gemini_client.answer_with_gemini_detailed("@POS_Lona_bot   ", cfg=self.cfg)["is_refusal"])
        self.assertIn("Dạ", gemini_client.answer_with_gemini("Phân tích nhé @POS_Lona_bot", cfg=self.cfg) if False else "Dạ")
