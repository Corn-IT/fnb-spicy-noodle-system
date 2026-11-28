"""Tests for lona_bot.nlu (semantic_engine, semantic_spec, invocation, system_kb)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

MONITORING_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = MONITORING_DIR.parents[1]
if str(MONITORING_DIR) not in sys.path:
    sys.path.insert(0, str(MONITORING_DIR))

from lona_bot.nlu import invocation, semantic_engine, semantic_spec, system_kb


class TestNluAndSemanticMatrix(unittest.TestCase):
    def test_shared_semantic_spec_loaded_from_packages_shared(self) -> None:
        path = semantic_spec.resolve_semantic_spec_path()
        self.assertIsNotNone(path)
        spec = semantic_spec.load_semantic_spec()
        self.assertEqual(spec["version"], 1)
        self.assertIn("product", spec["entities"])
        self.assertIn("popularity_high", spec["metrics"])

    def test_synonymous_product_superlatives_match_same_intent(self) -> None:
        synonyms = [
            "Món ăn bán chạy nhất là món nào",
            "Món ăn được gọi nhiều nhất là món nào",
            "Hôm qua khách order món nào nhiều nhất?",
            "Best seller của quán tuần này là gì?",
            "Món nước nào khách đặt nhiều nhất 7 ngày qua?",
            "Mon an duoc goi nhieu nhat la mon nao",
            "Đồ ăn nào hút khách nhất vậy em ơi?",
        ]
        for q in synonyms:
            m = semantic_engine.match_semantic_intent(q)
            self.assertTrue(m["matched"], q)
            self.assertEqual(m["intent_id"], "product_top_popularity", q)
            self.assertEqual(m["sort_by"], "quantity", q)

    def test_full_semantic_grammar_matrix_and_guards(self) -> None:
        cases = [
            ("Liệt kê top 5 món được gọi nhiều nhất tuần này", "product_list_popularity", "tuan"),
            ("Món nào mang lại doanh thu cao nhất tháng này?", "product_top_revenue", "thang"),
            ("Top 3 món doanh thu cao nhất hôm qua", "product_list_revenue", "homqua"),
            ("Món nào bán chậm nhất 30 ngày qua?", "product_slow_popularity", "30ngay"),
            ("Khung giờ nào quán đông khách nhất hôm qua?", "hour_peak_density", "homqua"),
            ("Khung giờ nào vắng khách nhất hôm nay?", "hour_quiet_density", "homnay"),
            ("Ai hủy đơn nhiều nhất tháng này?", "staff_top_void", "thang"),
            ("Thu ngân nào bán nhiều đơn nhất hôm nay?", "staff_top_orders", "homnay"),
            ("Đơn nào giá trị cao nhất hôm nay?", "order_top_value", "homnay"),
            ("Hôm nay có bao nhiêu đơn mang về?", "order_count", "homnay"),
            ("Đơn mang về gần nhất?", "recent_orders", "homnay"),
            ("Một đơn mang về gần nhất?", "recent_orders", "homnay"),
            ("Chi tiết đơn HD-20261128-0122", "order_detail", "homnay"),
            ("Thực đơn quán có bao nhiêu món?", "menu_catalog", "homnay"),
            ("Doanh thu tiền mặt hôm nay bao nhiêu?", "payment_breakdown", "homnay"),
            ("Quán có bao nhiêu nhân viên?", "staff_list", "homnay"),
            ("Ai đang đăng nhập POS?", "active_sessions", "homnay"),
            ("Tại sao chuyển khoản không cộng vào két tiền?", "system_docs", "homnay"),
            ("So sánh doanh thu hôm nay với hôm qua", "period_comparison", "homnay"),
            ("Hiện tại có bao nhiêu bàn đang phục vụ?", "table_live_status", "homnay"),
            ("Quỹ lương tháng này hết bao nhiêu?", "fast_path_payroll", "thang"),
        ]
        for q, expected_intent, expected_period in cases:
            res = semantic_engine.match_semantic_intent(q)
            self.assertTrue(res["matched"], q)
            self.assertEqual(res["intent_id"], expected_intent, q)
            self.assertEqual(res["period"], expected_period, q)

        # Negative guards yield to Gemini rather than firing false 0-token superlatives
        why = semantic_engine.match_semantic_intent("Tại sao hôm qua trà chanh bán chậm?")
        self.assertFalse(why["matched"])
        self.assertTrue(why["guard_blocked"])
        self.assertEqual(why["guard_id"], "why_reason")

        # Homograph disambiguation
        sell = semantic_engine.match_semantic_intent("Món nào bán được nhiều nhất?")
        self.assertNotIn("table", sell["entities"])
        self.assertEqual(sell["intent_id"], "product_top_popularity")

    def test_invocation_and_fast_path_detection(self) -> None:
        self.assertFalse(invocation.detect_bot_invocation("Chào buổi sáng mọi người")[0])
        inv, mode, clean = invocation.detect_bot_invocation("Lona ơi doanh thu hôm qua thế nào?")
        self.assertTrue(inv)
        self.assertEqual(mode, "wake_word")
        self.assertIn("doanh thu", clean)

        inv_r, mode_r, _ = invocation.detect_bot_invocation(
            "Chi tiết giúp anh",
            msg={"reply_to_message": {"from": {"id": 999, "username": "POS_Lona_bot"}, "text": "..."}},
            bot_id=999,
            bot_username="POS_Lona_bot",
        )
        self.assertTrue(inv_r)
        self.assertEqual(mode_r, "reply")

        self.assertEqual(invocation.classify_fast_path("Hôm nay có bao nhiêu đơn?"), ("don", "homnay"))
        self.assertEqual(invocation.classify_fast_path("Doanh thu hôm qua sao rồi?"), ("doanhthu", "homqua"))
        self.assertEqual(invocation.classify_fast_path("Két tiền hôm nay?"), ("ket", "homnay"))
        self.assertEqual(invocation.classify_fast_path("Xem đơn HD-20261128-0005"), ("don", "HD-20261128-0005"))
        self.assertIsNone(invocation.classify_fast_path("Tại sao hôm nay doanh thu thấp hơn hôm qua?"))
        self.assertTrue(invocation.is_system_doc_question("Hướng dẫn cấu hình máy in RawBT 80mm"))
        self.assertTrue(invocation.looks_like_shop_question("doanh thu", is_direct=True))

    def test_system_kb_grounded_search(self) -> None:
        printer_chunks = system_kb.search_system_docs(
            "Cách kết nối máy in RawBT với iMin D3-505",
            topic="printer",
            project_dir=str(REPO_ROOT),
        )
        self.assertTrue(any("RawBT" in c["content"] or "iMin" in c["content"] for c in printer_chunks))
        inv_chunks = system_kb.search_system_docs("Delta Split đa trạm bếp và COMBO", project_dir=str(REPO_ROOT))
        self.assertTrue(any("COMBO" in c["content"] or "split" in c["content"].lower() for c in inv_chunks))
        sess_chunks = system_kb.search_system_docs("Single-Session 401 RBAC", project_dir=str(REPO_ROOT))
        self.assertTrue(len(sess_chunks) >= 1)
        empty = system_kb.search_system_docs("xyznotfoundtokenqqq", project_dir=str(REPO_ROOT))
        self.assertEqual(empty, [])
