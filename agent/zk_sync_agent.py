#!/usr/bin/env python3
"""ZKTeco / Ronald Jack -> Supabase attendance sync agent (V2).

Luồng:
  Máy chấm công --LAN--> raw punches -> SQLite outbox -> Supabase.attendance_punches
                                      -> ghép tối đa 2 cặp -> attendance_logs

Biến môi trường:
  ZK_IP                  bắt buộc
  ZK_PORT=4370
  ZK_PASSWORD=0
  DEVICE_ID=ZK-01
  SUPABASE_URL           bắt buộc
  SUPABASE_SERVICE_KEY   bắt buộc
  SYNC_DAYS=3            đọc lại N ngày để chống sót log
  INTERVAL_MIN=15        chu kỳ chạy
  TZ_NAME=Asia/Ho_Chi_Minh
  CACHE_DB=outbox.db

Quy tắc ghép:
  - Sắp xếp các lần quẹt trong cùng ngày.
  - Hai lần quẹt cách nhau <= 1 phút được xem là quẹt đúp và giữ 1 lần.
  - Cặp 1 = punch 1 -> punch 2.
  - Cặp 2 = punch 3 -> punch 4.
  - Nếu có punch lẻ cuối cùng, hệ thống giữ giờ vào nhưng để giờ ra = NULL.
  - Nếu > 4 punch hợp lệ/ngày, attendance_logs chỉ lưu 2 cặp; raw logs vẫn giữ đủ
    để kiểm toán. Agent ghi warning để quản lý biết có thể cần quy tắc riêng.

Ca qua nửa đêm vẫn được gom theo ngày lịch. Muốn tính ca qua đêm theo shift,
phase sau sẽ dùng work_date từ shifts để ghép lại.
"""

import argparse
import logging
import os
import sqlite3
import sys
import time
from collections import defaultdict
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from supabase import create_client
from zk import ZK

log = logging.getLogger("zk-agent")
TZ = ZoneInfo(os.getenv("TZ_NAME", "Asia/Ho_Chi_Minh"))
DEVICE_ID = os.getenv("DEVICE_ID", "ZK-01")
DOUBLE_PUNCH = timedelta(minutes=1)
MAX_PAIRS = 2


def retry(fn, tries=4, base=2.0, what="thao tác"):
    for i in range(1, tries + 1):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001
            if i == tries:
                raise
            wait = base ** i
            log.warning("%s lỗi (%s) - thử lại lần %d sau %.0fs", what, exc, i, wait)
            time.sleep(wait)


def open_cache() -> sqlite3.Connection:
    db = sqlite3.connect(os.getenv("CACHE_DB", "outbox.db"))
    db.execute(
        """create table if not exists punch_outbox (
            device_id text not null,
            pin text not null,
            punched_at text not null,
            verify_type text,
            raw_status text,
            primary key (device_id, pin, punched_at)
        )"""
    )
    db.commit()
    return db


def cache_punches(db, rows):
    db.executemany(
        """insert or ignore into punch_outbox
           (device_id, pin, punched_at, verify_type, raw_status)
           values (?,?,?,?,?)""",
        rows,
    )
    db.commit()


def read_device(since: datetime):
    ip = os.environ["ZK_IP"]
    zk = ZK(
        ip,
        port=int(os.getenv("ZK_PORT", 4370)),
        timeout=15,
        password=int(os.getenv("ZK_PASSWORD", 0)),
        force_udp=False,
        ommit_ping=False,
    )
    conn = zk.connect()
    try:
        out = []
        for a in conn.get_attendance():
            ts = a.timestamp.replace(tzinfo=TZ)
            if ts < since:
                continue
            out.append(
                {
                    "pin": str(a.user_id),
                    "timestamp": ts,
                    "verify_type": str(getattr(a, "status", "")),
                    "raw_status": str(getattr(a, "punch", "")),
                }
            )
        return out
    finally:
        conn.disconnect()


def dedupe_punches(items):
    """Giữ thứ tự thời gian; loại quẹt đúp liên tiếp <= 1 phút."""
    items = sorted(items)
    kept = []
    for ts in items:
        if not kept or ts - kept[-1] > DOUBLE_PUNCH:
            kept.append(ts)
    return kept


def pair_daily(punches_by_pin_day):
    """Return summary rows: (pin, day, in1, out1, in2, out2, count)."""
    rows = []
    for (pin, day), values in punches_by_pin_day.items():
        times = dedupe_punches(values)
        if not times:
            continue

        if len(times) > MAX_PAIRS * 2:
            log.warning(
                "%s ngày %s có %d lần quẹt hợp lệ; chỉ đưa 4 lần đầu vào 2 cặp. Raw logs vẫn được giữ.",
                pin,
                day,
                len(times),
            )

        selected = times[: MAX_PAIRS * 2]
        pairs = []
        for i in range(0, len(selected), 2):
            cin = selected[i]
            cout = selected[i + 1] if i + 1 < len(selected) else None
            pairs.append((cin, cout))

        p1 = pairs[0] if len(pairs) >= 1 else (None, None)
        p2 = pairs[1] if len(pairs) >= 2 else (None, None)
        rows.append(
            (
                pin,
                day,
                p1[0].time().replace(microsecond=0).isoformat() if p1[0] else None,
                p1[1].time().replace(microsecond=0).isoformat() if p1[1] else None,
                p2[0].time().replace(microsecond=0).isoformat() if p2[0] else None,
                p2[1].time().replace(microsecond=0).isoformat() if p2[1] else None,
                len(times),
            )
        )
    return rows


