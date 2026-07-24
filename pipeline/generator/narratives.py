"""Modus-operandi-aware FIR narrative generation (English + Kannada).

The narrative (BriefFacts) is the input to NETRA's case-linkage AI. Two goals:
  1. VARIED WORDING — many templates per crime family, so two FIRs describing
     the SAME modus operandi still read differently (avoids the "template trap"
     where linked cases look identical).
  2. ENCODED MO — the underlying modus-operandi slots (entry method, tool,
     target, time window, ...) are the linkage signal. Serial-crime patterns
     fix these slots while wording varies.

Sensitive offences (rape, POCSO) get neutral, non-graphic, access-restricted
narratives — which is also how such FIRs are actually handled.
"""
import random

# Map each crime sub-head id to a narrative family.
FAMILY_BY_SUBHEAD = {
    101: "theft", 102: "burglary", 103: "mv_theft", 104: "robbery",
    105: "dacoity", 106: "cbt",
    201: "violence", 202: "violence", 203: "violence", 204: "violence",
    205: "violence", 206: "kidnap",
    301: "cruelty", 302: "woman_assault", 303: "woman_assault",
    304: "restricted", 305: "dowry",
    401: "kidnap", 402: "restricted",
    501: "fraud", 502: "fraud", 503: "fraud",
    601: "cyber", 602: "cyber", 603: "cyber",
    701: "public_order", 702: "intimidation", 703: "arson",
    801: "ndps", 802: "excise", 803: "arms", 804: "gambling",
    901: "udr_accident", 902: "udr_suicide",
}

# Modus-operandi slot value pools.
SLOTS = {
    "time_phrase": ["late at night", "in the early hours", "around midnight",
                    "during the afternoon", "in the evening", "at dawn",
                    "during the noon hours", "past midnight"],
    "entry_method": ["by breaking the rear window grille", "by cutting the shutter lock",
                     "by scaling the compound wall", "through an unlocked back door",
                     "by breaking open the main door latch", "by drilling out the lock",
                     "using a duplicate key", "by removing the window bars"],
    "burglary_target": ["gold ornaments and cash", "cash kept in the almirah",
                        "jewellery and two mobile phones", "gold jewellery and a laptop",
                        "cash and silver articles", "gold chains and earrings"],
    "theft_target": ["a mobile phone", "a gold chain", "cash from the wallet",
                     "a laptop bag", "a purse containing cash and documents",
                     "a bicycle", "gold bangles"],
    "mv_target": ["a black Honda Activa scooter", "a red Bajaj Pulsar motorcycle",
                  "a white Maruti Swift car", "a TVS Jupiter scooter",
                  "a Royal Enfield motorcycle", "a silver Hyundai i20"],
    "robbery_target": ["a gold chain", "cash and a mobile phone",
                       "a bag containing cash", "gold ornaments worn by the victim"],
    "location_type": ["a residential house", "a commercial shop", "the parking area",
                      "a jewellery store", "the temple premises", "an ATM kiosk",
                      "a roadside", "a farmhouse", "an apartment complex", "a bus stand"],
    "weapon": ["a knife", "a machete (longu)", "an iron rod", "a wooden club",
               "a country-made pistol", "chilli powder", "a sickle", "a broken bottle"],
    "transport": ["on a motorcycle", "in a car", "on foot", "in an autorickshaw",
                  "in a tempo van"],
    "fraud_method": ["by impersonating a bank official", "through a fake investment scheme",
                     "by promising a government job", "by posing as a courier agent",
                     "through a fake matrimonial profile", "by promising high returns on a chit fund",
                     "by selling a non-existent plot of land"],
    "cyber_method": ["by sharing a phishing link", "through an OTP fraud",
                     "by posing as a customer-care executive", "via a fake KYC-update message",
                     "through a fraudulent UPI collect request", "by hacking the email account"],
    "channel": ["over a phone call", "through WhatsApp", "on a social media platform",
                "via SMS", "through a mobile app"],
    "relationship": ["a known person", "a relative", "a neighbour", "an unknown person",
                     "a business partner", "a co-worker", "a former employee"],
    "motive": ["a previous financial dispute", "an old enmity", "a land dispute",
               "a family quarrel", "suspicion", "an altercation under the influence of alcohol",
               "a dispute over money lending"],
    "gang_size": ["a gang of three to four persons", "five to six armed persons",
                  "two unidentified persons", "a group of masked men"],
    "cause_accident": ["a road traffic accident", "electrocution", "a fall from height",
                       "drowning", "a workplace mishap"],
    "cause_suicide": ["consuming poison", "hanging", "self-immolation"],
}

