#!/usr/bin/env python3
"""Test a ZKTeco/Ronald Jack connection without uploading attendance data.

Set ZK_IP, and optionally ZK_PORT=4370 and ZK_PASSWORD=0, then run:
    python agent/data/zk_device_check.py

Install the agent dependencies first: pip install -r agent/requirements.txt
"""

import os
import sys

from zk import ZK


def main() -> int:
    ip = os.getenv("ZK_IP")
    if not ip:
        sys.exit("Missing required environment variable ZK_IP.")

    try:
        password = int(os.getenv("ZK_PASSWORD", "0") or 0)
        port = int(os.getenv("ZK_PORT", "4370"))
    except ValueError:
        sys.exit("ZK_PORT and ZK_PASSWORD must be numeric values.")

    device = ZK(
        ip,
        port=port,
        timeout=15,
        password=password,
        force_udp=False,
        ommit_ping=False,
    )
    connection = None
    try:
        connection = device.connect()
        print(f"Connected to attendance device at {ip}:{port}.")
        print(f"Device time: {connection.get_time().isoformat()}")
        print(f"Firmware: {connection.get_firmware_version()}")
        print(f"Serial number: {connection.get_serialnumber()}")
    finally:
        if connection is not None:
            connection.disconnect()

    print("Connection check passed. No data was uploaded or modified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
