"""
Find app "open positions" that have a matching SELL transaction in the combined
Fidelity activity export — these are likely positions that should have been closed
but weren't (missed-close detection).

Usage:
    python find_missed_closes.py leap-tracker-open-positions-YYYY-MM-DD.csv combined_transactions.csv

Matching key: TICKER + STRIKE + EXPIRY + ACCOUNT (derived from Account Number via map)
"""

import sys
import re
import pandas as pd

ACCOUNT_NUMBER_MAP = {
    '119072621': 'IRA',
    '233267024': 'IRA ROTH',
    'X69705290': 'DI Ind',
    '209435910': 'DI IRA',
    'Z40402241': 'Margin',
}

# Matches symbols like " -EWY280121C125" or " -FSLY280121C22.5"
OPTION_SYMBOL_RE = re.compile(r'^\s*-([A-Z]+)(\d{6})([CP])([\d.]+)$')


def parse_option_symbol(symbol):
    """Parse a Fidelity option symbol into (ticker, expiry YYYY-MM-DD, type, strike)."""
    if not isinstance(symbol, str):
        return None
    m = OPTION_SYMBOL_RE.match(symbol)
    if not m:
        return None
    ticker, yymmdd, cp, strike = m.groups()
    yy, mm, dd = yymmdd[0:2], yymmdd[2:4], yymmdd[4:6]
    expiry = f"20{yy}-{mm}-{dd}"
    option_type = "CALL" if cp == "C" else "PUT"
    strike = float(strike)
    if strike == int(strike):
        strike = int(strike)
    return ticker, expiry, option_type, strike


def load_combined_sells(path):
    """Parse combined Fidelity activity CSV, return DataFrame of SELL option transactions."""
    df = pd.read_csv(path)
    df.columns = [c.strip() for c in df.columns]

    # Filter to sells based on Action text
    sell_mask = df['Action'].astype(str).str.contains('SOLD', case=False, na=False)
    sells = df[sell_mask].copy()

    parsed = sells['Symbol'].apply(parse_option_symbol)
    sells = sells[parsed.notna()].copy()
    parsed = parsed[parsed.notna()]

    sells['ticker'] = parsed.apply(lambda x: x[0])
    sells['expiry'] = parsed.apply(lambda x: x[1])
    sells['option_type'] = parsed.apply(lambda x: x[2])
    sells['strike'] = parsed.apply(lambda x: x[3])

    sells['Account Number'] = sells['Account Number'].astype(str).str.strip()
    sells['account'] = sells['Account Number'].map(ACCOUNT_NUMBER_MAP)
    unmapped = sells[sells['account'].isna()]
    if not unmapped.empty:
        print(f"WARNING: {len(unmapped)} sell rows have unrecognized Account Number values:")
        for acct_num in unmapped['Account Number'].unique():
            print(f"  {acct_num}")
        print()

    sells['Run Date'] = pd.to_datetime(sells['Run Date'], format='mixed').dt.strftime('%Y-%m-%d')

    return sells[['ticker', 'strike', 'expiry', 'option_type', 'account',
                   'Account Number', 'Run Date', 'Price', 'Quantity', 'Amount']]


def normalize_open_positions(path):
    df = pd.read_csv(path)
    df.columns = [c.strip() for c in df.columns]

    # Expecting columns: TICKER, INSTRUMENT_TYPE, OPTION_SYMBOL, STRIKE, EXPIRY,
    # ACCOUNT_NAME, ACCOUNT_NUMBER, BUY_DATE, BUY_PRICE, BUY_QUANTITY, BUY_AMOUNT, ...
    df['TICKER'] = df['TICKER'].astype(str).str.strip().str.upper()
    df['EXPIRY'] = pd.to_datetime(df['EXPIRY'], format='mixed').dt.strftime('%Y-%m-%d')
    df['BUY_DATE'] = pd.to_datetime(df['BUY_DATE'], format='mixed').dt.strftime('%Y-%m-%d')
    df['STRIKE'] = pd.to_numeric(df['STRIKE'], errors='coerce')

    # Derive account label from ACCOUNT_NUMBER if present, else fall back to ACCOUNT_NAME
    if 'ACCOUNT_NUMBER' in df.columns:
        acct_num = df['ACCOUNT_NUMBER'].astype(str).str.strip()
        df['account'] = acct_num.map(ACCOUNT_NUMBER_MAP)
        # fallback: if ACCOUNT_NUMBER blank/unmapped, use ACCOUNT_NAME as-is
        df['account'] = df['account'].fillna(df.get('ACCOUNT_NAME', pd.Series(dtype=str)))
    else:
        df['account'] = df.get('ACCOUNT_NAME', pd.Series(dtype=str))

    return df


def main():
    if len(sys.argv) != 3:
        print("Usage: python find_missed_closes.py <open-positions.csv> <combined_transactions.csv>")
        sys.exit(1)

    open_path, combined_path = sys.argv[1], sys.argv[2]

    open_df = normalize_open_positions(open_path)
    sells = load_combined_sells(combined_path)

    print(f"App open positions: {len(open_df)}")
    print(f"Sell transactions found in combined: {len(sells)}")

    matches = []
    for _, row in open_df.iterrows():
        candidates = sells[
            (sells['ticker'] == row['TICKER']) &
            (sells['strike'] == row['STRIKE']) &
            (sells['expiry'] == row['EXPIRY']) &
            (sells['account'] == row['account']) &
            (sells['Run Date'] >= row['BUY_DATE'])
        ]
        for _, sell in candidates.iterrows():
            matches.append({
                'OPEN_ID': row.get('OPEN_ID', ''),
                'TICKER': row['TICKER'],
                'STRIKE': row['STRIKE'],
                'EXPIRY': row['EXPIRY'],
                'ACCOUNT': row['account'],
                'BUY_DATE': row.get('BUY_DATE', ''),
                'BUY_AMOUNT': row.get('BUY_AMOUNT', ''),
                'SELL_DATE': sell['Run Date'],
                'SELL_PRICE': sell['Price'],
                'SELL_QTY': sell['Quantity'],
                'SELL_AMOUNT': sell['Amount'],
            })

    if not matches:
        print("\nNo matches found — no missed closes detected.")
        return

    result = pd.DataFrame(matches)
    print(f"\n{'='*60}")
    print(f"POTENTIAL MISSED CLOSES: {len(result)}")
    print(f"{'='*60}")
    print(result.to_string(index=False))

    out_path = "missed_closes.csv"
    result.to_csv(out_path, index=False)
    print(f"\nSaved to {out_path}")


if __name__ == "__main__":
    main()
