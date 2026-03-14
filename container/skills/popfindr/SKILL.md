---
name: popfindr
description: Check PopFindr for Pokemon card stock at retail stores near Boston, MA. Use agent-browser to search popfindr.com and report in-stock locations. Only alert the user when stock is actually found.
allowed-tools: Bash(agent-browser:*), Bash(curl:*), Bash(python3:*)
---

# PopFindr — Pokemon Stock Tracker

Check PopFindr (popfindr.com) for Pokemon card availability near Boston, MA.

## Search Instructions

### Step 1 — Try the PopFindr API first (fastest)

PopFindr exposes a JSON search endpoint. Try this before using the browser:

```bash
# Search for Pokemon near Boston (lat/lng for Boston, MA)
curl -s "https://www.popfindr.com/api/products/search?q=pokemon&lat=42.3601&lng=-71.0589&radius=25&limit=50" \
  -H "User-Agent: Mozilla/5.0" \
  -H "Accept: application/json" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(json.dumps(data, indent=2)[:3000])
" 2>&1
```

If that returns valid store/stock data, parse and report it. If it returns an error or HTML, proceed to Step 2.

### Step 2 — Browser scraping

Use agent-browser to search PopFindr directly:

```bash
agent-browser open "https://www.popfindr.com"
agent-browser snapshot -i
```

Look for a search box and location field. Fill them in:
- Search term: `pokemon`
- Location: `Boston, MA` or ZIP `02101`
- Radius: 25 miles

Submit the search, wait for results, then snapshot to extract store names and stock status.

### Step 3 — Extract results

After getting results (via API or browser), identify:
- Store name and address
- Product name / set name
- Stock status (In Stock / Low Stock / Out of Stock)
- Last updated timestamp

### Step 4 — Report format

**Only send an alert if at least one item is IN STOCK or LOW STOCK.**

If nothing is in stock, save a note to `/workspace/group/popfindr-last-check.txt` with the timestamp and "no stock found" — do NOT send a message.

If stock IS found, send:

```
🎴 Pokemon Stock Alert — Boston

• [Store name] ([distance] mi)
  [Product] — IN STOCK
  [Address]

• [Store name] ([distance] mi)
  [Product] — LOW STOCK
  [Address]

Last checked: [time]
```

Use *bold* for store names. Include only in-stock and low-stock results, skip anything out of stock.

## Location Reference

- Boston, MA center: lat 42.3601, lng -71.0589
- ZIP codes to cover: 02101–02137, 02163, 02199
- Search radius: 25 miles (covers Boston metro + suburbs)

## Retailers to Check

Target, Walmart, GameStop, and all other retailers PopFindr tracks.

## Previous Stock Cache

Save found stock to `/workspace/group/popfindr-stock.json` so you can detect changes between checks and highlight *newly* in-stock items.
