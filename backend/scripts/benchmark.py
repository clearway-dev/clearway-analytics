#!/usr/bin/env python3
"""
ClearWay Analytics – endpoint performance benchmark.

Measures end-to-end HTTP response times for the two algorithmically critical
endpoints: pgRouting route calculation and the GeoJSON bbox map endpoint.

Usage (run from backend/):
    python scripts/benchmark.py \\
        --url http://localhost:8000 \\
        --email admin@clearway.test \\
        --password secret \\
        --n 30 \\
        --warmup 3

Environment variable alternative (avoids credentials in shell history):
    BENCHMARK_EMAIL=... BENCHMARK_PASSWORD=... python scripts/benchmark.py

Output:
    Per-scenario table with mean, median, p95, min/max in milliseconds.
    A summary CSV is written to benchmark_results.csv in the working directory.
"""

import argparse
import csv
import os
import statistics
import sys
import time
from dataclasses import dataclass, field

import httpx


# ---------------------------------------------------------------------------
# Scenarios
# ---------------------------------------------------------------------------

SCENARIOS: list[dict] = [
    # --- Routing ---
    {
        "name": "route_short",
        "label": "Krátká trasa (~500 m, centrum Plzně)",
        "method": "POST",
        "path": "/api/v1/routing/route",
        "json": {
            "start_lat": 49.7477,
            "start_lon": 13.3776,
            "end_lat": 49.7495,
            "end_lon": 13.3810,
            "vehicle_width_cm": 200.0,
        },
    },
    {
        "name": "route_long",
        "label": "Dlouhá trasa (~3 km, Plzeň jih–sever)",
        "method": "POST",
        "path": "/api/v1/routing/route",
        "json": {
            "start_lat": 49.7350,
            "start_lon": 13.3650,
            "end_lat": 49.7550,
            "end_lon": 13.3950,
            "vehicle_width_cm": 200.0,
        },
    },
    {
        "name": "route_wide_vehicle",
        "label": "Trasa – široké vozidlo (500 cm), cenová funkce aktivní",
        "method": "POST",
        "path": "/api/v1/routing/route",
        "json": {
            "start_lat": 49.7350,
            "start_lon": 13.3650,
            "end_lat": 49.7550,
            "end_lon": 13.3950,
            "vehicle_width_cm": 500.0,
        },
    },
    # --- BBox map endpoint ---
    {
        "name": "bbox_small",
        "label": "BBox malý (~0.5 km², centrum)",
        "method": "GET",
        "path": "/api/v1/maps/bbox",
        "params": {
            "min_lat": 49.744,
            "min_lon": 13.373,
            "max_lat": 49.751,
            "max_lon": 13.382,
        },
    },
    {
        "name": "bbox_large",
        "label": "BBox velký (~celý dataset Plzně)",
        "method": "GET",
        "path": "/api/v1/maps/bbox",
        "params": {
            "min_lat": 49.72,
            "min_lon": 13.36,
            "max_lat": 49.76,
            "max_lon": 13.41,
        },
    },
]


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def fetch_token(base_url: str, email: str, password: str) -> str:
    """Authenticate and return a Bearer JWT token."""
    resp = httpx.post(
        f"{base_url}/api/v1/auth/login/access-token",
        data={"username": email, "password": password},
        timeout=10,
    )
    if resp.status_code != 200:
        print(f"Authentication failed (HTTP {resp.status_code}): {resp.text}", file=sys.stderr)
        sys.exit(1)
    token = resp.json()["access_token"]
    print(f"Authenticated as {email}")
    return token


# ---------------------------------------------------------------------------
# Measurement
# ---------------------------------------------------------------------------

@dataclass
class ScenarioResult:
    name: str
    label: str
    n: int
    samples_ms: list[float] = field(default_factory=list)

    @property
    def mean(self) -> float:
        return statistics.mean(self.samples_ms)

    @property
    def median(self) -> float:
        return statistics.median(self.samples_ms)

    @property
    def p95(self) -> float:
        sorted_s = sorted(self.samples_ms)
        idx = max(0, int(len(sorted_s) * 0.95) - 1)
        return sorted_s[idx]

    @property
    def minimum(self) -> float:
        return min(self.samples_ms)

    @property
    def maximum(self) -> float:
        return max(self.samples_ms)


