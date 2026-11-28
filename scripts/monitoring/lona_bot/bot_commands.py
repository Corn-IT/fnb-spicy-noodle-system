"""Telegram slash command menu registry and slot mappings."""

from __future__ import annotations

import sys
from typing import Callable

from .core.telegram_io import tg_api

from .handlers.report_digest import handle_help
from .handlers.report_finance_hr import handle_ket, handle_kho, handle_lich, handle_loinhuan, handle_luong, handle_qr
from .handlers.report_orders_risk import handle_audit, handle_don, handle_huy, handle_khuyenmai
from .handlers.report_sales_ops import handle_ban, handle_bep, handle_doanhthu, handle_tongquan, handle_topmon

COMMAND_HANDLERS: dict[str, Callable[[str, dict[str, str]], str]] = {
    "tongquan": lambda arg, cfg: handle_tongquan(arg, cfg=cfg),
    "ban": lambda arg, cfg: handle_ban(cfg=cfg),
    "don": lambda arg, cfg: handle_don(arg, cfg=cfg),
    "doanhthu": lambda arg, cfg: handle_doanhthu(arg, cfg=cfg),
    "ket": lambda arg, cfg: handle_ket(arg, cfg=cfg),
    "qr": lambda arg, cfg: handle_qr(cfg=cfg),
    "topmon": lambda arg, cfg: handle_topmon(arg, cfg=cfg),
    "bep": lambda arg, cfg: handle_bep(arg, cfg=cfg),
    "kho": lambda arg, cfg: handle_kho(arg, cfg=cfg),
    "khuyenmai": lambda arg, cfg: handle_khuyenmai(arg, cfg=cfg),
    "huy": lambda arg, cfg: handle_huy(arg, cfg=cfg),
    "audit": lambda arg, cfg: handle_audit(arg, cfg=cfg),
    "lich": lambda arg, cfg: handle_lich(arg, cfg=cfg),
    "luong": lambda arg, cfg: handle_luong(arg, cfg=cfg),
    "loinhuan": lambda arg, cfg: handle_loinhuan(arg, cfg=cfg),
    "help": lambda arg, cfg: handle_help(cfg=cfg),
    "start": lambda arg, cfg: handle_help(cfg=cfg),
}

_SLOT_BY_CMD: dict[str, str] = {
    "tongquan": "tongquan",
    "don": "don",
    "doanhthu": "doanhthu",
    "ket": "ket",
    "topmon": "topmon_best",
    "bep": "bep",
    "kho": "kho",
    "khuyenmai": "khuyenmai",
    "huy": "huy",
    "lich": "lich",
    "luong": "luong",
    "loinhuan": "loinhuan",
}


def register_biz_commands(bot_token: str) -> None:
    commands = [
        {"command": "tongquan", "description": "Tổng quan doanh thu, két, kho, bàn & lợi nhuận"},
        {"command": "ban", "description": "Bàn đang phục vụ, tạm tính & đơn QR chờ duyệt"},
        {"command": "don", "description": "Thống kê đơn hàng hoặc tra cứu /don <mã_đơn>"},
        {"command": "doanhthu", "description": "Doanh thu, tăng trưởng, PTTT & khung giờ"},
        {"command": "ket", "description": "Đối soát két tiền mặt & lịch sử chốt ca"},
        {"command": "qr", "description": "Hạn mức ngày/tháng/năm tài khoản VietQR"},
        {"command": "topmon", "description": "Top món bán chạy (hoặc /topmon cham)"},
        {"command": "bep", "description": "Sản lượng từng trạm bếp & cấp độ cay"},
        {"command": "kho", "description": "Chi phí nhập kho (Két/Ngoài) & top nguyên liệu"},
        {"command": "khuyenmai", "description": "Hiệu quả mã giảm giá & giảm thủ công"},
        {"command": "huy", "description": "Kiểm soát đơn hủy (VOIDED), hủy món & sửa PTTT"},
        {"command": "audit", "description": "Nhật ký kiểm toán hệ thống gần nhất"},
        {"command": "lich", "description": "Lịch trực nhân viên hôm nay hoặc /lich tuan"},
        {"command": "luong", "description": "Bảng công & quỹ lương ước tính"},
        {"command": "loinhuan", "description": "Lợi nhuận ước tính sau kho & lương"},
        {"command": "token", "description": "Kiểm tra Key/Model Gemini, giờ reset quota & tỷ lệ 0-token"},
        {"command": "gemini", "description": "Check trực tiếp API Key, model & hạn mức Gemini (0 token)"},
        {"command": "hoi", "description": "Hỏi tự do AI Gemini về hệ thống POS & Database"},
        {"command": "quen", "description": "Xóa ngữ cảnh hội thoại gần đây để hỏi chủ đề mới"},
        {"command": "help", "description": "Hướng dẫn 20 lệnh, cách gọi Bot & emoji trạng thái"},
    ]
    for scope in ({"type": "default"}, {"type": "all_group_chats"}):
        try:
            tg_api(bot_token, "setMyCommands", {"commands": commands, "scope": scope}, timeout=10)
        except Exception as err:
            print(f"[biz-bot] setMyCommands ({scope['type']}) warning: {err}", file=sys.stderr)
