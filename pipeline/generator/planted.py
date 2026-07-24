"""Planted signal for the synthetic dataset.

These are the KNOWN patterns (ground truth documented in data/planted_patterns.json
after generation). They give NETRA's analytics real structure to discover:

  * SERIAL_CLUSTERS — cross-district serial crimes sharing a modus operandi and a
    common offender/gang. This is what the case-linkage AI is built to surface.
  * BURSTS — short, concentrated spikes so anomaly detection and hotspot mapping
    have genuine events to flag.

NOTE: these are DISTINCT from the secret blind-test patterns that a teammate
injects later (judge-hardening #18). Those are never defined here — the blind
test must be authored by someone other than the AI's builder.

`mo` values override the random modus-operandi slots so every member of a
cluster shares the same MO (the signal), while narrative wording still varies.
Custom strings are allowed and flow straight into the narrative templates.
"""
from datetime import date

# Each cluster: crimes of one sub-head, sharing an MO, spread across districts
# within a date window, tied to a shared offender group.
SERIAL_CLUSTERS = [
    {"id": "SC01", "label": "Shutter-cutting shop burglar",
     "subheadId": 102, "districts": [6, 18, 17], "n": 8,
     "start": date(2023, 2, 6), "days": 120,
     "mo": {"time_phrase": "past midnight", "entry_method": "by cutting the shutter lock",
            "burglary_target": "cash and mobile phones from the counter", "location_type": "a commercial shop"}},
    {"id": "SC02", "label": "Highway two-wheeler theft ring",
     "subheadId": 103, "districts": [1, 6, 2], "n": 9,
     "start": date(2024, 8, 1), "days": 150,
     "mo": {"time_phrase": "late at night", "mv_target": "a black Honda Activa scooter",
            "location_type": "a bus stand"}},
    {"id": "SC03", "label": "Motorcycle chain-snatching pair",
     "subheadId": 104, "districts": [1, 3], "n": 7,
     "start": date(2025, 1, 10), "days": 90,
     "mo": {"time_phrase": "in the evening", "transport": "on a motorcycle",
            "weapon": "a knife", "robbery_target": "a gold chain", "location_type": "a roadside"}},
    {"id": "SC04", "label": "Temple hundi theft crew",
     "subheadId": 101, "districts": [7, 8, 10], "n": 6,
     "start": date(2023, 9, 1), "days": 100,
     "mo": {"time_phrase": "in the early hours", "theft_target": "cash from the offering box",
            "location_type": "the temple premises"}},
    {"id": "SC05", "label": "OTP bank-fraud call centre",
     "subheadId": 601, "districts": [1, 29, 24], "n": 9,
     "start": date(2024, 11, 1), "days": 140,
     "mo": {"cyber_method": "by posing as a customer-care executive", "channel": "over a phone call"}},
    {"id": "SC06", "label": "Fake government-job racket",
     "subheadId": 501, "districts": [24, 22, 23], "n": 7,
     "start": date(2022, 6, 1), "days": 160,
     "mo": {"fraud_method": "by promising a government job", "relationship": "an unknown person"}},
    {"id": "SC07", "label": "Daytime apartment burglar (occupants away)",
     "subheadId": 102, "districts": [1, 2], "n": 6,
     "start": date(2025, 3, 1), "days": 80,
     "mo": {"time_phrase": "during the afternoon", "entry_method": "by breaking open the main door latch",
            "burglary_target": "gold ornaments and cash", "location_type": "an apartment complex"}},
    {"id": "SC08", "label": "Idol theft from rural temples",
     "subheadId": 101, "districts": [15, 9, 16], "n": 6,
     "start": date(2022, 12, 1), "days": 120,
     "mo": {"time_phrase": "past midnight", "theft_target": "an antique idol",
            "location_type": "the temple premises"}},
    {"id": "SC09", "label": "Ganja transport corridor gang",
     "subheadId": 801, "districts": [12, 14, 13], "n": 7,
     "start": date(2024, 2, 1), "days": 150,
     "mo": {"time_phrase": "late at night", "location_type": "a highway check-post"}},
    {"id": "SC10", "label": "Crop-loan document forgery ring",
     "subheadId": 502, "districts": [19, 21, 22], "n": 6,
     "start": date(2023, 5, 1), "days": 130,
     "mo": {"fraud_method": "by promising a government job"}},
    {"id": "SC11", "label": "ATM-kiosk cash theft crew",
     "subheadId": 102, "districts": [28, 29, 27], "n": 7,
     "start": date(2025, 2, 1), "days": 90,
     "mo": {"time_phrase": "around midnight", "entry_method": "by drilling out the lock",
            "burglary_target": "cash from the ATM cassette", "location_type": "an ATM kiosk"}},
    {"id": "SC12", "label": "Farmhouse dacoity gang",
     "subheadId": 105, "districts": [22, 24], "n": 5,
     "start": date(2024, 6, 1), "days": 110,
     "mo": {"time_phrase": "past midnight", "gang_size": "five to six armed persons",
            "weapon": "a machete (longu)", "burglary_target": "gold, cash and silverware",
            "location_type": "a farmhouse"}},
]

# Concentrated spikes for anomaly detection / hotspot mapping.
BURSTS = [
    {"id": "B01", "districtId": 1,  "subheadId": 103, "start": date(2025, 4, 1), "days": 60, "count": 140, "note": "MV-theft surge, Whitefield belt"},
    {"id": "B02", "districtId": 1,  "subheadId": 601, "start": date(2025, 1, 1), "days": 90, "count": 120, "note": "cyber-fraud spike, Bengaluru"},
    {"id": "B03", "districtId": 24, "subheadId": 102, "start": date(2024, 10, 1), "days": 45, "count": 70,  "note": "burglary cluster, Kalaburagi"},
    {"id": "B04", "districtId": 7,  "subheadId": 104, "start": date(2025, 5, 1), "days": 40, "count": 55,  "note": "chain-snatching spike, Mysuru"},
]
