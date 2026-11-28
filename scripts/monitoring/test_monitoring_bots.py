#!/usr/bin/env python3
"""Comprehensive unit tests for Bot #1 cleanup and Bot #2 (@POS_Lona_bot) modules."""

from __future__ import annotations

import datetime as dt
import importlib.util
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

MONITOR_DIR = Path(__file__).resolve().parent
if str(MONITOR_DIR) not in sys.path:
    sys.path.insert(0, str(MONITOR_DIR))

import biz_bot_ai  # noqa: E402
import biz_bot_common  # noqa: E402
import biz_bot_nlp  # noqa: E402
import biz_bot_queries  # noqa: E402

# Load hyphenated filenames dynamically
def load_mod(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, str(MONITOR_DIR / filename))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


bot1_mod = load_mod("telegram_command_bot", "telegram-command-bot.py")
bot2_mod = load_mod("telegram_biz_bot", "telegram-biz-bot.py")
alert_probe_mod = load_mod("biz_alert_probe", "biz-alert-probe.py")


class TestPeriodAndSqlSecurity(unittest.TestCase):
    def test_period_parser_all_formats(self) -> None:
        today = dt.date(2026, 11, 28)
        self.assertEqual(biz_bot_common.parse_period_spec("", today)["fromDate"], "2026-11-28")
        self.assertEqual(biz_bot_common.parse_period_spec("homqua", today)["fromDate"], "2026-11-27")
        self.assertEqual(biz_bot_common.parse_period_spec("hom kia", today)["fromDate"], "2026-11-26")

        tuan = biz_bot_common.parse_period_spec("tuan", today)
        self.assertEqual((tuan["fromDate"], tuan["toDate"]), ("2026-11-23", "2026-11-28"))

        tuan_truoc = biz_bot_common.parse_period_spec("tuantruoc", today)
        self.assertEqual((tuan_truoc["fromDate"], tuan_truoc["toDate"]), ("2026-11-16", "2026-11-22"))

        thang = biz_bot_common.parse_period_spec("thang", today)
        self.assertEqual((thang["fromDate"], thang["toDate"]), ("2026-11-01", "2026-11-28"))

        thang_truoc = biz_bot_common.parse_period_spec("thangtruoc", today)
        self.assertEqual((thang_truoc["fromDate"], thang_truoc["toDate"]), ("2026-10-01", "2026-10-31"))

        single = biz_bot_common.parse_period_spec("25/11", today)
        self.assertEqual((single["fromDate"], single["toDate"]), ("2026-11-25", "2026-11-25"))

        rng = biz_bot_common.parse_period_spec("20/11-25/11", today)
        self.assertEqual((rng["fromDate"], rng["toDate"]), ("2026-11-20", "2026-11-25"))

    def test_sql_validator_blocks_mutations_and_sensitive_columns(self) -> None:
        allowed_queries = [
            "SELECT count(*) FROM orders WHERE status = 'PAID'",
            "WITH x AS (SELECT id FROM products) SELECT * FROM x LIMIT 10;",
            "SELECT label, account_no_masked FROM v_bot_payment_accounts WHERE is_active = true",
            "SELECT * FROM orders WHERE note = 'UPDATE price later'",
        ]
        for sql in allowed_queries:
            ok, _ = biz_bot_common.validate_readonly_sql(sql)
            self.assertTrue(ok, f"Expected allowed: {sql}")

        blocked_queries = [
            "DELETE FROM orders",
            "UPDATE products SET price = 0",
            "INSERT INTO users VALUES (1)",
            "SELECT 1; DROP TABLE orders",
            "SELECT * FROM users -- bypass",
            "SELECT password_hash FROM users",
            "SELECT citizen_id, bank_account_no FROM employees",
            "SELECT qr_token FROM dining_tables",
            "SELECT account_no FROM payment_accounts",
            "SELECT * FROM push_subscriptions",
            "SELECT pg_read_file('/etc/passwd')",
        ]
        for sql in blocked_queries:
            ok, reason = biz_bot_common.validate_readonly_sql(sql)
            self.assertFalse(ok, f"Expected blocked: {sql} (got ok)")
            self.assertTrue(reason)

    def test_html_sanitization(self) -> None:
        raw = "<b>Doanh thu</b>: <script>alert(1)</script> > 1.000.000đ <code>HD-1</code>"
        safe = biz_bot_common.sanitize_telegram_html(raw)
        self.assertIn("<b>Doanh thu</b>", safe)
        self.assertIn("&lt;script&gt;", safe)
        self.assertIn("&gt; 1.000.000đ", safe)
        self.assertIn("<code>HD-1</code>", safe)

    def test_run_readonly_sql_json_parses_multiline_pg_json_agg(self) -> None:
        multiline_stdout = '[{"id":1}, \n {"id":2}]\n'
        fake_proc = mock.Mock(returncode=0, stdout=multiline_stdout, stderr="")
        with mock.patch.object(biz_bot_common.subprocess, "run", return_value=fake_proc):
            rows = biz_bot_common.run_readonly_sql_json("SELECT id FROM orders", cfg={"project_dir": "/tmp", "ro_db_user": "fnb_bot_ro"})
        self.assertEqual(rows, [{"id": 1}, {"id": 2}])