# English templates per family. {slot} placeholders are filled from the MO dict.
TEMPLATES = {
    "burglary": [
        "The complainant reported that {time_phrase}, unknown persons entered {location_type} {entry_method} and decamped with {burglary_target}.",
        "During {time_phrase}, the accused gained entry into {location_type} {entry_method} and stole {burglary_target}. The theft was noticed the next morning.",
        "It is reported that {location_type} was broken into {time_phrase}; the culprits {entry_method_verb} and took away {burglary_target}.",
        "Unknown miscreants, {time_phrase}, committed house-breaking at {location_type} {entry_method} and made off with {burglary_target}.",
        "The complainant returned to find {location_type} ransacked; the intruders had entered {entry_method} {time_phrase} and taken {burglary_target}.",
        "A case of house-breaking is reported: {time_phrase}, culprits {entry_method_verb} at {location_type} and escaped with {burglary_target}.",
        "On checking {location_type} {time_phrase}, the complainant found the premises burgled — entry made {entry_method}, and {burglary_target} missing.",
        "Unidentified thieves broke into {location_type} {time_phrase} {entry_method}, decamping with {burglary_target} before fleeing.",
    ],
    "theft": [
        "The complainant stated that {time_phrase}, {theft_target} was stolen from {location_type}.",
        "{theft_target_cap} was found missing from {location_type} {time_phrase}; theft by an unknown person is suspected.",
        "It is alleged that an unknown person committed theft of {theft_target} at {location_type} {time_phrase}.",
        "The complainant reported the theft of {theft_target} from {location_type} while it was left unattended {time_phrase}.",
        "{time_phrase_cap}, an unidentified person removed {theft_target} from {location_type} and fled.",
        "The complainant noticed {theft_target} missing from {location_type} {time_phrase} and lodged this complaint.",
        "A theft is reported wherein {theft_target} was taken from {location_type} {time_phrase} by an unknown culprit.",
    ],
    "mv_theft": [
        "The complainant reported that {mv_target} parked at {location_type} was stolen {time_phrase}.",
        "{mv_target_cap}, parked near {location_type}, was found missing {time_phrase}. Vehicle theft is suspected.",
        "It is alleged that an unknown person stole {mv_target} from {location_type} {time_phrase}.",
        "{time_phrase_cap}, {mv_target} was stolen from {location_type}; the vehicle could not be traced.",
        "The complainant parked {mv_target} at {location_type} and found it missing {time_phrase}; theft is suspected.",
        "An unidentified person made away with {mv_target} left at {location_type} {time_phrase}.",
        "{mv_target_cap} was reported stolen from {location_type} {time_phrase}, with no trace of the vehicle since.",
    ],
    "robbery": [
        "The complainant stated that {time_phrase}, {transport}, the accused threatened the victim with {weapon} and robbed {robbery_target} at {location_type}.",
        "At {location_type}, {time_phrase}, unknown persons {transport} snatched {robbery_target} after threatening the victim with {weapon}.",
        "It is reported that the victim was waylaid at {location_type} {time_phrase} and robbed of {robbery_target} at the point of {weapon}.",
        "{time_phrase_cap} at {location_type}, assailants {transport} brandished {weapon} and forcibly took {robbery_target}.",
        "The victim was intercepted at {location_type} {time_phrase} by persons {transport}, who robbed {robbery_target} using {weapon}.",
        "A robbery is reported: {time_phrase}, the accused {transport} accosted the victim at {location_type}, showed {weapon}, and decamped with {robbery_target}.",
    ],
    "dacoity": [
        "The complainant reported that {time_phrase}, {gang_size} armed with {weapon} raided {location_type} and looted {burglary_target}.",
        "{gang_size_cap}, {time_phrase}, stormed {location_type} brandishing {weapon} and committed dacoity, decamping with {burglary_target}.",
    ],
    "cbt": [
        "The complainant alleged that {relationship}, entrusted with money/property, dishonestly misappropriated it.",
        "It is reported that {relationship} committed criminal breach of trust in respect of funds entrusted for a specific purpose.",
    ],
    "violence": [
        "The complainant stated that {time_phrase}, over {motive}, the accused assaulted the victim with {weapon} at {location_type}.",
        "Owing to {motive}, {time_phrase}, an altercation at {location_type} led the accused to attack the victim using {weapon}.",
        "It is reported that {time_phrase} at {location_type}, the accused, on account of {motive}, caused injuries to the victim with {weapon}.",
        "A quarrel arising from {motive} {time_phrase} at {location_type} resulted in the accused assaulting the victim with {weapon}.",
        "{time_phrase_cap} at {location_type}, a dispute over {motive} escalated and the accused struck the victim with {weapon}.",
        "The complainant reported that the accused, enraged over {motive}, attacked the victim with {weapon} at {location_type} {time_phrase}.",
    ],
    "kidnap": [
        "The complainant reported that {time_phrase}, the victim was kidnapped from {location_type} and taken away {transport}, over {motive}.",
        "It is alleged that {time_phrase}, unknown persons abducted the victim from {location_type} {transport}.",
    ],
    "cruelty": [
        "The complainant stated that she was subjected to cruelty and harassment by her husband and in-laws over {motive}.",
        "It is reported that the complainant faced continued harassment by her husband and relatives in connection with {motive}.",
    ],
    "woman_assault": [
        "The complainant reported that {time_phrase} at {location_type}, {relationship} outraged her modesty.",
        "It is alleged that {relationship} behaved indecently with the complainant at {location_type} {time_phrase}.",
    ],
    "dowry": [
        "The complainant's family alleged that the deceased was harassed for dowry by her husband and in-laws, leading to an unnatural death within seven years of marriage.",
    ],
    "restricted": [
        "A case has been registered on the basis of the complainant's statement. Given the sensitive nature of the offence, factual particulars are recorded separately and access-restricted.",
        "An offence has been registered following the complaint. Details are restricted in accordance with victim-privacy provisions and are held in the confidential case file.",
    ],
    "fraud": [
        "The complainant stated that the accused, {fraud_method}, cheated the complainant of a sum of money.",
        "It is alleged that {relationship}, {fraud_method}, induced the complainant to part with money and thereafter absconded.",
        "The complainant reported being defrauded {fraud_method}, resulting in a monetary loss.",
        "The accused gained the complainant's trust {fraud_method} and then cheated them of their money.",
        "A cheating case is reported wherein the accused, {fraud_method}, collected money from the complainant on false promises.",
    ],
    "cyber": [
        "The complainant reported that {time_phrase}, an unknown person, {cyber_method} {channel}, fraudulently withdrew money from the complainant's account.",
        "It is alleged that the accused, {cyber_method} {channel}, cheated the complainant of a sum of money.",
        "The complainant stated that {channel}, an unknown fraudster {cyber_method} and caused a financial loss.",
        "{time_phrase_cap}, the complainant received contact {channel} from a fraudster who, {cyber_method}, debited money from the account.",
        "An online fraud is reported: {channel}, the accused {cyber_method} and siphoned funds from the complainant.",
    ],
    "public_order": [
        "The complainant reported that {time_phrase} at {location_type}, {gang_size} formed an unlawful assembly and indulged in rioting over {motive}.",
        "It is reported that {time_phrase}, a group of persons caused a breach of peace at {location_type} arising from {motive}.",
    ],
    "intimidation": [
        "The complainant stated that {relationship} criminally intimidated the complainant {channel} over {motive}.",
        "It is alleged that {relationship} threatened the complainant with dire consequences over {motive}.",
    ],
    "arson": [
        "The complainant reported that {time_phrase}, unknown persons set fire to {location_type} over {motive}, causing damage.",
    ],
    "ndps": [
        "During a patrol {time_phrase}, the accused was found in possession of contraband (ganja/other narcotics) at {location_type}, and a case under the NDPS Act was registered.",
        "Acting on credible information, a raid at {location_type} {time_phrase} led to the seizure of narcotic substances and the arrest of the accused.",
    ],
    "excise": [
        "During a raid at {location_type} {time_phrase}, illicit liquor was seized and a case under the Karnataka Excise Act was registered.",
    ],
    "arms": [
        "The accused was found in possession of an illegal weapon at {location_type} {time_phrase}; a case under the Arms Act was registered.",
    ],
    "gambling": [
        "A raid at {location_type} {time_phrase} found persons engaged in gambling; cash and material were seized under the Karnataka Police (Gaming) Act.",
    ],
    "udr_accident": [
        "An unnatural death was reported due to {cause_accident} at {location_type} {time_phrase}. Inquest proceedings were initiated.",
        "The deceased died on account of {cause_accident} near {location_type}; a UDR case was registered for inquest.",
    ],
    "udr_suicide": [
        "An unnatural death by {cause_suicide} was reported at {location_type}. Inquest proceedings were initiated; no foul play apparent at this stage.",
    ],
}

