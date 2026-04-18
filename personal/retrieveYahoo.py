import requests

def get_price(ticker, date_str):
    # date_str format: YYYY-MM-DD
    import time
    from datetime import datetime
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    period1 = int(time.mktime(dt.timetuple()))
    period2 = period1 + 86400
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&period1={period1}&period2={period2}"
    r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})
    data = r.json()
    closes = data["chart"]["result"][0]["indicators"]["quote"][0]["close"]
    return closes[0]

print("QQQ Apr 1:", get_price("QQQ", "2026-04-01"))
print("SPY Apr 1:", get_price("SPY", "2026-04-01"))
