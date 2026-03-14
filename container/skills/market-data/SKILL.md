---
name: market-data
description: Fetch real-time stock prices, market indices, news, and Polymarket prediction market flow. Use for portfolio monitoring, market summaries, and prediction market analysis. No API key required.
allowed-tools: Bash(curl:*), Bash(python3:*)
---

# Market Data Tools

All data is fetched via free public APIs using `curl`. Parse responses with `python3`.

---

## Stock Prices — Yahoo Finance

### Full watchlist snapshot

```bash
curl -s "https://query1.finance.yahoo.com/v7/finance/quote?symbols=NVDA,TSLA,AAPL,MSFT,META,AMZN,SPY,QQQ" \
  -H "User-Agent: Mozilla/5.0" | python3 -c "
import json, sys
data = json.load(sys.stdin)
results = data.get('quoteResponse', {}).get('result', [])
for q in results:
    sym = q.get('symbol', '')
    price = q.get('regularMarketPrice', 0)
    chg = q.get('regularMarketChangePercent', 0)
    vol = q.get('regularMarketVolume', 0)
    mktState = q.get('marketState', '')
    prePrice = q.get('preMarketPrice') or q.get('postMarketPrice')
    preChg = q.get('preMarketChangePercent') or q.get('postMarketChangePercent')
    line = f'{sym:6} \${price:.2f}  {chg:+.2f}%  vol:{vol:,}'
    if prePrice:
        line += f'  [{mktState}: \${prePrice:.2f} {preChg:+.2f}%]'
    print(line)
"
```

### Single ticker detail

```bash
TICKER=NVDA
curl -s "https://query1.finance.yahoo.com/v10/finance/quoteSummary/$TICKER?modules=price,summaryDetail" \
  -H "User-Agent: Mozilla/5.0" | python3 -c "
import json, sys
d = json.load(sys.stdin)['quoteSummary']['result'][0]
p = d['price']
print(p['symbol'], p['longName'])
print('Price:', p['regularMarketPrice']['raw'])
print('Change:', p['regularMarketChange']['raw'], f\"({p['regularMarketChangePercent']['raw']*100:.2f}%)\")
print('52w High:', p.get('fiftyTwoWeekHigh', {}).get('raw'))
print('52w Low:', p.get('fiftyTwoWeekLow', {}).get('raw'))
print('Mkt Cap:', p.get('marketCap', {}).get('fmt'))
"
```

### Stock news headlines

```bash
TICKER=NVDA
curl -s "https://query1.finance.yahoo.com/v1/finance/search?q=$TICKER&newsCount=5&quotesCount=0" \
  -H "User-Agent: Mozilla/5.0" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for n in data.get('news', []):
    print('-', n['title'])
    print(' ', n.get('link', ''))
"
```

---

## Polymarket — Prediction Markets

### Top markets by 24h volume

```bash
curl -s "https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=20&order=volumeNum&ascending=false" \
  -H "User-Agent: Mozilla/5.0" | python3 -c "
import json, sys
markets = json.load(sys.stdin)
for m in markets[:10]:
    vol = float(m.get('volume24hr') or m.get('volumeNum') or 0)
    price = m.get('outcomePrices') or []
    print(f\"\${vol:>12,.0f}  {m.get('question', m.get('slug',''))[:70]}\")
    if price:
        print(f'             Prices: {price}')
"
```

### Top market movers (biggest price swings)

```bash
curl -s "https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=50" \
  -H "User-Agent: Mozilla/5.0" | python3 -c "
import json, sys
markets = json.load(sys.stdin)
# Sort by absolute price change where available
movers = []
for m in markets:
    change = float(m.get('competitive') or 0)
    vol = float(m.get('volumeNum') or 0)
    movers.append((vol, m))
movers.sort(reverse=True)
for vol, m in movers[:10]:
    print(f'\${vol:>12,.0f}  {m.get(\"question\", \"\")[:70]}')
    prices = m.get('outcomePrices', [])
    if prices:
        print(f'             {prices}')
"
```

### Search specific Polymarket topic

```bash
QUERY="Trump"
curl -s "https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=20&q=$QUERY" \
  -H "User-Agent: Mozilla/5.0" | python3 -c "
import json, sys, urllib.parse
markets = json.load(sys.stdin)
for m in markets:
    vol = float(m.get('volumeNum') or 0)
    prices = m.get('outcomePrices', [])
    outcomes = m.get('outcomes', [])
    print(f'{m.get(\"question\", \"\")[:80]}')
    print(f'  Volume: \${vol:,.0f}  |  {list(zip(outcomes, prices))}')
    print()
"
```

### Large bets / whale activity

```bash
# Fetch recent large trades from Polymarket CLOB API
curl -s "https://clob.polymarket.com/trades?limit=50" \
  -H "User-Agent: Mozilla/5.0" | python3 -c "
import json, sys
data = json.load(sys.stdin)
trades = data if isinstance(data, list) else data.get('data', [])
# Filter for large trades (> \$1000)
big = [t for t in trades if float(t.get('size', 0)) * float(t.get('price', 0)) > 1000]
for t in sorted(big, key=lambda x: float(x.get('size',0))*float(x.get('price',0)), reverse=True)[:10]:
    notional = float(t.get('size', 0)) * float(t.get('price', 0))
    print(f'\${notional:>10,.0f}  {t.get(\"side\",\"\"):4}  price={t.get(\"price\")}  asset={t.get(\"asset_id\",\"\")[:20]}')
"
```

---

## Market Hours (ET / America/New_York)

- Pre-market: 4:00 AM – 9:30 AM
- Regular session: 9:30 AM – 4:00 PM
- After-hours: 4:00 PM – 8:00 PM
- Market closed: weekends + US holidays

## Watchlist

NVDA, TSLA, AAPL, MSFT, META, AMZN, SPY, QQQ
