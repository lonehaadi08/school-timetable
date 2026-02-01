import csv
import json
import requests
import os
import datetime
import re

# 1. Configuration
DAILY_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbgw-2QiguaDpy7rl9AZUQxtPV3T55TDseLAHBQE3z7ef0niqrasuil7Bg0V-KDzvBLCTfb5BnH-7Z/pub?gid=1952632243&single=true&output=csv"
WEEKLY_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbgw-2QiguaDpy7rl9AZUQxtPV3T55TDseLAHBQE3z7ef0niqrasuil7Bg0V-KDzvBLCTfb5BnH-7Z/pub?gid=0&single=true&output=csv"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(BASE_DIR, "..", "public", "data.json")

def parse_date(date_str):
    if not date_str or not isinstance(date_str, str): return None
    # Remove day names to parse strictly the date part
    clean_str = re.sub(r'(Mon|Tue|Wed|Thu|Fri|Sat|Sun)', '', date_str, flags=re.IGNORECASE).strip()
    clean_str = clean_str.rstrip(',').strip()
    
    try:
        now = datetime.datetime.now()
        current_year = now.year
        
        # Parse "31 Jan" -> Date object with current year first
        dt = datetime.datetime.strptime(f"{clean_str} {current_year}", "%d %b %Y").date()
        
        # SMART YEAR FIX:
        # If we are in Jan 2026, and the sheet says "Dec", it likely means Dec 2025 (History).
        # Logic: If the date is more than 6 months in the future, assume it belongs to last year.
        if (dt - now.date()).days > 180:
            dt = dt.replace(year=current_year - 1)
        
        return dt
    except ValueError:
        return None

def fetch_data(url, sheet_name, date_row_idx):
    print(f"\n--- Fetching {sheet_name} ---")
    try:
        response = requests.get(url)
        response.raise_for_status()
        lines = response.content.decode('utf-8').splitlines()
        reader = csv.reader(lines)
        all_rows = list(reader)

        if len(all_rows) < date_row_idx + 2:
            return []

        date_row = all_rows[date_row_idx]
        time_row = all_rows[date_row_idx + 1]
        
        # --- LOGIC: FETCH HISTORY + FUTURE (200 Columns) ---
        relevant_indices = {0} # Always keep Batch column
        found_dates = []
        
        DESIRED_DAYS_COUNT = 200  # Requested limit
        HISTORY_DAYS = 35         # How far back to look (1 month + buffer)
        
        current_active_date = None
        
        # Start looking from 35 days ago
        start_date = datetime.date.today() - datetime.timedelta(days=HISTORY_DAYS)

        for i, cell in enumerate(date_row):
            if i == 0: continue 
            
            parsed = parse_date(cell)
            if parsed:
                # If date is newer than our history limit (e.g. newer than Dec 25)
                if parsed >= start_date:
                    if len(found_dates) < DESIRED_DAYS_COUNT:
                        current_active_date = parsed
                        relevant_indices.add(i)
                        found_dates.append(parsed)
                    else:
                        current_active_date = None # Stop collecting after limit
                else:
                    current_active_date = None # Date is too old (older than 1 month)
            
            # If we are "under" a valid date (handling merged cells)
            elif current_active_date and i < len(time_row) and time_row[i].strip():
                relevant_indices.add(i)

        sorted_indices = sorted(list(relevant_indices))
        
        # Build Headers
        final_headers = []
        last_date_str = ""
        for i in sorted_indices:
            if i == 0:
                final_headers.append("Batch")
                continue
            
            if date_row[i].strip():
                last_date_str = date_row[i].strip()
            
            time_label = time_row[i].strip()
            if "Room" in time_label or "Doubt" in time_label:
                final_headers.append(f"{time_label} ({last_date_str})")
            else:
                final_headers.append(f"{last_date_str} - {time_label}")

        print(f"   ℹ️ Keeping {len(found_dates)} distinct days (History + Future).")

        # Extract Data
        data = []
        start_row = date_row_idx + 2
        for row in all_rows[start_row:]:
            if not row or not row[0].strip(): continue
            entry = {}
            has_data = False
            entry["Batch"] = row[0].strip()
            
            for idx, header_name in zip(sorted_indices[1:], final_headers[1:]):
                if idx < len(row) and row[idx].strip():
                    entry[header_name] = row[idx].strip()
                    has_data = True
            
            if has_data:
                data.append(entry)

        return data

    except Exception as e:
        print(f"❌ Error: {e}")
        return []

def main():
    daily = fetch_data(DAILY_SHEET_URL, "Daily", 0)
    weekly = fetch_data(WEEKLY_SHEET_URL, "Weekly", 1)

    full_db = {
        "metadata": {"last_updated": str(datetime.datetime.now())},
        "daily": daily,
        "weekly": weekly
    }

    with open(OUTPUT_FILE, "w", encoding='utf-8') as f:
        json.dump(full_db, f, indent=2)
    print(f"\n💾 Saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()