# Kannada templates for the most common families (real Kannada script).
TEMPLATES_KN = {
    "burglary": [
        "{time_phrase_kn} ಅಪರಿಚಿತ ವ್ಯಕ್ತಿಗಳು ಮನೆಗೆ ನುಗ್ಗಿ ಚಿನ್ನಾಭರಣ ಮತ್ತು ನಗದು ಕಳವು ಮಾಡಿದ್ದಾರೆ ಎಂದು ದೂರುದಾರರು ತಿಳಿಸಿದ್ದಾರೆ.",
        "{time_phrase_kn} ಮನೆಯ ಬಾಗಿಲು ಮುರಿದು ಒಳ ಪ್ರವೇಶಿಸಿದ ಕಳ್ಳರು ಚಿನ್ನ ಮತ್ತು ಹಣ ದೋಚಿಕೊಂಡು ಹೋಗಿದ್ದಾರೆ.",
    ],
    "theft": [
        "{time_phrase_kn} ದೂರುದಾರರ ವಸ್ತುಗಳನ್ನು ಅಪರಿಚಿತ ವ್ಯಕ್ತಿ ಕಳವು ಮಾಡಿದ್ದಾನೆ ಎಂದು ದೂರು ದಾಖಲಾಗಿದೆ.",
        "{time_phrase_kn} ಸಾರ್ವಜನಿಕ ಸ್ಥಳದಲ್ಲಿ ಮೊಬೈಲ್/ಚಿನ್ನದ ಸರ ಕಳವಾಗಿದೆ ಎಂದು ದೂರುದಾರರು ತಿಳಿಸಿದ್ದಾರೆ.",
    ],
    "mv_theft": [
        "{time_phrase_kn} ನಿಲ್ಲಿಸಿದ್ದ ದ್ವಿಚಕ್ರ ವಾಹನವನ್ನು ಅಪರಿಚಿತರು ಕಳವು ಮಾಡಿದ್ದಾರೆ ಎಂದು ದೂರು ದಾಖಲಾಗಿದೆ.",
    ],
    "robbery": [
        "{time_phrase_kn} ಆರೋಪಿಗಳು ಮಾರಕಾಸ್ತ್ರ ತೋರಿಸಿ ಬೆದರಿಸಿ ಚಿನ್ನದ ಸರ/ಹಣ ದರೋಡೆ ಮಾಡಿದ್ದಾರೆ.",
    ],
    "violence": [
        "{time_phrase_kn} ಹಳೆಯ ವೈಷಮ್ಯದ ಕಾರಣ ಆರೋಪಿ ದೂರುದಾರರ ಮೇಲೆ ಹಲ್ಲೆ ನಡೆಸಿ ಗಾಯಗೊಳಿಸಿದ್ದಾನೆ.",
    ],
    "fraud": [
        "ಆರೋಪಿಯು ಬ್ಯಾಂಕ್ ಅಧಿಕಾರಿ ಸೋಗಿನಲ್ಲಿ ದೂರುದಾರರನ್ನು ವಂಚಿಸಿ ಹಣ ಪಡೆದಿದ್ದಾನೆ ಎಂದು ದೂರು ದಾಖಲಾಗಿದೆ.",
    ],
    "cyber": [
        "ಅಪರಿಚಿತ ವ್ಯಕ್ತಿ ಒಟಿಪಿ/ಫಿಶಿಂಗ್ ಮೂಲಕ ದೂರುದಾರರ ಖಾತೆಯಿಂದ ಹಣವನ್ನು ವಂಚನೆಯಿಂದ ವರ್ಗಾಯಿಸಿಕೊಂಡಿದ್ದಾನೆ.",
    ],
    "woman_assault": [
        "ದೂರುದಾರಳ ಮೇಲೆ ಆರೋಪಿ ಅಸಭ್ಯವಾಗಿ ವರ್ತಿಸಿ ಆಕೆಯ ಮಾನಭಂಗಕ್ಕೆ ಯತ್ನಿಸಿದ್ದಾನೆ ಎಂದು ದೂರು ದಾಖಲಾಗಿದೆ.",
    ],
    "intimidation": [
        "ಆರೋಪಿ ದೂರುದಾರರಿಗೆ ಜೀವ ಬೆದರಿಕೆ ಹಾಕಿ ಬೆದರಿಸಿದ್ದಾನೆ ಎಂದು ದೂರು ದಾಖಲಾಗಿದೆ.",
    ],
    "_generic": [
        "ದೂರುದಾರರ ದೂರಿನ ಆಧಾರದ ಮೇಲೆ ಪ್ರಕರಣ ದಾಖಲಿಸಲಾಗಿದೆ; ತನಿಖೆ ಪ್ರಗತಿಯಲ್ಲಿದೆ.",
        "ದೂರುದಾರರ ಹೇಳಿಕೆಯಂತೆ ಘಟನೆ ಸಂಭವಿಸಿದ್ದು, ಪ್ರಕರಣ ದಾಖಲಿಸಿ ತನಿಖೆ ಕೈಗೊಳ್ಳಲಾಗಿದೆ.",
    ],
}

