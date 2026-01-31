# Location‑Aware Room Discovery & Nearby Places

This document describes the location features implemented using free OpenStreetMap services.

## Diagram

```mermaid
flowchart TD
  A[Owner selects map pin] --> B[Reverse geocode (Nominatim)]
  A --> C[Nearby places (Overpass)]
  C --> C1[Hospitals]
  C --> C2[Colleges/Universities]
  C --> C3[Bus Stops]
  C --> C4[Markets]
  B --> D[Room.location text saved]
  C --> E[Room.nearby names saved]
  A --> F[Room.geo saved]

  F --> G[Tenant views Room Details]
  E --> G
  G --> H[Show map + pins]
  G --> I[Show nearby list]

  F --> J[Distance from user]
  J --> K[Rooms list sorted by nearest]

  F --> L[Price suggestion]
  L --> M[Nearby rent median if enough data]
  L --> N[City baseline fallback]
```

---

## Data Model
A `Room` stores:
- `geo.lat`, `geo.lng`
- `nearby.hospitals[]`
- `nearby.colleges[]`
- `nearby.busStops[]`
- `nearby.markets[]`

---

## Reverse Geocoding (Pin → Address)
**Service:** OpenStreetMap Nominatim

**When:** Owner moves the map pin in Add/Edit Room.

**Pseudo code:**
```
function reverseGeocode(lat, lng):
    response = GET https://nominatim.openstreetmap.org/reverse
               params { lat, lon: lng, format: "jsonv2" }
    return response.display_name
```

---

## Nearby Places Fetch (Pin → Hospitals/Colleges/Bus Stops/Markets)
**Service:** OpenStreetMap Overpass API

**When:** Owner moves the pin, or tenant opens Room Details.

**Pseudo code:**
```
function nearbyByCoords(lat, lng, radius=1200m):
    query = OverpassQL(
       hospitals, colleges/universities,
       bus_stops, marketplaces/supermarkets
    )
    data = POST Overpass(query)

    for each element in data:
        name = element.tags.name or "Unnamed"
        distance = haversine(lat,lng,element.lat,element.lng)
        push into correct list with (name, distance, lat, lng)

    return { hospitals, colleges, busStops, markets }
```

---

## Save Nearby Names (Owner)
**When:** Owner submits room after pin selection.

**Pseudo code:**
```
if nearby lists exist:
    room.nearby.hospitals = names(hospitals)
    room.nearby.colleges = names(colleges)
    room.nearby.busStops = names(busStops)
    room.nearby.markets = names(markets)
```

---

## Room Details Map (Tenant)
**When:** Tenant clicks “View Map”.

**Pseudo code:**
```
if room.geo exists:
    show map with marker at room.geo

    if nearby places exist:
        add markers for each nearby place
        allow user to click pin icon to focus map
```

---

## Nearest Rooms Sorting (Tenant)
**When:** Tenant opens Rooms list.

**Pseudo code:**
```
if user.role == tenant AND user geolocation available:
    for each room:
        if room.geo exists:
            distance = haversine(user, room.geo)
        else:
            distance = Infinity
    sort rooms by distance ascending
```

---

## Price Suggestion (Map‑Aware)
**If enough nearby listings:**
```
if published rooms found within radius:
    use their rents to compute median + range
```

**Fallback:**
```
else:
    use city baseline based on nearest city to pin
```

---

## Notes
- All location services are free and open (OpenStreetMap).
- Nearby data is cached in each room to avoid repeated API calls.
- If Overpass fails, UI falls back gracefully to empty nearby lists.
