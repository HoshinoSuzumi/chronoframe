---
mode: testing
url: http://localhost:4830/
max_steps: 50
---

# Setup wizard

## Create the admin account
Click "Get Started".
Type "alexmorgan" as the Username, "alex@example.com" as the Email, and "Chrono-Test-2026" as both the Password and Confirm Password, then click "Next".
Verify the "Site Info" step is shown.

## Fill in site info and storage
Type "Morgan Photos" as the Instance Name and "Alex Morgan" as the Owner, then click "Next".
Select "Local Storage", type "Local" as the Provider Name, "./data/storage" as the Storage Base Path and "/storage" as the Base URL, then click "Next".
Verify the "Map Service" step is shown.

## Finish setup
Select "MapLibre" and click "Complete Setup".
Click "Go to Dashboard".
Verify the dashboard shows "Morgan Photos", "Total Photos" of 0 and the storage type "Local Storage".
