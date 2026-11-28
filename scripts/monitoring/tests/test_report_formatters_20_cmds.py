"""Tests covering all 20 business report formatters in lona_bot.handlers.report_*."""

from __future__ import annotations

import datetime as dt
import sys
import unittest
from pathlib import Path
from unittest import mock

MONITORING_DIR = Path(__file__).resolve().parents[1]
if str(MONITORING_DIR) not in sys.path:
    sys.path.insert(0, str(MONITORING_DIR))

from lona_bot.handlers import report_digest, report_finance_hr, report_helpers, report_orders_risk, report_sales_ops


def _sample_overview() -> dict:
    return {
        "kpis": {
            "revenue": {
                "netPaidAmount": 3500000,
                "paidOrderCount": 42,
                "dineInCount": 30,
                "takeawayCount": 12,
                "averageOrderValue": 83333,
                "discountAmount": 120000,
                "subtotalAmount": 3620000,
                "growthPercent": 15.2,
            },
            "cashDrawer": {
                "openingBudget": 500000,
                "totalCashSales": 2000000,
                "cashOnlySales": 1800000,
                "splitCashSales": 200000,
                "totalCashImports": 300000,
                "expectedCashInDrawer": 2200000,
                "estimatedHandOver": 1700000,
            },
            "transfer": {"totalTransferSales": 1500000},
            "inventory": {"totalImportCost": 800000, "cashDrawerImportCost": 300000},
            "openOrders": {
                "occupiedTableCount": 4,
                "totalPhysicalTables": 20,
                "pendingTableCount": 1,
                "takeawayOpenCount": 2,
                "unprintedKitchenItemsCount": 3,
                "totalOpenAmount": 450000,
            },
            "profit": {
                "grossProfitAfterInventory": 2700000,
                "estimatedLaborCost": 600000,
                "netOperatingProfit": 2100000,
                "marginPercent": 60.0,
            },
        },
        "paymentBreakdown": [
            {"method": "CASH", "totalAmount": 1800000, "orderCount": 25, "sharePercent": 51},
            {"method": "TRANSFER", "totalAmount": 1500000, "orderCount": 15, "sharePercent": 43},
        ],
        "revenueSeries": {
            "granularity": "hour",
            "peakBucketLabel": "19:00–20:00",
            "peakBucketAmount": 900000,
            "peakBucketOrders": 12,
            "buckets": [{"label": "19:00", "totalSales": 900000, "orderCount": 12}],
        },
        "paymentQrAccounts": [
            {
                "id": 1,
                "label": "MB Chính",
                "bankCode": "MB",
                "accountNo": "0901",
                "status": "ACTIVE",
                "usedDay": 1500000,
                "dailyLimit": 5000000,
                "usedMonth": 25000000,
                "monthlyLimit": 100000000,
            }
        ],
        "discountsAndRisk": {"voidedOrderCount": 1, "voidedAmount": 95000},
        "alerts": {
            "pendingQrTables": [{"tableId": 2}],
            "pendingPaymentEdits": [{"orderCode": "ORD-1"}],
            "nearLimitQrAccounts": [],
        },
        "liveTables": {
            "tables": [
                {"id": 1, "name": "Bàn 01", "status": "OCCUPIED", "activeOrder": {"orderCode": "ORD-1", "totalAmount": 150000}},
                {"id": 2, "name": "Bàn 02", "status": "PENDING", "activeOrder": {"orderCode": "ORD-2", "totalAmount": 80000}},
                {"id": 3, "name": "Bàn 03", "status": "AVAILABLE"},
            ],
            "takeaways": [{"tableLabel": "Mang về #1", "orderCode": "ORD-TW1", "totalAmount": 65000}],
        },
        "topProducts": {"topModifiers": [{"name": "Cấp độ 2", "qty": 18, "revenue": 90000}]},
        "kitchenStations": {
            "comboDecomposedCount": 5,
            "stations": [{"station": "BEP_NAU", "label": "Bếp Nấu", "printedQty": 30, "revenue": 1650000, "sharePercent": 100, "pendingQty": 1, "cancelledQty": 0}],
            "spiceLevels": [{"label": "Cấp độ 1", "count": 10}],
        },
    }


def _sample_daily_items() -> dict:
    return {
        "summary": {"totalQuantity": 55, "totalProductsSold": 8, "totalOrders": 42},
        "items": [
            {"productId": 1, "name": "Mì Cay Bò", "qty": 25, "revenue": 1375000, "sharePercent": 45},
            {"productId": 2, "name": "Mì Cay Hải Sản", "qty": 15, "revenue": 900000, "sharePercent": 26},
        ],
    }