TIME_PHRASE_KN = {
    "late at night": "ರಾತ್ರಿ ವೇಳೆ", "in the early hours": "ಮುಂಜಾನೆ ವೇಳೆ",
    "around midnight": "ಮಧ್ಯರಾತ್ರಿ ಸಮಯದಲ್ಲಿ", "during the afternoon": "ಮಧ್ಯಾಹ್ನ ವೇಳೆ",
    "in the evening": "ಸಂಜೆ ವೇಳೆ", "at dawn": "ಬೆಳಗಿನ ಜಾವ",
    "during the noon hours": "ಮಧ್ಯಾಹ್ನದ ವೇಳೆ", "past midnight": "ಮಧ್ಯರಾತ್ರಿ ನಂತರ",
}

# Which slots each family draws when picking a random MO.
FAMILY_SLOTS = {
    "burglary": ["time_phrase", "entry_method", "burglary_target", "location_type"],
    "theft": ["time_phrase", "theft_target", "location_type"],
    "mv_theft": ["time_phrase", "mv_target", "location_type"],
    "robbery": ["time_phrase", "transport", "weapon", "robbery_target", "location_type"],
    "dacoity": ["time_phrase", "gang_size", "weapon", "burglary_target", "location_type"],
    "cbt": ["relationship"],
    "violence": ["time_phrase", "motive", "weapon", "location_type"],
    "kidnap": ["time_phrase", "location_type", "transport", "motive"],
    "cruelty": ["motive"],
    "woman_assault": ["time_phrase", "location_type", "relationship"],
    "dowry": [],
    "restricted": [],
    "fraud": ["fraud_method", "relationship"],
    "cyber": ["time_phrase", "cyber_method", "channel"],
    "public_order": ["time_phrase", "location_type", "gang_size", "motive"],
    "intimidation": ["relationship", "channel", "motive"],
    "arson": ["time_phrase", "location_type", "motive"],
    "ndps": ["time_phrase", "location_type"],
    "excise": ["time_phrase", "location_type"],
    "arms": ["time_phrase", "location_type"],
    "gambling": ["time_phrase", "location_type", "gang_size"],
    "udr_accident": ["time_phrase", "location_type", "cause_accident"],
    "udr_suicide": ["location_type", "cause_suicide"],
}

