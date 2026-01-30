import csv
import json
import requests
import io
import os  # <--- Make sure this is imported

# 1. Configuration
DAILY_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbgw-2QiguaDpy7rl9AZUQxtPV3T55TDseLAHBQE3z7ef0niqrasuil7Bg0V-KDzvBLCTfb5BnH-7Z/pub?gid=1952632243&single=true&output=csv"
WEEKLY_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbgw-2QiguaDpy7rl9AZUQxtPV3T55TDseLAHBQE3z7ef0niqrasuil7Bg0V-KDzvBLCTfb5BnH-7Z/pub?gid=0&single=true&output=csv"

# ROBUST PATH HANDLING
# This finds the directory where this script lives, then goes up one level to 'public'
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(BASE_DIR, "..", "public", "data.json")

# ... rest of your code ...

def fetch_csv_as_dict(url):
    print(f"Fetching data from... {url[:60]}...")
    try:
        response = requests.get(url)
        response.raise_for_status()
        # Decode content and parse CSV
        text = response.content.decode('utf-8')
        reader = csv.DictReader(io.StringIO(text))
        
        # Clean data: Remove empty rows and strip whitespace
        data = []
        for row in reader:
            # specifically looking for 'Batch' or 'BATCH' keys, normalize keys if needed
            clean_row = {k.strip(): v.strip() for k, v in row.items() if k}
            if any(clean_row.values()): # Only add if row is not empty
                data.append(clean_row)
        return data
    except Exception as e:
        print(f"Error fetching data: {e}")
        return []

def main():
    print("--- Starting Timetable Update ---")
    
    daily_data = fetch_csv_as_dict(DAILY_SHEET_URL)
    weekly_data = fetch_csv_as_dict(WEEKLY_SHEET_URL)

    full_db = {
        "metadata": {
            "last_updated": "Just now" # You can use datetime.now() here
        },
        "daily": daily_data,
        "weekly": weekly_data
    }

    # Save to JSON
    with open(OUTPUT_FILE, "w", encoding='utf-8') as f:
        json.dump(full_db, f, indent=2)
    
    print(f"✅ Success! Data saved to {OUTPUT_FILE}")
    print("👉 Now: git add . && git commit -m 'update schedule' && git push")

if __name__ == "__main__":
    main()