class TestReportFormatters(unittest.TestCase):
    def setUp(self) -> None:
        self.cfg = {"project_name": "Ăn Vặt Tran", "project_dir": "/tmp", "ro_db_user": "fnb_bot_ro"}

    def test_sales_and_ops_reports(self) -> None:
        ov = _sample_overview()
        di = _sample_daily_items()
        with (
            mock.patch.object(report_helpers, "call_internal_biz", return_value=ov),
            mock.patch.object(report_sales_ops, "call_internal_biz", return_value=di),
            mock.patch.object(report_sales_ops, "run_readonly_sql_json", return_value=[{"cnt": 2}]),
        ):
            tq = report_sales_ops.handle_tongquan("homnay", cfg=self.cfg)
            self.assertIn("3.500.000đ", tq)
            self.assertIn("Lưu ý", tq)

            ban = report_sales_ops.handle_ban(cfg=self.cfg)
            self.assertIn("Bàn 01", ban)
            self.assertIn("Mang về #1", ban)

            dt_txt = report_sales_ops.handle_doanhthu("homnay", cfg=self.cfg)
            self.assertIn("Cơ cấu thanh toán", dt_txt)

            top_txt = report_sales_ops.handle_topmon("homnay", cfg=self.cfg)
            self.assertIn("Mì Cay Bò", top_txt)

        with mock.patch.object(report_sales_ops, "run_readonly_sql_json", return_value=[{"name": "Bánh Tráng", "station": "BEP_CHIEN", "price": 25000, "qty_sold": 1}]):
            slow_txt = report_sales_ops.handle_topmon("cham tuan", cfg=self.cfg)
            self.assertIn("TOP MÓN BÁN CHẬM", slow_txt)

        bep_rows = [{"station": "BEP_NAU", "total_qty": 30, "total_amount": 1650000, "cancelled_qty": 1, "unprinted_qty": 2}]
        with (
            mock.patch.object(report_helpers, "call_internal_biz", return_value=ov),
            mock.patch.object(report_sales_ops, "run_readonly_sql_json", return_value=bep_rows),
        ):
            self.assertIn("Bếp Nấu", report_sales_ops.handle_bep("homnay", cfg=self.cfg))

    def test_orders_risk_and_finance_hr_and_digest_reports(self) -> None:
        ov = _sample_overview()
        di = _sample_daily_items()
        order_row = {
            "id": 10, "order_code": "ORD-2026-0001", "order_type": "DINE_IN", "order_source": "POS_COUNTER",
            "status": "PAID", "payment_method": "CASH", "subtotal_amount": 110000, "discount_amount": 10000,
            "total_amount": 100000, "cash_amount": 100000, "transfer_amount": 0, "void_reason": None, "note": "",
            "takeaway_number": None, "table_name": "Bàn 05", "cashier_name": "Ngân", "created_vn": "10:00", "paid_vn": "10:30",
        }
        items_rows = [{"product_name": "Mì Cay Bò", "quantity": 2, "unit_price": 55000, "kitchen_status": "PRINTED", "item_note": ""}]
        with mock.patch.object(report_orders_risk, "run_readonly_sql_json", side_effect=[[order_row], items_rows]):
            det = report_orders_risk.handle_don("ORD-2026-0001", cfg=self.cfg)
            self.assertIn("Bàn 05", det)

        summary_row = [{"total_orders": 10, "paid_count": 8, "open_count": 1, "voided_count": 1, "dine_in_paid": 6, "takeaway_paid": 2, "pos_paid": 5, "qr_paid": 3, "paid_revenue": 800000}]
        recent_rows = [{"order_code": "ORD-1", "status": "PAID", "total_amount": 100000, "order_type": "DINE_IN", "takeaway_number": None, "table_name": "Bàn 01", "created_hm": "18:00"}]
        with mock.patch.object(report_orders_risk, "run_readonly_sql_json", side_effect=[summary_row, recent_rows]):
            don_txt = report_orders_risk.handle_don("homnay", cfg=self.cfg)
            self.assertIn("THỐNG KÊ ĐƠN HÀNG", don_txt)

        with mock.patch.object(report_helpers, "call_internal_biz", return_value=ov):
            with mock.patch.object(report_orders_risk, "call_internal_biz", return_value={"summary": {"totalUses": 3, "totalDiscountAmount": 45000}, "codeStats": [{"code": "GIAM10", "name": "Giảm 10%", "usedCountInPeriod": 3, "totalDiscountedInPeriod": 45000}]}):
                with mock.patch.object(report_orders_risk, "run_readonly_sql_json", return_value=[{"code": "GIAM10", "name": "Giảm 10%", "value_type": "PERCENT", "value": 10, "used_count": 3, "usage_limit": 50}]):
                    self.assertIn("GIAM10", report_orders_risk.handle_khuyenmai("homnay", cfg=self.cfg))

        void_rows = [{"order_code": "ORD-9", "est_amount": 95000, "void_reason": "Khách đổi món", "actor_name": "Lan", "created_hm": "12:15"}]
        with mock.patch.object(report_orders_risk, "run_readonly_sql_json", side_effect=[void_rows, [{"name": "Trà Sữa", "qty": 1, "amount": 25000}], [{"order_code": "ORD-8", "total_amount": 60000, "payment_method": "CASH", "req_method": "TRANSFER", "req_by": "Lan"}]]):
            self.assertIn("ORD-9", report_orders_risk.handle_huy("homnay", cfg=self.cfg))

        audit_rows = [{"module": "INVOICES", "action": "VOID", "summary": "Hủy đơn", "ip_address": "1.2.3.4", "device_label": "Chrome", "at_vn": "12:00"}]
        with mock.patch.object(report_orders_risk, "run_readonly_sql_json", return_value=audit_rows):
            self.assertIn("INVOICES", report_orders_risk.handle_audit("don", cfg=self.cfg))

        # Finance & HR
        settlements = {"items": [{"settlementDate": "2026-11-28", "shiftName": "Ca Tối", "actualCountedCash": 2200000, "discrepancyAmount": 0, "status": "MATCHED", "closedByName": "Loan"}]}
        with mock.patch.object(report_helpers, "call_internal_biz", return_value=ov):
            with mock.patch.object(report_finance_hr, "call_internal_biz", return_value=settlements):
                self.assertIn("MB Chính", report_finance_hr.handle_qr(cfg=self.cfg))
                self.assertIn("ĐỐI SOÁT KÉT TIỀN MẶT", report_finance_hr.handle_ket("homnay", cfg=self.cfg))
                self.assertIn("ƯỚC TÍNH LỢI NHUẬN", report_finance_hr.handle_loinhuan("thang", cfg=self.cfg))

        inv_resp = {"summary": {"totalBatches": 2, "totalCost": 800000, "cashDrawerCost": 300000, "externalCost": 500000}, "items": [{"batchCode": "NK-01", "paymentSource": "CASH_DRAWER", "totalCost": 300000, "supplierName": "Chợ sỉ"}]}
        with (
            mock.patch.object(report_helpers, "call_internal_biz", return_value=ov),
            mock.patch.object(report_finance_hr, "call_internal_biz", return_value=inv_resp),
            mock.patch.object(report_finance_hr, "run_readonly_sql_json", return_value=[{"name": "Bò Mỹ", "qty": 5, "unit_name": "kg", "cost": 400000}]),
        ):
            self.assertIn("Bò Mỹ", report_finance_hr.handle_kho("homnay", cfg=self.cfg))

        sched_resp = {"cells": [{"dayOfWeek": 0, "timeSlot": "08:00-14:00", "employees": [{"shortName": "Loan"}]}]}
        with (
            mock.patch.object(report_finance_hr, "call_internal_biz", return_value=sched_resp),
            mock.patch.object(report_finance_hr, "get_staff_telegram_map", return_value={"loan": "@loan"}),
        ):
            self.assertIn("LỊCH", report_finance_hr.handle_lich("tuan", cfg=self.cfg))
            self.assertIn("LỊCH TRỰC HÔM NAY", report_finance_hr.handle_lich("", cfg=self.cfg))

        pay_resp = {"fromDate": "2026-11-01", "toDate": "2026-11-28", "summary": {"totalEmployees": 3, "totalFullShiftDays": 30, "totalCustomHours": 10, "totalSalary": 12000000}, "items": [{"shortName": "Loan", "fullShiftDays": 20, "customHours": 5, "totalSalary": 6000000}]}
        with mock.patch.object(report_finance_hr, "call_internal_biz", return_value=pay_resp):
            self.assertIn("12.000.000đ", report_finance_hr.handle_luong("thang", cfg=self.cfg))

        # Help + Daily + Weekly digest
        self.assertIn("/tongquan", report_digest.handle_help(self.cfg))
        with (
            mock.patch.object(report_helpers, "call_internal_biz", return_value=ov),
            mock.patch.object(report_digest, "call_internal_biz", side_effect=[settlements, di]),
            mock.patch.object(report_sales_ops, "call_internal_biz", return_value=di),
            mock.patch.object(report_sales_ops, "run_readonly_sql_json", return_value=[]),
            mock.patch.object(report_digest, "run_readonly_sql_json", return_value=[]),
            mock.patch.object(report_digest, "handle_lich", return_value="Lịch mai"),
            mock.patch.object(report_digest, "handle_huy", return_value="Đơn hủy: 0"),
        ):
            daily = report_digest.build_daily_close_report("2026-11-28", cfg=self.cfg)
            weekly = report_digest.build_weekly_summary_report(dt.date(2026, 11, 28), cfg=self.cfg)
            self.assertIn("CHỐT SỔ CUỐI NGÀY", daily)
            self.assertIn("TỔNG KẾT TUẦN", weekly)
