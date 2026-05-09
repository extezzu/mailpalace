"""CLI entry point: `python -m mailpalace ...` or `mailpalace ...`."""

from __future__ import annotations

import argparse
import sys


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="mailpalace",
        description="Local-first email AI agent.",
    )
    sub = parser.add_subparsers(dest="cmd", required=False)

    serve = sub.add_parser("serve", help="Run the web server + scheduler.")
    serve.add_argument("--host", default=None)
    serve.add_argument("--port", type=int, default=None)
    serve.add_argument(
        "--demo",
        action="store_true",
        help="Serve mock data, skip ingest. Use for UI development.",
    )

    sub.add_parser("migrate", help="Apply database migrations.")
    sub.add_parser("seed", help="Insert demo emails into the local DB.")

    args = parser.parse_args()

    if args.cmd in (None, "serve"):
        from mailpalace.web.server import run_server

        return run_server(
            host=getattr(args, "host", None),
            port=getattr(args, "port", None),
            demo_mode=getattr(args, "demo", False),
        )

    if args.cmd == "migrate":
        from mailpalace.db.migrate import run_migrations

        return run_migrations()

    if args.cmd == "seed":
        from mailpalace.db.seed import seed_demo_data

        return seed_demo_data()

    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