class TestVietnameseNlpAndGroupFilter(unittest.TestCase):
    def test_group_chatter_ignored_and_questions_routed(self) -> None:
        for chatter in (
            "ok",
            "cảm ơn sếp",
            "cảm ơn bạn nhé",
            "haha",
            "chút nữa mình qua quán",
            "Huy ơi đi ăn cơm",
            "hẹn bạn tối mai nhé",
            "hôm nay hơi bận",
            "oke ạ",
            "👍",
        ):
            self.assertFalse(biz_bot_nlp.looks_like_shop_question(chatter, is_direct=False), f"False positive chatter: {chatter}")

        for q in (
            "Hôm nay có bao nhiêu đơn?",
            "hom nay doanh thu bao nhieu",
            "doanh thu hôm nay",
            "két tiền",
            "két tiền hiện tại còn bao nhiêu?",
            "Món nào bán chạy nhất tuần này?",
            "Bàn nào đang có khách?",
            "So sánh doanh thu cuối tuần này với tuần trước",
            "Kiểm tra đơn HD-20261128-0005",
            "Bạn có truy cập vào DB được không",
        ):
            self.assertTrue(biz_bot_nlp.looks_like_shop_question(q, is_direct=False), f"Should answer: {q}")

        self.assertIsNone(biz_bot_nlp.classify_fast_path("Bạn có truy cập vào DB được không"))

        # Direct mention with any meaningful question must always pass through
        self.assertTrue(biz_bot_nlp.looks_like_shop_question("@POS_Lona_bot thời tiết Hà Nội sao?", is_direct=True))

    def test_fast_path_vs_gemini_routing(self) -> None:
        self.assertEqual(biz_bot_nlp.classify_fast_path("Hôm nay có bao nhiêu đơn?"), ("don", "homnay"))
        self.assertEqual(biz_bot_nlp.classify_fast_path("Doanh thu hôm qua sao rồi"), ("doanhthu", "homqua"))
        self.assertEqual(biz_bot_nlp.classify_fast_path("Két tiền hôm nay còn bao nhiêu?"), ("ket", "homnay"))
        self.assertEqual(biz_bot_nlp.classify_fast_path("Top món tuần này"), ("topmon", "tuan"))
        self.assertEqual(biz_bot_nlp.classify_fast_path("Xem đơn HD-20261128-0005"), ("don", "HD-20261128-0005"))

        # Complex / analytical / item-specific -> falls through to Gemini AI (None)
        for complex_q in (
            "Khung giờ nào bán chạy nhất tuần này?",
            "So sánh doanh thu tuần này với tuần trước",
            "Hôm nay bán được bao nhiêu ly trà sữa?",
            "Khách ăn mì cay cấp độ mấy nhiều nhất?",
            "Thu ngân nào hủy nhiều đơn nhất tháng này?",
        ):
            self.assertIsNone(biz_bot_nlp.classify_fast_path(complex_q), f"Expected AI fallback for: {complex_q}")


