#!/usr/bin/env python3
"""devd.py — persistent dev-server daemon for PRIME (R56).

The disabled R56 cron job's runbook references this file; it was lost in a
container reboot. It relaunches `bun run dev` DETACHED (setsid — the child
leaves the caller's process group, so it survives both the caller's exit and
the platform's process-reap-at-tool-call-boundary regime) and waits for HTTP
200 before exiting.

Usage:  python3 /home/z/my-project/devd.py
Exit:   0 — server confirmed up (or already up) on :3000
        1 — server did not come up within 60s (check dev.log; a container
            reboot may have lost @next/swc-linux-x64-gnu → run `bun install`)
"""

import os
import subprocess
import sys
import time
import urllib.request

PROJECT = "/home/z/my-project"
LOG = os.path.join(PROJECT, "dev.log")


def alive() -> bool:
    try:
        urllib.request.urlopen("http://localhost:3000/", timeout=2)
        return True
    except Exception:
        return False


def spawn() -> None:
    if alive():
        print("dev server already up on :3000")
        return
    with open(LOG, "ab") as log:
        # start_new_session=True → setsid: the classic double-fork detachment
        # without needing a second fork (the child can never be reaped as part
        # of this caller's process group).
        subprocess.Popen(
            ["bun", "run", "dev"],
            cwd=PROJECT,
            stdout=log,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
        )


if __name__ == "__main__":
    spawn()
    for _ in range(60):
        if alive():
            print("dev server up on :3000")
            sys.exit(0)
        time.sleep(1)
    print("dev server failed to come up within 60s — see dev.log", file=sys.stderr)
    sys.exit(1)
