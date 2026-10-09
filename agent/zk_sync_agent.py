#!/usr/bin/env python3
"""ZKTeco / Ronald Jack -> Supabase attendance sync agent (V2).

Demo mode reads sample attendance from a JSON file. Real-device mode reads
fingerprint punches over the local network and requires ZK_IP.

Environment variables:
  ZK_IP                  required outside demo mode
  ZK_PORT=4370
  ZK_PASSWORD=0
  DEVICE_ID=ZK-01
  SUPABASE_URL           required
  SUPABASE_SERVICE_KEY   required
  SYNC_DAYS=3            reread the last N days to catch missed punches
  INTERVAL_MIN=15        polling interval
  TZ_NAME=Asia/Ho_Chi_Minh
  CACHE_DB=outbox.db
  DEMO_FILE=web/data/demo_attendance_october_2026.json
"""

import argparse
import json
import logging
import os
import sqlite3
import sys
import time
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from supabase import create_client
from zk import ZK

log = logging.getLogger("zk-agent")
TZ = ZoneInfo(os.getenv("TZ_NAME", "Asia/Ho_Chi_Minh"))
DEVICE_ID = os.getenv("DEVICE_ID", "ZK-01")
DOUBLE_PUNCH = timedelta(minutes=1)
MAX_PAIRS = 2


def retry(fn, tries=4, base=2.0, what="operation"):
    for i in range(1, tries + 1):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001
            if i == tries:
                raise
            wait = base ** i
            log.warning("%s failed (%s); retry %d in %.0fs", what, exc, i, wait)
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
        password=int(os.getenv("ZK_PASSWORD", "0") or 0),
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


def load_demo_events(file_path: str | None, since: datetime):
    default_file = Path(__file__).resolve().parent.parent / "web" / "data" / "demo_attendance_october_2026.json"
    demo_file = Path(file_path) if file_path else default_file
    if not demo_file.exists():
        return []

    try:
        rows = json.loads(demo_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        log.warning("Could not read demo file %s", demo_file)
        return []

    events = []
    for row in rows or []:
        for key in ("check_in_1", "check_out_1", "check_in_2", "check_out_2"):
            raw = row.get(key)
            if not raw:
                continue
            try:
                ts = datetime.fromisoformat(f"{row['work_date']}T{raw}").replace(tzinfo=TZ)
            except ValueError:
                continue
            if ts < since:
                continue
            events.append(
                {
                    "pin": str(row.get("emp_code") or row.get("device_pin") or "unknown"),
                    "timestamp": ts,
                    "verify_type": "demo",
                    "raw_status": "DEMO",
                }
            )
    return events


def dedupe_punches(items):
    """Keep chronological order and remove consecutive duplicate punches <= 1 minute apart."""
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
                "%s on %s has %d valid punches; only the first four are paired. Raw logs are retained.",
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
        what="load employee list",
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
            what="upload raw attendance",
        )
        db.executemany(
            "delete from punch_outbox where device_id=? and pin=? and punched_at=?",
            delete_keys,
        )
        db.commit()
        sent += len(payload)

    if unknown:
        log.warning("Attendance PINs are not assigned to users.device_pin: %s", sorted(unknown))
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
            what="upload attendance summary",
        )

    if unknown:
        log.warning("Could not create attendance summary for PINs: %s", sorted(unknown))
    return len(payload)


def run_once(days: int, demo_file: str | None = None, demo: bool = False):
    db = open_cache()
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    since = datetime.now(TZ) - timedelta(days=days)
    events = []

    try:
        if demo:
            events = load_demo_events(demo_file, since)
            log.info("Demo mode: read %d raw punches from %s", len(events), demo_file or "default demo file")
        else:
            events = retry(lambda: read_device(since), what="read attendance device")
            cache_punches(
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
            log.info("Read %d raw punches from device", len(events))
    except Exception as exc:  # noqa: BLE001
        log.error("Could not read attendance device: %s", exc)
        events = []

    try:
        pin_map = load_pin_map(sb)
        sent = push_raw(db, sb, pin_map)
        log.info("Uploaded %d raw punches to Supabase", sent)
    except Exception as exc:  # noqa: BLE001
        log.error("Raw punch upload failed: %s", exc)
        pin_map = {}

    if events and pin_map:
        grouped = defaultdict(list)
        for e in events:
            grouped[(e["pin"], e["timestamp"].date().isoformat())].append(e["timestamp"])
        try:
            count = push_summaries(sb, grouped, pin_map)
            log.info("Updated %d attendance summaries", count)
        except Exception as exc:  # noqa: BLE001
            log.error("Attendance summary upload failed: %s", exc)

    left = db.execute("select count(*) from punch_outbox").fetchone()[0]
    if left:
        log.info("Outbox has %d pending raw punches; they will be retried", left)
    db.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--days", type=int, default=int(os.getenv("SYNC_DAYS", 3)))
    ap.add_argument("--demo", action="store_true", help="Read sample punches instead of connecting to a device")
    ap.add_argument("--demo-file", default=os.getenv("DEMO_FILE"), help="Optional path to a demo JSON file")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if not args.demo:
        for key in ("ZK_IP", "SUPABASE_URL", "SUPABASE_SERVICE_KEY"):
            if not os.getenv(key):
                sys.exit(f"Missing required environment variable {key}")

    interval = int(os.getenv("INTERVAL_MIN", 15)) * 60
    while True:
        run_once(args.days, args.demo_file, args.demo)
        if args.once:
            break
        time.sleep(interval)


if __name__ == "__main__":
    main()