class TestBotSeparationAndHandlers(unittest.TestCase):
    def test_bot1_help_excludes_pos(self) -> None:
        help_txt = bot1_mod.handle_help()
        self.assertNotIn("• /pos", help_txt)
        self.assertIn("@POS_Lona_bot", help_txt)
        self.assertIn("DANH SÁCH LỆNH HẠ TẦNG", help_txt)

    def test_bot2_command_dispatch_and_bot1_redirect(self) -> None:
        cfg = {
            "bot_token": "tok",
            "chat_id": "-1001",
            "gemini_api_key": "k",
            "gemini_model": "gemini-3.5-flash-lite",
            "gemini_fallback_model": "gemini-flash-lite-latest",
            "project_name": "Ăn Vặt Tran",
            "project_dir": "/tmp",
            "domain": "pos.anvattran.com",
            "ro_db_user": "fnb_bot_ro",
            "high_void_threshold": "150000",
            "alert_state_file": "/tmp/state.json",
        }
        limiter = biz_bot_ai.AiRateLimiter()

        # Bot #1 command sent by mistake in Bot #2 group -> helpful redirect
        redir = bot2_mod.dispatch_message("/vps", cfg, limiter)
        self.assertIn("POS_ServerNoti", redir or "")

        # Help works without DB/API
        help_txt = bot2_mod.dispatch_message("/help", cfg, limiter)
        self.assertIn("/tongquan", help_txt or "")
        self.assertIn("/loinhuan", help_txt or "")

        # Casual chatter ignored even inside dispatch_message (typing_cb must NOT fire)
        chatter_cb = mock.Mock()
        self.assertIsNone(bot2_mod.dispatch_message("cảm ơn bạn nhé", cfg, limiter, is_direct=False, typing_cb=chatter_cb))
        chatter_cb.assert_not_called()

        # Valid command fires typing_cb once (used to attach 👀 reaction & typing)
        cmd_cb = mock.Mock()
        help_res = bot2_mod.dispatch_message("/help", cfg, limiter, is_direct=False, typing_cb=cmd_cb)
        self.assertIn("/tongquan", help_res or "")
        cmd_cb.assert_called_once()

        # set_message_reaction gracefully ignores non-fatal errors and validates payload
        with mock.patch.object(biz_bot_common, "tg_api", side_effect=RuntimeError("network")) as m_tg:
            biz_bot_common.set_message_reaction("tok", "-1001", 42, "👀")
            m_tg.assert_called_once()

    def test_anonymous_group_admin_allowed_while_bots_blocked(self) -> None:
        self.assertTrue(bot2_mod.is_human_or_anonymous_admin_message({"from": {"id": 123, "is_bot": False}}, 8695527449))
        self.assertTrue(
            bot2_mod.is_human_or_anonymous_admin_message(
                {
                    "from": {"id": 1087968824, "is_bot": True, "username": "GroupAnonymousBot"},
                    "chat": {"id": -1005994635066},
                    "sender_chat": {"id": -1005994635066},
                },
                8695527449,
            )
        )
        self.assertFalse(
            bot2_mod.is_human_or_anonymous_admin_message(
                {"from": {"id": 8695527449, "is_bot": True}, "chat": {"id": -1005994635066}},
                8695527449,
            )
        )
        self.assertFalse(
            bot2_mod.is_human_or_anonymous_admin_message(
                {"from": {"id": 999999, "is_bot": True}, "chat": {"id": -1005994635066}},
                8695527449,
            )
        )

    def test_bot2_main_registers_commands_before_exiting_when_chat_id_missing(self) -> None:
        cfg_no_chat = {
            "bot_token": "tok123",
            "chat_id": "",
            "gemini_api_key": "",
            "gemini_model": "gemini-3.5-flash-lite",
            "gemini_fallback_model": "gemini-flash-lite-latest",
            "project_name": "Ăn Vặt Tran",
            "project_dir": "/tmp",
            "domain": "pos.anvattran.com",
            "ro_db_user": "fnb_bot_ro",
            "high_void_threshold": "150000",
            "alert_state_file": "/tmp/s.json",
        }
        with (
            mock.patch.object(bot2_mod, "get_biz_config", return_value=cfg_no_chat),
            mock.patch.object(bot2_mod, "register_biz_commands") as m_reg,
        ):
            rc = bot2_mod.main()
        self.assertEqual(rc, 0)
        m_reg.assert_called_once_with("tok123")

    def test_daily_and_tongquan_formatters(self) -> None:
        sample_overview = {
            "kpis": {
                "revenue": {
                    "netPaidAmount": 4200000,
                    "subtotalAmount": 4300000,
                    "discountAmount": 100000,
                    "paidOrderCount": 28,
                    "dineInCount": 20,
                    "takeawayCount": 8,
                    "qrSourceCount": 11,
                    "posSourceCount": 17,
                    "averageOrderValue": 150000,
                    "growthPercent": 12.5,
                },
                "cashDrawer": {
                    "openingBudget": 500000,
                    "totalCashSales": 2100000,
                    "cashOnlySales": 1900000,
                    "splitCashSales": 200000,
                    "totalCashImports": 350000,
                    "expectedCashInDrawer": 2250000,
                    "estimatedHandOver": 1750000,
                },
                "transfer": {"totalTransferSales": 2100000},
                "inventory": {"totalImportCost": 850000, "cashDrawerImportCost": 350000, "externalImportCost": 500000, "importCount": 3, "costToRevenuePercent": 20.2},
                "openOrders": {"occupiedTableCount": 2, "pendingTableCount": 0, "takeawayOpenCount": 1, "totalPhysicalTables": 30, "totalOpenAmount": 280000},
                "profit": {"grossProfitAfterInventory": 3350000, "estimatedLaborCost": 600000, "netOperatingProfit": 2750000, "marginPercent": 65.5},
            },
            "topProducts": {"items": [{"name": "Mì cay bò Mỹ", "qty": 18, "revenue": 1062000}], "topModifiers": []},
            "discountsAndRisk": {"voidedOrderCount": 1, "cancelledPrintedItemCount": 2},
            "alerts": {"pendingQrTables": [], "pendingPaymentEdits": [], "nearLimitQrAccounts": []},
            "revenueSeries": {
                "granularity": "day",
                "buckets": [
                    {"label": "27/11", "totalSales": 1800000, "orderCount": 12},
                    {"label": "28/11", "totalSales": 4200000, "orderCount": 28},
                ],
            },
        }
        with mock.patch.object(biz_bot_queries, "call_internal_biz") as m_api:
            m_api.side_effect = [
                sample_overview,
                {"items": [{"status": "MATCHED", "actualCountedCash": 2250000, "discrepancyAmount": 0}]},
            ]
            txt = biz_bot_queries.build_daily_close_report("2026-11-28", cfg={"project_name": "Ăn Vặt Tran"})
        self.assertIn("[Ăn Vặt Tran] CHỐT SỔ CUỐI NGÀY", txt)
        self.assertIn("4.200.000đ", txt)
        self.assertIn("Mì cay bò Mỹ", txt)
        self.assertIn("Khớp quỹ", txt)

    def test_business_alert_probe_dedup_and_reset(self) -> None:
        overview = {
            "_project_name": "Ăn Vặt Tran",
            "paymentQrAccounts": [
                {"id": 1, "label": "MBBank", "bankCode": "MB", "accountNo": "****1012", "isActive": True, "usedDay": 8500000, "dailyLimit": 10000000, "status": "ACTIVE"},
            ],
            "alerts": {
                "pendingPaymentEdits": [
                    {"orderId": 44, "orderCode": "HD-44", "tableLabel": "Bàn 03", "totalAmount": 210000, "currentMethod": "CASH", "requestedMethod": "TRANSFER", "requestedByName": "Lan", "requestedAt": "2026-11-28T05:00:00Z"},
                ],
            },
        }
        voids = [
            {"id": 99, "order_code": "HD-99", "est_amount": 220000, "void_reason": "Khách đổi ý", "actor_name": "Tuấn"},
            {"id": 100, "order_code": "HD-100", "est_amount": 45000, "void_reason": "Nhỏ hơn ngưỡng", "actor_name": "Tuấn"},
        ]

        msgs1, st1 = alert_probe_mod.collect_business_alerts(overview, voids, {"date": ""}, "2026-11-28", 150000)
        self.assertEqual(len(msgs1), 3)
        self.assertIn("SẮP CHẠM HẠN MỨC", msgs1[0])
        self.assertIn("YÊU CẦU DUYỆT SỬA THANH TOÁN", msgs1[1])
        self.assertIn("CẢNH BÁO HỦY ĐƠN GIÁ TRỊ CAO", msgs1[2])

        # Second poll with same state must emit ZERO duplicate alerts
        msgs2, _ = alert_probe_mod.collect_business_alerts(overview, voids, st1, "2026-11-28", 150000)
        self.assertEqual(msgs2, [])

        # Escalation to DAY_FULL triggers new alert once
        overview_full = json.loads(json.dumps(overview))
        overview_full["paymentQrAccounts"][0]["status"] = "DAY_FULL"
        overview_full["paymentQrAccounts"][0]["usedDay"] = 10000000
        msgs3, _ = alert_probe_mod.collect_business_alerts(overview_full, voids, st1, "2026-11-28", 150000)
        self.assertEqual(len(msgs3), 1)
        self.assertIn("ĐÃ ĐẦY HẠN MỨC", msgs3[0])

    def test_gemini_tool_calling_loop(self) -> None:
        cfg = {
            "bot_token": "t",
            "chat_id": "-1",
            "gemini_api_key": "fake-key",
            "gemini_model": "gemini-3.5-flash-lite",
            "gemini_fallback_model": "gemini-flash-lite-latest",
            "project_name": "Ăn Vặt Tran",
            "project_dir": "/tmp",
            "domain": "pos.anvattran.com",
            "ro_db_user": "fnb_bot_ro",
            "high_void_threshold": "150000",
            "alert_state_file": "/tmp/s.json",
        }
        round1 = {
            "candidates": [{"content": {"parts": [{"functionCall": {"name": "run_readonly_sql", "args": {"sql": "SELECT count(*) AS cnt FROM orders"}}}]}}]
        }
        round2 = {
            "candidates": [{"content": {"parts": [{"text": "<b>Kết quả:</b> Hôm nay có <b>12 đơn</b>."}]}}]
        }
        with (
            mock.patch.object(biz_bot_ai, "_call_gemini", side_effect=[round1, round2]),
            mock.patch.object(biz_bot_ai, "run_readonly_sql_json", return_value=[{"cnt": 12}]),
        ):
            ans = biz_bot_ai.answer_with_gemini("Hôm nay bao nhiêu đơn?", cfg=cfg)
        self.assertEqual(ans, "<b>Kết quả:</b> Hôm nay có <b>12 đơn</b>.")


if __name__ == "__main__":
    unittest.main()
