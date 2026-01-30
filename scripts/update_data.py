import csv
import json
import requests
import io
import os
import datetime
import re

# 1. Configuration
DAILY_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbgw-2QiguaDpy7rl9AZUQxtPV3T55TDseLAHBQE3z7ef0niqrasuil7Bg0V-KDzvBLCTfb5BnH-7Z/pub?gid=1952632243&single=true&output=csv"
WEEKLY_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbgw-2QiguaDpy7rl9AZUQxtPV3T55TDseLAHBQE3z7ef0niqrasuil7Bg0V-KDzvBLCTfb5BnH-7Z/pub?gid=0&single=true&output=csv"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(BASE_DIR, "..", "public", "data.json")

def parse_date(date_str):
    """ Parses dates like "31 Jan, Sat" """
    if not date_str or not isinstance(date_str, str): return None
    clean_str = re.sub(r'(Mon|Tue|Wed|Thu|Fri|Sat|Sun)', '', date_str, flags=re.IGNORECASE).strip()
    clean_str = clean_str.rstrip(',').strip()
    
    try:
        current_year = datetime.datetime.now().year
        # Handle "31 Jan" -> Date object
        dt = datetime.datetime.strptime(f"{clean_str} {current_year}", "%d %b %Y").date()
        return dt
    except ValueError:
        return None

def is_date_relevant(date_obj):
    """ Keep data from -2 days (yesterday) to +10 days (next week) """
    if not date_obj: return False
    today = datetime.date.today()
    delta = (date_obj - today).days
    return -2 <= delta <= 10

def fetch_data(url, sheet_name, date_row_idx):
    print(f"\n--- Fetching {sheet_name} ---")
    try:
        response = requests.get(url)
        response.raise_for_status()
        lines = response.content.decode('utf-8').splitlines()
        reader = csv.reader(lines)
        all_rows = list(reader)

        if len(all_rows) < date_row_idx + 2:
            print("❌ Sheet is empty or too short.")
            return []

        # 1. LOCATE ROWS
        # Date Row is where "31 Jan" lives
        # Time Row is strictly the one immediately below it
        date_row = all_rows[date_row_idx]
        time_row = all_rows[date_row_idx + 1]
        
        # 2. IDENTIFY RELEVANT COLUMNS
        relevant_indices = {0} # Always keep Batch column (Col 0)
        current_active_date = None
        
        for i, cell in enumerate(date_row):
            if i == 0: continue # Skip Batch col
            
            # Check for date
            parsed = parse_date(cell)
            if parsed:
                if is_date_relevant(parsed):
                    current_active_date = parsed
                    relevant_indices.add(i)
                else:
                    current_active_date = None
            
            # If inside a valid date block, keep columns with time/room info
            elif current_active_date and i < len(time_row) and time_row[i].strip():
                relevant_indices.add(i)

        sorted_indices = sorted(list(relevant_indices))
        
        # 3. BUILD CLEAN HEADERS
        final_headers = []
        last_date_str = ""
        
        for i in sorted_indices:
            if i == 0:
                final_headers.append("Batch")
                continue
            
            if date_row[i].strip():
                last_date_str = date_row[i].strip()
            
            time_label = time_row[i].strip()
            # Clean up label
            if "Room" in time_label:
                # E.g., "Room (31 Jan)"
                final_headers.append(f"{time_label} ({last_date_str})")
            else:
                # E.g., "31 Jan - 9:00 AM"
                final_headers.append(f"{last_date_str} - {time_label}")

        print(f"   ℹ️ Keeping {len(final_headers)} columns.")

        # 4. EXTRACT DATA
        data = []
        # Batches start immediately after the Time Row
        start_row = date_row_idx + 2
        
        for row in all_rows[start_row:]:
            if not row or not row[0].strip(): continue
            
            entry = {}
            has_data = False
            
            entry["Batch"] = row[0].strip() # Col 0 is forced as Batch
            
            for idx, header_name in zip(sorted_indices[1:], final_headers[1:]):
                if idx < len(row) and row[idx].strip():
                    entry[header_name] = row[idx].strip()
                    has_data = True
            
            if has_data:
                data.append(entry)

        print(f"✅ Extracted {len(data)} active batches.")
        return data

    except Exception as e:
        print(f"❌ Error in {sheet_name}: {e}")
        return []

def main():
    # DAILY sheet: Dates are in Row 0
    daily = fetch_data(DAILY_SHEET_URL, "Daily", date_row_idx=0)
    
    # WEEKLY sheet: Dates are in Row 1 (based on your raw data logs)
    weekly = fetch_data(WEEKLY_SHEET_URL, "Weekly", date_row_idx=1)

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