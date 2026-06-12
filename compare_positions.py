"""
Compare LEAP Tracker exported CSVs against the trade_transactions.xlsx master.

Usage:
    python compare_positions.py open-positions.csv closed-positions.csv trade_transactions.xlsx

Matching key: TICKER + BUY_DATE + BUY_QUANTITY
Amount tolerance: $1.00 on BUY_AMOUNT (and SELL_AMOUNT for closed)
"""

import sys
import pandas as pd

AMOUNT_TOL = 1.00


def normalize(df, ticker_col="TICKER", date_col="BUY_DATE", qty_col="BUY_QUANTITY"):
    df = df.copy()
    df[ticker_col] = df[ticker_col].astype(str).str.strip().str.upper()
    df[date_col] = pd.to_datetime(df[date_col], format="mixed").dt.strftime("%Y-%m-%d")
    df[qty_col] = pd.to_numeric(df[qty_col], errors="coerce")
    return df


def build_key(row, ticker_col="TICKER", date_col="BUY_DATE", qty_col="BUY_QUANTITY"):
    return (row[ticker_col], row[date_col], row[qty_col])


def compare_set(app_df, master_df, amount_col, label, ticker_col="TICKER",
                 date_col="BUY_DATE", qty_col="BUY_QUANTITY"):
    app_df = normalize(app_df, ticker_col, date_col, qty_col)
    master_df = normalize(master_df, ticker_col, date_col, qty_col)

    app_df["_key"] = app_df.apply(lambda r: build_key(r, ticker_col, date_col, qty_col), axis=1)
    master_df["_key"] = master_df.apply(lambda r: build_key(r, ticker_col, date_col, qty_col), axis=1)

    app_keys = set(app_df["_key"])
    master_keys = set(master_df["_key"])

    only_in_app = app_keys - master_keys
    only_in_master = master_keys - app_keys
    common = app_keys & master_keys

    print(f"\n{'='*60}")
    print(f"{label}")
    print(f"{'='*60}")
    print(f"App rows: {len(app_df)}  Master rows: {len(master_df)}")
    print(f"Matched keys: {len(common)}")
    print(f"In app, not in master: {len(only_in_app)}")
    print(f"In master, not in app: {len(only_in_master)}")

    if only_in_app:
        print(f"\n--- In app CSV but NOT in master ({label}) ---")
        sub = app_df[app_df["_key"].isin(only_in_app)]
        print(sub[[ticker_col, date_col, qty_col, amount_col]].to_string(index=False))

    if only_in_master:
        print(f"\n--- In master but NOT in app CSV ({label}) ---")
        sub = master_df[master_df["_key"].isin(only_in_master)]
        print(sub[[ticker_col, date_col, qty_col, amount_col]].to_string(index=False))

    # Amount mismatches on matched keys
    amount_mismatches = []
    for key in common:
        app_row = app_df[app_df["_key"] == key].iloc[0]
        master_row = master_df[master_df["_key"] == key].iloc[0]
        app_amt = app_row[amount_col]
        master_amt = master_row[amount_col]
        if pd.isna(app_amt) or pd.isna(master_amt):
            continue
        if abs(app_amt - master_amt) > AMOUNT_TOL:
            amount_mismatches.append((key, app_amt, master_amt, app_amt - master_amt))

    if amount_mismatches:
        print(f"\n--- {amount_col} mismatches (> ${AMOUNT_TOL} tolerance) ---")
        for key, app_amt, master_amt, diff in amount_mismatches:
            print(f"  {key}: app={app_amt:.2f}  master={master_amt:.2f}  diff={diff:+.2f}")
    else:
        print(f"\nNo {amount_col} mismatches beyond ${AMOUNT_TOL} tolerance.")


