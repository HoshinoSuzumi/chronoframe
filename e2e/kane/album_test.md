---
mode: testing
url: http://localhost:4830/
max_steps: 50
---

# Create an album

## Create the admin account
Click "Get Started".
Type "samrivera" as the Username, "sam@example.com" as the Email, and "Chrono-Test-2026" as both the Password and Confirm Password, then click "Next".
Verify the "Site Info" step is shown.

## Fill in site info and storage
Type "Rivera Gallery" as the Instance Name and click "Next".
Select "Local Storage", type "Local" as the Provider Name, "./data/storage" as the Storage Base Path and "/storage" as the Base URL, then click "Next".
Verify the "Map Service" step is shown.

## Finish setup
Select "MapLibre" and click "Complete Setup".
Click "Go to Dashboard".
Wait for the "Photo statistics" tour to appear and click "Skip tour".
Verify the dashboard shows "Rivera Gallery".

## Create an album
Click "Albums" in the sidebar.
Wait for the "Create an album" tour to appear and click "Skip tour".
Click "Create Album", type "Summer 2026" as the name and "Beach trips" as the description, and save it.
Verify "Summer 2026" is listed on the Albums page.
