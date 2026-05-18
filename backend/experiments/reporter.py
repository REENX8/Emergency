"""
Export experiment results to CSV (always) and JSON (always). Plot
generation deliberately deferred — matplotlib is a heavy dep that the
current production deploy doesn't need. Add it here if needed:

    import matplotlib.pyplot as plt
"""

from __future__ import annotations

import csv
import io
from typing import Iterable

from .metrics import TrialMetric


CSV_FIELDS = (
    "variable", "value", "algorithm", "repeat",
    "avg_time_s", "p50_time_s", "p95_time_s",
    "nodes_visited", "best_path_hops",
    "exec_time_ms", "reachable_exits",
)


def to_csv(rows: Iterable[TrialMetric]) -> str:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=CSV_FIELDS)
    writer.writeheader()
    for r in rows:
        writer.writerow({k: getattr(r, k) for k in CSV_FIELDS})
    return buf.getvalue()
