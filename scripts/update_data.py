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
    if not date_str or not isinstance(date_str, str) or date_str.strip() == "": return None
    clean_str = re.sub(r'(Mon|Tue|Wed|Thu|Fri|Sat|Sun)', '', date_str, flags=re.IGNORECASE).strip().rstrip(',').strip()
    try:
        now = datetime.datetime.now()
        dt = datetime.datetime.strptime(f"{clean_str} {now.year}", "%d %b %Y").date()
        if (dt - now.date()).days > 180: dt = dt.replace(year=now.year - 1)
        return dt
    except ValueError: return None

def fetch_data(url, sheet_name, date_row_idx):
    print(f"\n--- Fetching {sheet_name} ---")
    try:
        response = requests.get(url)
        response.raise_for_status()
        lines = response.content.decode('utf-8').splitlines()
        all_rows = list(csv.reader(lines))

        if len(all_rows) < date_row_idx + 2: return []

        date_row = all_rows[date_row_idx]
        time_row = all_rows[date_row_idx + 1]
        
        relevant_indices = [0] # Always keep Batch column
        keep_mode = True # We assume the newest dates are on the left
        
        # Scan columns left to right
        for i in range(1, len(date_row)):
            if i >= len(time_row): break
            cell = date_row[i].strip()
            
            if cell:
                parsed = parse_date(cell)
                if parsed and (datetime.date.today() - parsed).days > 35:
                    keep_mode = False # Stop keeping data if it's older than 35 days
                else:
                    keep_mode = True # Keep future dates, today, and recent past
            
            if keep_mode:
                # Keep column if there's a time header OR a date header (handles blanks/holidays gracefully)
                if time_row[i].strip() or cell:
                    relevant_indices.append(i)

        final_headers = ["Batch"]
        current_date = ""
        for i in relevant_indices[1:]:
            if date_row[i].strip(): current_date = date_row[i].strip()
            time_label = time_row[i].strip() if time_row[i].strip() else "Info"
            
            if "Room" in time_label or "Doubt" in time_label:
                final_headers.append(f"{time_label} ({current_date})")
            else:
                final_headers.append(f"{current_date} - {time_label}")

        data = []
        for row in all_rows[date_row_idx + 2:]:
            if not row or not row[0].strip(): continue
            entry = {"Batch": row[0].strip()}
            has_data = False
            for idx, header_name in zip(relevant_indices[1:], final_headers[1:]):
                if idx < len(row) and row[idx].strip():
                    entry[header_name] = row[idx].strip()
                    has_data = True
            if has_data: data.append(entry)

        return data
    except Exception as e:
        print(f"❌ Error: {e}")
        return []

def main():
    daily = fetch_data(DAILY_SHEET_URL, "Daily", 0)
    weekly = fetch_data(WEEKLY_SHEET_URL, "Weekly", 1)
    with open(OUTPUT_FILE, "w", encoding='utf-8') as f:
        json.dump({"metadata": {"last_updated": str(datetime.datetime.now())}, "daily": daily, "weekly": weekly}, f, indent=2)
    print(f"\n💾 Saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()