def run_scenario(
    client: httpx.Client,
    scenario: dict,
    n: int,
    warmup: int,
) -> ScenarioResult:
    result = ScenarioResult(name=scenario["name"], label=scenario["label"], n=n)
    total = n + warmup

    for i in range(total):
        t0 = time.perf_counter()
        resp = client.request(
            method=scenario["method"],
            url=scenario["path"],
            json=scenario.get("json"),
            params=scenario.get("params"),
        )
        elapsed_ms = (time.perf_counter() - t0) * 1000

        if resp.status_code != 200:
            print(
                f"  WARNING: {scenario['name']} iteration {i} returned HTTP {resp.status_code}",
                file=sys.stderr,
            )
            continue

        if i < warmup:
            print(f"  [warmup {i + 1}/{warmup}] {elapsed_ms:.1f} ms")
        else:
            result.samples_ms.append(elapsed_ms)

    return result


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

_COL = 46

def print_result(r: ScenarioResult) -> None:
    print(f"\n{'─' * 60}")
    print(f"  {r.label}")
    print(f"  scénář: {r.name}   n={r.n}")
    print(f"{'─' * 60}")
    print(f"  {'průměr':<{_COL}} {r.mean:>7.1f} ms")
    print(f"  {'medián':<{_COL}} {r.median:>7.1f} ms")
    print(f"  {'p95':<{_COL}} {r.p95:>7.1f} ms")
    print(f"  {'min / max':<{_COL}} {r.minimum:>7.1f} / {r.maximum:.1f} ms")


def write_csv(results: list[ScenarioResult], path: str) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["scenario", "label", "n", "mean_ms", "median_ms", "p95_ms", "min_ms", "max_ms"])
        for r in results:
            writer.writerow([
                r.name,
                r.label,
                r.n,
                f"{r.mean:.2f}",
                f"{r.median:.2f}",
                f"{r.p95:.2f}",
                f"{r.minimum:.2f}",
                f"{r.maximum:.2f}",
            ])

    raw_path = path.replace(".csv", "_raw.csv")
    with open(raw_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["scenario", "iteration", "ms"])
        for r in results:
            for i, ms in enumerate(r.samples_ms, start=1):
                writer.writerow([r.name, i, f"{ms:.2f}"])

    print(f"\nVýsledky uloženy do: {path}")
    print(f"Raw iterace uloženy do: {raw_path}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="ClearWay Analytics – benchmark key API endpoints",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  # local server\n"
            "  python scripts/benchmark.py --url http://localhost:8000 "
            "--email admin@clearway.test --password secret\n\n"
            "  # production via SSH tunnel (port-forward)\n"
            "  ssh -L 8080:localhost:8000 vandl@77.42.45.121 -N &\n"
            "  python scripts/benchmark.py --url http://localhost:8080 "
            "--email admin@clearway.test --password secret --n 50\n"
        ),
    )
    parser.add_argument("--url", default="http://localhost:8000",
                        help="Základní URL API (bez trailing slash). Default: http://localhost:8000")
    parser.add_argument("--email",
                        default=os.getenv("BENCHMARK_EMAIL"),
                        help="E-mail uživatelského účtu. Alternativně env BENCHMARK_EMAIL.")
    parser.add_argument("--password",
                        default=os.getenv("BENCHMARK_PASSWORD"),
                        help="Heslo. Alternativně env BENCHMARK_PASSWORD.")
    parser.add_argument("--n", type=int, default=30,
                        help="Počet měřených iterací na scénář (default: 30).")
    parser.add_argument("--warmup", type=int, default=3,
                        help="Počet zahřívacích volání (nezapočítávají se, default: 3).")
    parser.add_argument("--csv", default="benchmark_results.csv",
                        help="Cílový soubor pro CSV export (default: benchmark_results.csv).")
    parser.add_argument("--scenarios", nargs="+",
                        metavar="NAME",
                        help="Spustit jen vybrané scénáře (např. --scenarios route_short bbox_small).")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if not args.email or not args.password:
        print(
            "Chyba: zadej --email a --password, nebo nastav env BENCHMARK_EMAIL / BENCHMARK_PASSWORD.",
            file=sys.stderr,
        )
        sys.exit(1)

    scenarios = SCENARIOS
    if args.scenarios:
        names = set(args.scenarios)
        scenarios = [s for s in SCENARIOS if s["name"] in names]
        if not scenarios:
            print(f"Žádný scénář nenalezen. Dostupné: {[s['name'] for s in SCENARIOS]}", file=sys.stderr)
            sys.exit(1)

    token = fetch_token(args.url, args.email, args.password)
    headers = {"Authorization": f"Bearer {token}"}

    results: list[ScenarioResult] = []

    with httpx.Client(base_url=args.url, headers=headers, timeout=30) as client:
        for scenario in scenarios:
            print(f"\n▶  {scenario['label']}  (warmup={args.warmup}, n={args.n})")
            result = run_scenario(client, scenario, n=args.n, warmup=args.warmup)
            results.append(result)
            print_result(result)

    write_csv(results, args.csv)


if __name__ == "__main__":
    main()