def compare_grouped(app_df, master_df, label, ticker_col="TICKER", date_col="BUY_DATE",
                     qty_col="BUY_QUANTITY", amount_col="BUY_AMOUNT"):
    app_df = normalize(app_df, ticker_col, date_col, qty_col)
    master_df = normalize(master_df, ticker_col, date_col, qty_col)

    app_grp = app_df.groupby([ticker_col, date_col]).agg(
        **{qty_col: (qty_col, "sum"), amount_col: (amount_col, "sum")}
    ).reset_index()
    master_grp = master_df.groupby([ticker_col, date_col]).agg(
        **{qty_col: (qty_col, "sum"), amount_col: (amount_col, "sum")}
    ).reset_index()

    app_grp["_key"] = list(zip(app_grp[ticker_col], app_grp[date_col]))
    master_grp["_key"] = list(zip(master_grp[ticker_col], master_grp[date_col]))

    app_keys = set(app_grp["_key"])
    master_keys = set(master_grp["_key"])

    only_in_app = app_keys - master_keys
    only_in_master = master_keys - app_keys
    common = app_keys & master_keys

    # --- Fuzzy date pass (+/- 1 day) on remaining unmatched keys ---
    fuzzy_matches = []
    remaining_app = set(only_in_app)
    remaining_master = set(only_in_master)

    for a_key in list(remaining_app):
        ticker, date_str = a_key
        date = pd.Timestamp(date_str)
        for delta in (-1, 1):
            candidate = (ticker, (date + pd.Timedelta(days=delta)).strftime("%Y-%m-%d"))
            if candidate in remaining_master:
                fuzzy_matches.append((a_key, candidate))
                remaining_app.discard(a_key)
                remaining_master.discard(candidate)
                break

    print(f"\n{'='*60}")
    print(f"{label} - GROUPED BY TICKER + BUY_DATE")
    print(f"{'='*60}")
    print(f"App groups: {len(app_grp)}  Master groups: {len(master_grp)}")
    print(f"Matched (exact date): {len(common)}")
    print(f"Matched (fuzzy +/-1 day): {len(fuzzy_matches)}")
    print(f"In app, not in master (after fuzzy): {len(remaining_app)}")
    print(f"In master, not in app (after fuzzy): {len(remaining_master)}")

    if fuzzy_matches:
        print(f"\n--- Fuzzy date matches (+/- 1 day) ---")
        for a_key, m_key in fuzzy_matches:
            a = app_grp[app_grp["_key"] == a_key].iloc[0]
            m = master_grp[master_grp["_key"] == m_key].iloc[0]
            qty_diff = a[qty_col] - m[qty_col]
            amt_diff = a[amount_col] - m[amount_col]
            flag = ""
            if qty_diff != 0 or abs(amt_diff) > AMOUNT_TOL:
                flag = "  <-- still differs"
            print(f"  {a_key} (app) <-> {m_key} (master): "
                  f"app_qty={a[qty_col]} master_qty={m[qty_col]}  "
                  f"app_amt={a[amount_col]:.2f} master_amt={m[amount_col]:.2f}{flag}")

    if remaining_app:
        print(f"\n--- In app but NOT in master (grouped, after fuzzy) ---")
        sub = app_grp[app_grp["_key"].isin(remaining_app)]
        print(sub[[ticker_col, date_col, qty_col, amount_col]].to_string(index=False))

    if remaining_master:
        print(f"\n--- In master but NOT in app (grouped, after fuzzy) ---")
        sub = master_grp[master_grp["_key"].isin(remaining_master)]
        print(sub[[ticker_col, date_col, qty_col, amount_col]].to_string(index=False))

    qty_mismatches = []
    amount_mismatches = []
    for key in common:
        a = app_grp[app_grp["_key"] == key].iloc[0]
        m = master_grp[master_grp["_key"] == key].iloc[0]
        if a[qty_col] != m[qty_col]:
            qty_mismatches.append((key, a[qty_col], m[qty_col]))
        if abs(a[amount_col] - m[amount_col]) > AMOUNT_TOL:
            amount_mismatches.append((key, a[amount_col], m[amount_col], a[amount_col] - m[amount_col]))

    if qty_mismatches:
        print(f"\n--- Grouped BUY_QUANTITY mismatches (exact-date matches) ---")
        for key, a_qty, m_qty in qty_mismatches:
            print(f"  {key}: app_qty={a_qty}  master_qty={m_qty}")

    if amount_mismatches:
        print(f"\n--- Grouped {amount_col} mismatches (exact-date matches, > ${AMOUNT_TOL} tolerance) ---")
        for key, a_amt, m_amt, diff in amount_mismatches:
            print(f"  {key}: app={a_amt:.2f}  master={m_amt:.2f}  diff={diff:+.2f}")
    else:
        print(f"\nNo grouped {amount_col} mismatches (exact-date matches) beyond ${AMOUNT_TOL} tolerance.")


def main():
    if len(sys.argv) != 4:
        print("Usage: python compare_positions.py <open-positions.csv> <closed-positions.csv> <trade_transactions.xlsx>")
        sys.exit(1)

    open_csv, closed_csv, master_xlsx = sys.argv[1], sys.argv[2], sys.argv[3]

    open_app = pd.read_csv(open_csv)
    closed_app = pd.read_csv(closed_csv)

    open_master = pd.read_excel(master_xlsx, sheet_name="Open Positions")
    closed_master = pd.read_excel(master_xlsx, sheet_name="Closed Positions")

    open_master = open_master[open_master["INSTRUMENT_TYPE"] == "LEAP_CALL"]
    closed_master = closed_master[closed_master["INSTRUMENT_TYPE"] == "LEAP_CALL"]

    compare_set(open_app, open_master, "BUY_AMOUNT", "OPEN POSITIONS")
    compare_set(closed_app, closed_master, "BUY_AMOUNT", "CLOSED POSITIONS")

    compare_grouped(open_app, open_master, "OPEN POSITIONS")
    compare_grouped(closed_app, closed_master, "CLOSED POSITIONS")

    # Also check sell side for closed positions, keyed the same way
    print(f"\n{'='*60}")
    print("CLOSED POSITIONS - SELL_AMOUNT check (same key)")
    print(f"{'='*60}")
    app_df = normalize(closed_app)
    master_df = normalize(closed_master)
    app_df["_key"] = app_df.apply(build_key, axis=1)
    master_df["_key"] = master_df.apply(build_key, axis=1)
    common = set(app_df["_key"]) & set(master_df["_key"])

    sell_mismatches = []
    for key in common:
        a = app_df[app_df["_key"] == key].iloc[0]
        m = master_df[master_df["_key"] == key].iloc[0]
        if pd.isna(a["SELL_AMOUNT"]) or pd.isna(m["SELL_AMOUNT"]):
            continue
        if abs(a["SELL_AMOUNT"] - m["SELL_AMOUNT"]) > AMOUNT_TOL:
            sell_mismatches.append((key, a["SELL_AMOUNT"], m["SELL_AMOUNT"], a["SELL_AMOUNT"] - m["SELL_AMOUNT"]))

    if sell_mismatches:
        for key, a_amt, m_amt, diff in sell_mismatches:
            print(f"  {key}: app={a_amt:.2f}  master={m_amt:.2f}  diff={diff:+.2f}")
    else:
        print(f"No SELL_AMOUNT mismatches beyond ${AMOUNT_TOL} tolerance.")


if __name__ == "__main__":
    main()
