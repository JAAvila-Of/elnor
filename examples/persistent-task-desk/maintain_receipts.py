"""Inspect or retire expired receipts in an existing Task Desk SQLite ledger."""
import argparse
import json
from pathlib import Path
import sqlite3

from ledger import RECEIPT_BATCH_LIMIT, maintain_receipts


def main():
    parser = argparse.ArgumentParser(
        allow_abbrev=False,
        description='Preview expired Task Desk receipts, or retire one batch with --apply.')
    parser.add_argument('--db', type=Path, required=True, help='existing Task Desk database')
    parser.add_argument('--scope', required=True, help='workspace to inspect or maintain (the local host uses alice)')
    parser.add_argument('--limit', type=int, default=RECEIPT_BATCH_LIMIT,
                        help=f'receipts per batch, from 1 to {RECEIPT_BATCH_LIMIT} (default: %(default)s)')
    parser.add_argument('--epoch', help='ledger epoch shown by the preview (required with --apply)')
    parser.add_argument('--apply', action='store_true', help='retire one batch and keep its keys reserved')
    args = parser.parse_args()
    try:
        database = args.db.resolve(strict=True)
        report = maintain_receipts(database, args.scope, epoch=args.epoch,
                                   limit=args.limit, apply=args.apply)
    except FileNotFoundError:
        parser.exit(1, f'Database file does not exist: {args.db}\n')
    except (OSError, ValueError, sqlite3.Error) as error:
        parser.exit(1, f'Receipt maintenance failed: {error}\n')
    print(json.dumps(dict(mode='apply' if args.apply else 'preview', database=str(database), **report)))


if __name__ == '__main__':
    main()
