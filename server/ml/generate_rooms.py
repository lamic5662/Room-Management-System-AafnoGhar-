import json
import random
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
OUT_PATH = BASE_DIR / "rooms.json"

random.seed(42)

cities = {
    "Kathmandu": {
        "base": 16000,
        "areas": ["Boudha", "Baneshwor", "Koteshwor", "Thamel", "Kalanki", "Baluwatar", "New Road"],
    },
    "Lalitpur": {
        "base": 14000,
        "areas": ["Patan", "Balkumari", "Jawalakhel", "Satdobato", "Imadol"],
    },
    "Bhaktapur": {
        "base": 11000,
        "areas": ["Suryabinayak", "Thimi", "Madhyapur", "Dattatreya"],
    },
    "Pokhara": {
        "base": 13000,
        "areas": ["Lakeside", "Birauta", "New Road", "Bagar"],
    },
    "Biratnagar": {
        "base": 9000,
        "areas": ["Main Road", "Tintolia", "Bargachhi"],
    },
    "Bharatpur": {
        "base": 8500,
        "areas": ["Narayangadh", "Pulchowk", "Chaubiskoti"],
    },
    "Butwal": {
        "base": 8000,
        "areas": ["Traffic Chowk", "Kalikanagar", "Golpark"],
    },
    "Dharan": {
        "base": 7500,
        "areas": ["BP Chowk", "Shivadhar"],
    },
}

room_types = ["Single", "Studio", "1BHK", "2BHK", "3BHK"]

room_type_config = {
    "Single": {"bedrooms": 1, "bathrooms": 1, "size": (120, 220)},
    "Studio": {"bedrooms": 1, "bathrooms": 1, "size": (220, 350)},
    "1BHK": {"bedrooms": 1, "bathrooms": 1, "size": (350, 550)},
    "2BHK": {"bedrooms": 2, "bathrooms": 1, "size": (550, 800)},
    "3BHK": {"bedrooms": 3, "bathrooms": 2, "size": (800, 1100)},
}

amenity_bonus = {
    "furnished": 1200,
    "wifi": 400,
    "parking": 700,
    "water": 300,
    "electricityBackup": 500,
}

def pick_boolean(prob_true):
    return random.random() < prob_true

rows = []

for _ in range(320):
    city = random.choice(list(cities.keys()))
    area = random.choice(cities[city]["areas"])
    base = cities[city]["base"]

    room_type = random.choices(room_types, weights=[20, 18, 30, 22, 10])[0]
    cfg = room_type_config[room_type]

    bedrooms = cfg["bedrooms"]
    bathrooms = cfg["bathrooms"] + (1 if room_type == "3BHK" and pick_boolean(0.3) else 0)
    size_sqft = random.randint(cfg["size"][0], cfg["size"][1])

    furnished = pick_boolean(0.35 if city in ["Kathmandu", "Lalitpur", "Pokhara"] else 0.25)
    wifi = pick_boolean(0.6)
    parking = pick_boolean(0.4)
    water = pick_boolean(0.75)
    electricity_backup = pick_boolean(0.35)

    size_factor = size_sqft * random.uniform(15, 22)  # sqft rate
    type_factor = {"Single": -1500, "Studio": -500, "1BHK": 0, "2BHK": 3500, "3BHK": 7000}[room_type]

    amenities = 0
    amenities += amenity_bonus["furnished"] if furnished else 0
    amenities += amenity_bonus["wifi"] if wifi else 0
    amenities += amenity_bonus["parking"] if parking else 0
    amenities += amenity_bonus["water"] if water else 0
    amenities += amenity_bonus["electricityBackup"] if electricity_backup else 0

    noise = random.uniform(-2000, 2000)

    monthly_rent = base + size_factor + type_factor + amenities + noise

    # clamp reasonable bounds per city
    if city in ["Kathmandu", "Lalitpur"]:
        monthly_rent = max(6000, min(monthly_rent, 70000))
    elif city in ["Pokhara", "Bhaktapur"]:
        monthly_rent = max(5000, min(monthly_rent, 50000))
    else:
        monthly_rent = max(4000, min(monthly_rent, 35000))

    rows.append({
        "city": city,
        "area": area,
        "roomType": room_type,
        "bedrooms": bedrooms,
        "bathrooms": bathrooms,
        "sizeSqft": size_sqft,
        "furnished": furnished,
        "wifi": wifi,
        "parking": parking,
        "water": water,
        "electricityBackup": electricity_backup,
        "monthlyRent": round(monthly_rent, 0),
    })

OUT_PATH.write_text(json.dumps(rows, indent=2))
print(f"✅ Generated {len(rows)} synthetic Nepal rent rows at {OUT_PATH}")
