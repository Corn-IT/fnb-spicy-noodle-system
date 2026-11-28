"""Tests for lona_bot.handlers.local_* (superlatives, semantic synonyms, slices, entities, follow-ups, meta)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

MONITORING_DIR = Path(__file__).resolve().parents[1]
if str(MONITORING_DIR) not in sys.path:
    sys.path.insert(0, str(MONITORING_DIR))

from lona_bot.handlers import local_entities, local_meta, local_orders, local_router, local_superlatives
from lona_bot.state.entity_cache import EntityCache
from lona_bot.state.telemetry import TelemetryStore


class TestLocalHandlers(unittest.TestCase):
    def setUp(self) -> None:
        self.cfg = {"project_name": "Ăn Vặt Tran", "project_dir": "/tmp", "ro_db_user": "fnb_bot_ro"}

    def test_synonymous_superlatives_0_token(self) -> None:
        daily_items = {
            "summary": {"totalOrders": 20},
            "items": [
                {"productId": 1, "name": "Mì Cay Bò", "qty": 18, "revenue": 990000, "sharePercent": 50},
                {"productId": 2, "name": "Trà Đào", "qty": 10, "revenue": 1100000, "sharePercent": 30},
            ],
        }
        with mock.patch.object(local_superlatives, "call_internal_biz", return_value=daily_items):
            r1 = local_router.try_answer_locally("Món ăn bán chạy nhất là món nào", cfg=self.cfg)
            r2 = local_router.try_answer_locally("Món ăn được gọi nhiều nhất là món nào", cfg=self.cfg)
            self.assertIsNotNone(r1)
            self.assertIsNotNone(r2)
            self.assertIn("Mì Cay Bò", r1["text"])
            self.assertIn("Mì Cay Bò", r2["text"])
            self.assertEqual(r1["slots"]["product_id"], 1)
            self.assertEqual(r2["slots"]["product_id"], 1)

            # Revenue superlative selects Trà Đào (1.100.000đ > 990.000đ)
            r_rev = local_router.try_answer_locally("Món nào mang lại doanh thu cao nhất tháng này?", cfg=self.cfg)
            self.assertIsNotNone(r_rev)
            self.assertIn("Trà Đào", r_rev["text"])

        with mock.patch.object(local_superlatives, "run_readonly_sql_json", return_value=[{"id": 9, "name": "Khoai Tây", "station": "BEP_CHIEN", "price": 25000, "qty_sold": 1}]):
            r_slow = local_router.try_answer_locally("Món nào bán chậm nhất hôm qua?", cfg=self.cfg)
            self.assertIsNotNone(r_slow)
            self.assertIn("Khoai Tây", r_slow["text"])

    def test_peak_quiet_hours_staff_order_value_and_comparison(self) -> None:
        with mock.patch.object(local_superlatives, "run_readonly_sql_json", return_value=[{"hr": 19, "order_cnt": 15, "rev": 1200000}, {"hr": 20, "order_cnt": 11, "rev": 900000}]):
            pk = local_router.try_answer_locally("Khung giờ nào quán đông khách nhất hôm qua?", cfg=self.cfg)
            self.assertIn("19:00–20:00", pk["text"])

        with mock.patch.object(local_superlatives, "run_readonly_sql_json", return_value=[{"hr": 9, "order_cnt": 1, "rev": 55000}]):
            qt = local_router.try_answer_locally("Khung giờ nào vắng khách nhất hôm nay?", cfg=self.cfg)
            self.assertIn("09:00–10:00", qt["text"])

        with (
            mock.patch.object(local_superlatives, "run_readonly_sql_json", return_value=[{"actor_name": "Lan", "void_cnt": 4}]),
            mock.patch.object(local_superlatives, "get_staff_telegram_map", return_value={"lan": "@lan"}),
        ):
            sv = local_router.try_answer_locally("Ai hủy đơn nhiều nhất tháng này?", cfg=self.cfg)
            self.assertIn("Lan", sv["text"])

        with (
            mock.patch.object(local_superlatives, "run_readonly_sql_json", return_value=[{"cashier_name": "Ngân", "order_cnt": 22, "rev": 2100000}]),
            mock.patch.object(local_superlatives, "get_staff_telegram_map", return_value={}),
        ):
            so = local_router.try_answer_locally("Thu ngân nào bán nhiều đơn nhất hôm nay?", cfg=self.cfg)
            self.assertIn("Ngân", so["text"])

        with mock.patch.object(local_superlatives, "run_readonly_sql_json", return_value=[{"order_code": "ORD-999", "total_amount": 540000, "order_type": "DINE_IN", "takeaway_number": None, "table_name": "Bàn 08"}]):
            ov_bill = local_router.try_answer_locally("Đơn hàng nào có tổng tiền cao nhất hôm nay?", cfg=self.cfg)
            self.assertIn("ORD-999", ov_bill["text"])

        o1 = {"kpis": {"revenue": {"netPaidAmount": 2000000, "paidOrderCount": 20, "averageOrderValue": 100000}}}
        o2 = {"kpis": {"revenue": {"netPaidAmount": 1500000, "paidOrderCount": 16, "averageOrderValue": 93750}}}
        with mock.patch.object(local_superlatives, "call_internal_biz", side_effect=[o1, o2]):
            cmp_r = local_router.try_answer_locally("So sánh hôm nay với hôm qua", cfg=self.cfg)
            self.assertIn("+500.000đ", cmp_r["text"])

    def test_meta_toggles_kb_fallback_and_negative_guard_passthrough(self) -> None:
        # local_enabled=False blocks local routing cleanly
        self.assertIsNone(local_router.try_answer_locally("Món ăn bán chạy nhất là món nào", cfg=self.cfg, local_enabled=False))

        # Causal query hits negative guard -> yields None for Gemini
        self.assertIsNone(local_router.try_answer_locally("Tại sao hôm nay món trà đào bán chậm vậy?", cfg=self.cfg))

        # Meta FAQ queries
        self.assertIn("0 token", local_router.try_answer_locally("Câu hỏi nào không tốn token?", cfg=self.cfg)["text"])
        self.assertIn("Lona", local_router.try_answer_locally("Giới thiệu em biết làm gì?", cfg=self.cfg, persona_key="em_anh")["text"])
        self.assertIn("fnb_bot_ro", local_router.try_answer_locally("Bot có truy cập vào DB không?", cfg=self.cfg)["text"])
        with mock.patch.object(local_meta, "handle_help", return_value="LIST_CMDS"):
            self.assertEqual(local_router.try_answer_locally("Danh sách các câu lệnh", cfg=self.cfg)["text"], "LIST_CMDS")
        with mock.patch.object(local_meta, "probe_gemini_status", return_value={"configured": False, "key_valid": False, "models": []}):
            tok_r = local_router.try_answer_locally("Kiểm tra token còn lại bao nhiêu", cfg=self.cfg, telemetry=TelemetryStore())
            self.assertIn("TOKEN", tok_r["text"].upper())

        # System doc question passes through when Gemini is on, falls back to local KB when Gemini is off
        self.assertIsNone(local_router.try_answer_locally("Cách kết nối máy in RawBT với iMin", cfg=self.cfg, allow_kb_fallback=False))
        kb_res = local_router.try_answer_locally("Cách kết nối máy in RawBT với iMin", cfg=self.cfg, allow_kb_fallback=True)
        self.assertIsNotNone(kb_res)
        self.assertEqual(kb_res["route"], "system_kb")

    def test_slices_entities_recent_orders_and_followups(self) -> None:
        # Table slice
        tbl_rows = [{"table_name": "Bàn 05", "status": "OCCUPIED", "order_id": 55, "order_code": "ORD-05", "total_amount": 180000, "since_hm": "18:30"}]
        item_rows = [{"name": "Mì Cay Bò", "quantity": 2, "kitchen_status": "PRINTED"}]
        with mock.patch.object(local_entities, "run_readonly_sql_json", side_effect=[tbl_rows, item_rows]):
            tb = local_router.try_answer_locally("Bàn 05 đang gọi gì?", cfg=self.cfg)
            self.assertIn("ORD-05", tb["text"])

        # Active user sessions slice
        with mock.patch.object(local_entities, "run_readonly_sql_json", return_value=[{"username": "thungan1", "display_name": "Loan", "active_session_ip": "10.0.0.5", "active_session_device": "iPad", "at_vn": "09:00 28/11"}]):
            ips = local_router.try_answer_locally("Ai đang đăng nhập ở IP nào?", cfg=self.cfg)
            self.assertIn("10.0.0.5", ips["text"])

        # Addon and recent N-min orders
        addon_rows = [{"order_code": "ORD-77", "order_type": "DINE_IN", "takeaway_number": None, "table_name": "Bàn 03", "status": "SERVING", "total_amount": 120000, "product_name": "Xúc Xích", "quantity": 1, "batch_no": 2, "added_hm": "19:10"}]
        with mock.patch.object(local_orders, "run_readonly_sql_json", return_value=addon_rows):
            ad = local_router.try_answer_locally("Có đơn nào vừa gọi thêm món không?", cfg=self.cfg)
            self.assertIn("ORD-77", ad["text"])

        rec_rows = [{"order_code": "ORD-88", "order_type": "TAKEAWAY", "takeaway_number": 3, "table_name": None, "status": "PAID", "total_amount": 60000, "created_hm": "19:20"}]
        with mock.patch.object(local_orders, "run_readonly_sql_json", return_value=rec_rows):
            rc = local_router.try_answer_locally("Cách đây 10 phút có đơn nào không?", cfg=self.cfg)
            self.assertIn("ORD-88", rc["text"])

        # Entity matching: product & employee
        cache = EntityCache(ttl_sec=300)
        prod_rows = [{"id": 7, "name": "Trà Đào Cam Sả", "price": 32000, "station": "PHA_CHE", "is_available": True}]
        emp_rows = [{"id": 2, "full_name": "Nguyễn Thanh Loan", "short_name": "Thanh Loan", "phone": "0909123456", "bank_name": "MB", "bank_account_no": "123456", "start_vn": "01/01/2025", "position_name": "Thu ngân", "specialty_name": None}]
        with mock.patch("lona_bot.state.entity_cache.run_readonly_sql_json", side_effect=[prod_rows, emp_rows]):
            with mock.patch.object(local_entities, "run_readonly_sql_json", side_effect=[prod_rows[:1], [{"qty_sold": 12, "order_cnt": 9, "gross_rev": 384000}]]):
                prod_r = local_router.try_answer_locally("Trà đào cam sả hôm nay bán được mấy ly?", cfg=self.cfg, cache=cache)
                self.assertIn("Trà Đào Cam Sả", prod_r["text"])
            with mock.patch.object(local_entities, "get_staff_telegram_map", return_value={"thanh loan": "@loan"}):
                emp_r = local_router.try_answer_locally("SĐT của nhân viên Thanh Loan là gì?", cfg=self.cfg, cache=cache)
                self.assertIn("0909123456", emp_r["text"])

        # Follow-up product query using slot context
        with mock.patch.object(local_entities, "run_readonly_sql_json", side_effect=[prod_rows[:1], [{"qty_sold": 5, "order_cnt": 4, "gross_rev": 160000}], prod_rows[:1]]):
            fu_r = local_router.try_answer_locally(
                "Hôm qua món đó bán được mấy ly?",
                cfg=self.cfg,
                cache=cache,
                slots={"intent": "product_stat", "product_id": 7, "product_name": "Trà Đào Cam Sả"},
            )
            self.assertIn("Trà Đào Cam Sả", fu_r["text"])
            fu_price = local_router.try_answer_locally(
                "Món đó giá bao nhiêu tiền?",
                cfg=self.cfg,
                cache=cache,
                slots={"intent": "product_stat", "product_name": "Trà Đào Cam Sả"},
            )
            self.assertIn("32.000đ", fu_price["text"])

        # Additional slices: cash, transfer, QR + takeaway count / recent / 1-order follow-up
        ov_slice = {"kpis": {"revenue": {"netPaidAmount": 3000000, "paidOrderCount": 30, "takeawayCount": 8, "dineInCount": 22, "qrSourceCount": 10, "posSourceCount": 20}, "cashDrawer": {"totalCashSales": 1800000, "cashOnlySales": 1600000, "splitCashSales": 200000}, "transfer": {"totalTransferSales": 1200000}}}
        with mock.patch.object(local_entities, "call_internal_biz", return_value=ov_slice):
            self.assertIn("Tiền mặt", local_router.try_answer_locally("Doanh thu tiền mặt hôm nay?", cfg=self.cfg)["text"])
            self.assertIn("Chuyển khoản", local_router.try_answer_locally("Tiền chuyển khoản hôm nay?", cfg=self.cfg)["text"])
            self.assertIn("quét QR", local_router.try_answer_locally("Hôm nay có mấy đơn khách quét QR?", cfg=self.cfg)["text"])

        with mock.patch.object(local_router, "run_readonly_sql_json", return_value=[{"active_total": 14, "paid_count": 12, "serving_count": 2, "pending_count": 0, "void_count": 1, "takeaway_count": 14, "dine_in_count": 0, "total_amount": 1650000}]):
            cnt_tw = local_router.try_answer_locally("Hôm nay có mấy đơn mang về?", cfg=self.cfg)
            self.assertIn("14 đơn Mang về", cnt_tw["text"])
            self.assertEqual(cnt_tw["slots"]["order_type_filter"], "TAKEAWAY")

        tw_recent_rows = [
            {"order_code": "HD-20261128-0122", "order_type": "TAKEAWAY", "takeaway_number": 8, "table_name": None, "status": "PAID", "total_amount": 110000, "created_vn": "18:55 28/11"},
            {"order_code": "HD-20261128-0120", "order_type": "TAKEAWAY", "takeaway_number": 7, "table_name": None, "status": "SERVING", "total_amount": 95000, "created_vn": "18:40 28/11"},
        ]
        with mock.patch.object(local_router, "run_readonly_sql_json", return_value=tw_recent_rows):
            rec_tw = local_router.try_answer_locally("Đơn mang về gần nhất?", cfg=self.cfg)
            self.assertIn("HD-20261128-0122", rec_tw["text"])
            self.assertIn("HD-20261128-0120", rec_tw["text"])
        with mock.patch.object(local_router, "run_readonly_sql_json", return_value=tw_recent_rows[:1]):
            fu_one = local_router.try_answer_locally("Một đơn thôi", cfg=self.cfg, slots=rec_tw["slots"])
            self.assertIn("HD-20261128-0122", fu_one["text"])
            self.assertNotIn("0120", fu_one["text"])

        # Follow-up on order_code, table_name, topmon expand, and period shift
        ord_fu_row = [{"order_code": "ORD-777", "order_type": "DINE_IN", "takeaway_number": None, "table_name": "Bàn 05", "status": "PAID", "payment_method": "CASH", "total_amount": 150000, "cashier_name": "Loan", "created_vn": "18:00 28/11"}]
        with mock.patch.object(local_router, "run_readonly_sql_json", return_value=ord_fu_row):
            self.assertIn("ORD-777", local_router.try_answer_locally("Đơn đó ăn tại quán hay mang đi?", cfg=self.cfg, slots={"order_code": "ORD-777"})["text"])
        with mock.patch.object(local_entities, "run_readonly_sql_json", return_value=[{"table_name": "Bàn 05", "status": "AVAILABLE", "order_id": None}]):
            self.assertIn("TRỐNG", local_router.try_answer_locally("Bàn đó đang thế nào?", cfg=self.cfg, slots={"table_name": "Bàn 05"})["text"])
        with mock.patch.object(local_router, "handle_topmon", return_value="FULL_TOP10"):
            self.assertEqual(local_router.try_answer_locally("Xem đủ top 10 giúp anh", cfg=self.cfg, slots={"intent": "topmon_best", "period_raw": "homnay"})["text"], "FULL_TOP10")
        with mock.patch.object(local_router, "handle_doanhthu", return_value="REV_YEST"):
            self.assertEqual(local_router.try_answer_locally("Còn hôm qua thì sao?", cfg=self.cfg, slots={"intent": "doanhthu"})["text"], "REV_YEST")

        # Fast-path semantic routing across all domain modules (0 token)
        with (
            mock.patch.object(local_router, "handle_don", return_value="ORD_OK"),
            mock.patch.object(local_router, "handle_tongquan", return_value="TQ_OK"),
            mock.patch.object(local_router, "handle_doanhthu", return_value="DT_OK"),
            mock.patch.object(local_router, "handle_loinhuan", return_value="LN_OK"),
            mock.patch.object(local_router, "handle_ket", return_value="KET_OK"),
            mock.patch.object(local_router, "handle_qr", return_value="QR_OK"),
            mock.patch.object(local_router, "handle_bep", return_value="BEP_OK"),
            mock.patch.object(local_router, "handle_kho", return_value="KHO_OK"),
            mock.patch.object(local_router, "handle_khuyenmai", return_value="KM_OK"),
            mock.patch.object(local_router, "handle_huy", return_value="HUY_OK"),
            mock.patch.object(local_router, "handle_audit", return_value="AUD_OK"),
            mock.patch.object(local_router, "handle_lich", return_value="LICH_OK"),
            mock.patch.object(local_router, "handle_luong", return_value="LUONG_OK"),
            mock.patch.object(local_router, "handle_ban", return_value="BAN_OK"),
            mock.patch.object(local_router, "handle_topmon", return_value="TOPMON_OK"),
        ):
            self.assertEqual(local_router.try_answer_locally("Kiểm tra giúp em ORD-2026-0001", cfg=self.cfg)["text"], "ORD_OK")
            self.assertEqual(local_router.try_answer_locally("Tổng quan kinh doanh hôm nay", cfg=self.cfg)["text"], "TQ_OK")
            self.assertEqual(local_router.try_answer_locally("Doanh thu hôm qua", cfg=self.cfg)["text"], "DT_OK")
            self.assertEqual(local_router.try_answer_locally("Lợi nhuận tháng này", cfg=self.cfg)["text"], "LN_OK")
            self.assertEqual(local_router.try_answer_locally("Kiểm tra két tiền cuối ca", cfg=self.cfg)["text"], "KET_OK")
            self.assertEqual(local_router.try_answer_locally("Hạn mức tài khoản VietQR", cfg=self.cfg)["text"], "QR_OK")
            self.assertEqual(local_router.try_answer_locally("Tình hình trạm bếp hôm nay", cfg=self.cfg)["text"], "BEP_OK")
            self.assertEqual(local_router.try_answer_locally("Chi phí nhập kho tuần này", cfg=self.cfg)["text"], "KHO_OK")
            self.assertEqual(local_router.try_answer_locally("Mã giảm giá tháng này", cfg=self.cfg)["text"], "KM_OK")
            self.assertEqual(local_router.try_answer_locally("Đơn hủy hôm nay", cfg=self.cfg)["text"], "HUY_OK")
            self.assertEqual(local_router.try_answer_locally("Xem nhật ký thao tác hệ thống", cfg=self.cfg)["text"], "AUD_OK")
            self.assertEqual(local_router.try_answer_locally("Lịch trực hôm nay", cfg=self.cfg)["text"], "LICH_OK")
            self.assertEqual(local_router.try_answer_locally("Bảng lương tháng này", cfg=self.cfg)["text"], "LUONG_OK")
            self.assertEqual(local_router.try_answer_locally("Hiện tại có bao nhiêu bàn đang phục vụ?", cfg=self.cfg)["text"], "BAN_OK")
            self.assertEqual(local_router.try_answer_locally("Liệt kê top 5 món được gọi nhiều nhất", cfg=self.cfg)["text"], "TOPMON_OK")

        # Expanded menu catalog, staff list, and unpaid count at 0 tokens
        fresh_cache = EntityCache(ttl_sec=300)
        with mock.patch("lona_bot.state.entity_cache.run_readonly_sql_json", return_value=[{"id": 1, "name": "Mì Cay Bò", "price": 55000, "station": "BEP_NAU", "is_available": True}, {"id": 2, "name": "Khoai Tây", "price": 25000, "station": "BEP_CHIEN", "is_available": False}]):
            menu_r = local_router.try_answer_locally("Thực đơn quán có bao nhiêu món?", cfg=self.cfg, cache=fresh_cache)
            self.assertIn("2 món", menu_r["text"])
            paused_r = local_router.try_answer_locally("Quán có món nào đang tạm hết?", cfg=self.cfg, cache=fresh_cache)
            self.assertIn("Khoai Tây", paused_r["text"])
            cheap_r = local_router.try_answer_locally("Món nào rẻ nhất thực đơn?", cfg=self.cfg, cache=fresh_cache)
            self.assertIn("Khoai Tây", cheap_r["text"])
        with mock.patch.object(local_router, "run_readonly_sql_json", return_value=[{"name": "Ngân", "pos_name": "Thu ngân"}]):
            staff_r = local_router.try_answer_locally("Quán có bao nhiêu nhân viên?", cfg=self.cfg)
            self.assertIn("1 nhân sự", staff_r["text"])
        with mock.patch.object(local_router, "run_readonly_sql_json", return_value=[{"active_total": 3, "paid_count": 1, "serving_count": 2, "pending_count": 0, "void_count": 0, "takeaway_count": 1, "dine_in_count": 2, "total_amount": 350000}]):
            unpaid_r = local_router.try_answer_locally("Hôm nay có bao nhiêu đơn chưa thanh toán?", cfg=self.cfg)
            self.assertIn("2 đơn chưa thanh toán", unpaid_r["text"])
