"""Fetch per-gene loss-of-function constraint metrics from the gnomAD browser API.
For every gene symbol in content/registries/genes.json (skipping non-gene
entries such as CNV regions), queries the public GraphQL endpoint and writes
a versioned provenance log to content/generated/gnomad-constraints.json.
Values are hand-applied to genes.json afterwards so each number stays
reviewable; this script is the reproducible record of where they came from.

Stdlib only. Run with: python scripts/fetch_gnomad.py
"""
import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENDPOINT = "https://gnomad.broadinstitute.org/api"
REFERENCE_GENOME = "GRCh38"

QUERY = """query Constraint($symbol: String!) {
  gene(gene_symbol: $symbol, reference_genome: GRCh38) {
    gene_id
    symbol
    gnomad_constraint {
      exp_lof
      obs_lof
      oe_lof
      oe_lof_lower
      oe_lof_upper
      pLI
    }
  }
}"""

SKIP_SYMBOLS = {"DEL22Q11"}  # CNV region, not a single gene


def fetch_one(symbol, retries=4):
    body = json.dumps({"query": QUERY, "variables": {"symbol": symbol}}).encode()
    last_error = "unknown error"
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                ENDPOINT, data=body, headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=60) as res:
                payload = json.loads(res.read().decode("utf-8"))
            if payload.get("errors"):
                return {"symbol": symbol, "error": str(payload["errors"])[:300]}
            gene = (payload.get("data") or {}).get("gene")
            if not gene:
                return {"symbol": symbol, "error": "no gene record returned"}
            return {"symbol": symbol, **gene}
        except urllib.error.HTTPError as exc:
            last_error = f"HTTPError: HTTP Error {exc.code}: {exc.reason}"
            if exc.code not in (429, 500, 502, 503) or attempt == retries - 1:
                return {"symbol": symbol, "error": last_error[:300]}
            time.sleep(5 * (attempt + 1))  # 5s, 10s, 15s backoff; gnomAD rate-limits bursts
        except Exception as exc:  # noqa: BLE001 - record, don't crash the batch
            return {"symbol": symbol, "error": f"{type(exc).__name__}: {exc}"[:300]}
        time.sleep(1)  # be polite between genes even on success
    return {"symbol": symbol, "error": last_error[:300]}


def main():
    genes = json.loads((ROOT / "content/registries/genes.json").read_text(encoding="utf-8"))["genes"]
    symbols = [g["symbol"] for g in genes if g.get("symbol") not in SKIP_SYMBOLS]
    results = []
    for symbol in symbols:
        try:
            results.append(fetch_one(symbol))
        except Exception as exc:  # noqa: BLE001 - record, don't crash the batch
            results.append({"symbol": symbol, "error": f"{type(exc).__name__}: {exc}"[:300]})
    ok = sum(1 for r in results if "gnomad_constraint" in r and r["gnomad_constraint"])
    out = {
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "endpoint": ENDPOINT,
        "referenceGenome": REFERENCE_GENOME,
        "query": " ".join(QUERY.split()),
        "methodPaper": "Karczewski et al., Nature 2020 (PMID 32461654, doi:10.1038/s41586-020-2308-7)",
        "results": results,
    }
    dest = ROOT / "content/generated/gnomad-constraints.json"
    dest.parent.mkdir(exist_ok=True)
    dest.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(f"fetched {ok}/{len(results)} gene constraint records -> {dest.relative_to(ROOT)}")
    for r in results:
        c = r.get("gnomad_constraint") or {}
        print(f"  {r['symbol']}: " + (f"pLI={c.get('pLI')}, oe_lof={c.get('oe_lof')}" if c else f"ERROR {r.get('error')}"))
    if ok == 0:
        raise SystemExit("no constraint records retrieved")


if __name__ == "__main__":
    main()
