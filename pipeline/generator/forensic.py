"""Deterministic forensic / physical-evidence enrichment for synthetic FIRs.

Seeded by the crime number so every consumer (dataset, crime-dna, mock seed) derives
the SAME forensic profile for a given case — stable and reproducible. Produces the
evidence layer a real investigation carries (weapon/tools, recovered evidence, latent
prints + NAFIS status, seizure memo + chain-of-custody, FSL reference) so the
court-ready report and the case dossier read authentically.

⚠️ Synthetic prototype data — realistic in shape, never real evidence. Carries NO
caste/religion/occupation (ethics spine): forensic markers are about the crime, not identity.
"""
import hashlib
import random

# crimeSubHead → forensic category
_VIOLENT = {"Robbery", "Murder", "Hurt (Simple)", "Grievous Hurt",
            "Assault on Woman (Modesty)", "Rioting / Unlawful Assembly"}
_CYBER = {"Cheating & Fraud", "Online Financial Fraud"}
_CONTRABAND = {"NDPS (Drugs)", "Excise Act"}
# everything else (theft / burglary / MV theft / cruelty …) = property/entry

_TOOLS = {
    "entry": ["cutter / bolt-cutter", "screwdriver", "iron rod", "duplicate key", "gas cutter", "crowbar"],
    "violent": ["kitchen knife", "wooden club", "country-made pistol", "chopper / machete", "iron rod", "broken bottle"],
    "cyber": ["mobile handset", "pre-activated SIM cards", "laptop", "cloned debit card", "fake ID documents"],
    "contraband": ["weighing scale", "packing material", "two-wheeler used for transport"],
}
_WEAPON = {
    "violent": ["Kitchen knife (single-edged)", "Country-made 7.65mm pistol", "Wooden club",
                "Chopper / long knife", "Iron rod", "Broken glass bottle"],
}
_EVIDENCE = {
    "entry": ["CCTV footage (approach lane)", "Chance fingerprints on window grille",
              "Footwear impression at rear wall", "Toolmark on shutter lock", "Recovered stolen property"],
    "violent": ["CCTV footage", "Bloodstained clothing", "Weapon of offence", "Chance fingerprints",
                "Biological sample (victim/suspect)", "Recovered stolen property"],
    "cyber": ["Bank transaction trail", "Mobile CDR + IMEI", "Screenshots of chat",
              "Mule-account KYC records", "Recovered handset"],
    "contraband": ["Seized contraband (weighed & sampled)", "Weighing scale", "Packing material", "CCTV footage"],
}


def _cat(subhead: str) -> str:
    if subhead in _VIOLENT:
        return "violent"
    if subhead in _CYBER:
        return "cyber"
    if subhead in _CONTRABAND:
        return "contraband"
    return "entry"


def _rng(crime_no: str) -> random.Random:
    h = int(hashlib.md5(str(crime_no).encode()).hexdigest()[:8], 16)
    return random.Random(h)


def forensic_for(crime_no: str, subhead: str, gravity: str,
                 solved: bool, io_name: str = "", accused_name: str = "",
                 district: str = "") -> dict:
    """Return a deterministic forensic/evidence profile for one FIR."""
    r = _rng(crime_no)
    cat = _cat(subhead)
    heinous = str(gravity).lower().startswith("hein")
    yy = str(crime_no)[9:13] if len(str(crime_no)) >= 13 else "2024"
    stn = str(crime_no)[5:9] if len(str(crime_no)) >= 9 else "0001"
    n = r.randint(11, 486)

    tools = r.sample(_TOOLS[cat], k=min(2, len(_TOOLS[cat])))
    weapon = r.choice(_WEAPON["violent"]) if cat == "violent" else "None — non-violent entry"
    evidence = r.sample(_EVIDENCE[cat], k=min(3, len(_EVIDENCE[cat])))

    # Fingerprint / NAFIS status — kept CONSISTENT with the evidence actually collected.
    has_print = any("fingerprint" in e.lower() for e in evidence)
    if cat == "cyber":
        fingerprint = "N/A — digital case (device & CDR forensics instead)"
    elif not has_print:
        fingerprint = "No ridge-worthy chance prints recovered from scene"
    elif solved and accused_name:
        fingerprint = f"Chance print lifted at PoC — NAFIS: MATCH → {accused_name}"
    else:
        fingerprint = "Chance print lifted at PoC — NAFIS: no hit (enrolled to database)"

    has_bio_ballistic = any(k in " ".join(evidence).lower() for k in ("biological", "weapon", "contraband"))
    fsl = None
    if heinous or has_bio_ballistic or cat == "contraband":
        fsl = {
            "ref": f"FSL/BLR/{yy}/{r.randint(100, 899)}",
            "status": "Received — corroborative" if solved else "Report awaited",
        }

    # Custody is a per-FIR location, NOT a shared status string. Each FIR's exhibits sit in ITS OWN
    # police-station malkhana (district-scoped) under a unique register number — so eight linked FIRs
    # across three districts read as eight distinct custody entries, never one identical "In PS
    # Malkhana" line (which looked, wrongly, like all the property sat in one place).
    where = f"PS Malkhana, {district}" if district else "PS Malkhana"
    malkhana = f"{where} · Reg. No. {yy}/{n:03d}"
    custody = ("Forwarded to FSL, Bengaluru" if fsl and fsl["status"] == "Report awaited"
               else f"In {malkhana}")
    return {
        "weapon": weapon,
        "tools": tools,
        "evidenceRecovered": evidence,
        "fingerprint": fingerprint,
        "seizure": {
            "memoNo": f"SM/{stn}/{yy}/{n:03d}",
            "panchnama": "Drawn at scene before two independent panchas",
            "seizingOfficer": io_name or "Investigating Officer",
            "malkhana": malkhana,
            "custody": custody,
        },
        "fsl": fsl,
    }