_ENTRY_VERB = {
    "by breaking the rear window grille": "broke the rear window grille",
    "by cutting the shutter lock": "cut the shutter lock",
    "by scaling the compound wall": "scaled the compound wall",
    "through an unlocked back door": "used an unlocked back door",
    "by breaking open the main door latch": "broke open the main door latch",
    "by drilling out the lock": "drilled out the lock",
    "using a duplicate key": "used a duplicate key",
    "by removing the window bars": "removed the window bars",
}


def pick_mo(subhead_id: int, rng: random.Random) -> dict:
    """Choose a random modus-operandi dict for a crime sub-head."""
    fam = FAMILY_BY_SUBHEAD[subhead_id]
    mo = {"family": fam}
    for slot in FAMILY_SLOTS.get(fam, []):
        mo[slot] = rng.choice(SLOTS[slot])
    return mo


def render(subhead_id: int, mo: dict, kannada: bool, rng: random.Random) -> str:
    """Render a narrative from a (possibly fixed) MO dict.

    Passing a fixed `mo` for several cases yields varied wording that shares
    the same modus operandi — the linkage signal.
    """
    fam = mo.get("family") or FAMILY_BY_SUBHEAD[subhead_id]

    if kannada:
        # Family-specific Kannada template where available (keeps MO detail),
        # else a neutral generic Kannada narrative — so any crime can be in Kannada.
        key = fam if fam in TEMPLATES_KN else "_generic"
        tpl = rng.choice(TEMPLATES_KN[key])
        if "{time_phrase_kn}" in tpl:
            tp = mo.get("time_phrase", "late at night")
            return tpl.format(time_phrase_kn=TIME_PHRASE_KN.get(tp, "ಸಮಯದಲ್ಲಿ"))
        return tpl

    tpl = rng.choice(TEMPLATES[fam])
    fields = dict(mo)
    # Derived helpers used by some templates.
    if "time_phrase" in fields:
        fields["time_phrase_cap"] = fields["time_phrase"].capitalize()
    if "entry_method" in fields:
        fields["entry_method_verb"] = _ENTRY_VERB.get(fields["entry_method"], "forced entry")
    for tgt in ("theft_target", "mv_target", "gang_size"):
        if tgt in fields:
            fields[tgt + "_cap"] = fields[tgt].capitalize()
    try:
        return tpl.format(**fields)
    except KeyError:
        # Any template needing a slot not in this MO falls back to a safe fill.
        return tpl.format(**{k: fields.get(k, "the location") for k in
                             ["time_phrase", "time_phrase_cap", "entry_method",
                              "entry_method_verb", "burglary_target", "theft_target",
                              "theft_target_cap", "mv_target", "mv_target_cap",
                              "robbery_target", "location_type", "weapon", "transport",
                              "fraud_method", "cyber_method", "channel", "relationship",
                              "motive", "gang_size", "gang_size_cap", "cause_accident",
                              "cause_suicide"]})