def load_pin_map(sb):
    data = retry(
        lambda: sb.table("users")
        .select("id,device_pin")
        .not_.is_("device_pin", "null")
        .execute()
        .data,
        what="tải danh sách nhân viên",
    )
    return {str(u["device_pin"]): u["id"] for u in (data or []) if u.get("device_pin")}


def push_raw(db, sb, pin_map) -> int:
    pending = db.execute(
        "select device_id,pin,punched_at,verify_type,raw_status from punch_outbox order by punched_at"
    ).fetchall()
    if not pending:
        return 0

    sent = 0
    unknown = set()
    for i in range(0, len(pending), 200):
        batch = pending[i : i + 200]
        payload = []
        delete_keys = []
        for device_id, pin, punched_at, verify_type, raw_status in batch:
            uid = pin_map.get(pin)
            if not uid:
                unknown.add(pin)
                continue
            payload.append(
                {
                    "user_id": uid,
                    "device_id": device_id,
                    "device_pin": pin,
                    "punched_at": punched_at,
                    "verify_type": verify_type,
                    "raw_status": raw_status,
                }
            )
            delete_keys.append((device_id, pin, punched_at))

        if not payload:
            continue

        retry(
            lambda p=payload: sb.table("attendance_punches")
            .upsert(p, on_conflict="device_id,device_pin,punched_at")
            .execute(),
            what="đẩy raw attendance",
        )
        db.executemany(
            "delete from punch_outbox where device_id=? and pin=? and punched_at=?",
            delete_keys,
        )
        db.commit()
        sent += len(payload)

    if unknown:
        log.warning("Mã chấm công chưa được gán users.device_pin: %s", sorted(unknown))
    return sent


def push_summaries(sb, grouped, pin_map):
    rows = pair_daily(grouped)
    payload = []
    unknown = set()
    for pin, day, in1, out1, in2, out2, count in rows:
        uid = pin_map.get(pin)
        if not uid:
            unknown.add(pin)
            continue
        payload.append(
            {
                "user_id": uid,
                "work_date": day,
                "device_id": DEVICE_ID,
                "check_in_1": in1,
                "check_out_1": out1,
                "check_in_2": in2,
                "check_out_2": out2,
                "punch_count": count,
                "source": "device",
            }
        )

    for i in range(0, len(payload), 200):
        batch = payload[i : i + 200]
        retry(
            lambda p=batch: sb.table("attendance_logs")
            .upsert(p, on_conflict="user_id,work_date")
            .execute(),
            what="đẩy attendance summary",
        )

    if unknown:
        log.warning("Không thể tạo attendance summary cho pin: %s", sorted(unknown))
    return len(payload)


def run_once(days: int):
    db = open_cache()
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    since = datetime.now(TZ) - timedelta(days=days)

    try:
        events = retry(lambda: read_device(since), what="đọc máy chấm công")
        cache_rows(
            db,
            [
                (
                    DEVICE_ID,
                    e["pin"],
                    e["timestamp"].isoformat(),
                    e["verify_type"],
                    e["raw_status"],
                )
                for e in events
            ],
        )
        log.info("Đọc %d raw punch từ máy", len(events))
    except Exception as exc:  # noqa: BLE001
        log.error("Không đọc được máy chấm công: %s", exc)
        events = []

    try:
        pin_map = load_pin_map(sb)
        sent = push_raw(db, sb, pin_map)
        log.info("Đã đẩy %d raw punch lên Supabase", sent)
    except Exception as exc:  # noqa: BLE001
        log.error("Đẩy raw punch thất bại: %s", exc)
        pin_map = {}

    # Summary được dựng từ dữ liệu máy vừa đọc trong vòng này.
    # Vòng sau sẽ đọc lại SYNC_DAYS ngày nên summary có cơ hội tự phục hồi.
    if events and pin_map:
        grouped = defaultdict(list)
        for e in events:
            grouped[(e["pin"], e["timestamp"].date().isoformat())].append(e["timestamp"])
        try:
            count = push_summaries(sb, grouped, pin_map)
            log.info("Đã cập nhật %d attendance summary", count)
        except Exception as exc:  # noqa: BLE001
            log.error("Đẩy attendance summary thất bại: %s", exc)

    left = db.execute("select count(*) from punch_outbox").fetchone()[0]
    if left:
        log.info("Outbox còn %d raw punch; sẽ gửi lại vòng sau", left)
    db.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--days", type=int, default=int(os.getenv("SYNC_DAYS", 3)))
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    for key in ("ZK_IP", "SUPABASE_URL", "SUPABASE_SERVICE_KEY"):
        if not os.getenv(key):
            sys.exit(f"Thiếu biến môi trường {key}")

    interval = int(os.getenv("INTERVAL_MIN", 15)) * 60
    while True:
        run_once(args.days)
        if args.once:
            break
        time.sleep(interval)


if __name__ == "__main__":
    main()
