# Building Floor Plan — Thai Annotation Translation

## Original Plan Description

A hand-drawn floor plan of a multi-floor corridor building with rooms along a central corridor. The corridor runs horizontally between two staircases that serve as the only exits.

---

## Annotation Translation Table

### Reference Points (top of diagram)

| Thai | English | Notes |
|------|---------|-------|
| จุดที่ 1 | Reference Point 1 / Staircase 1 | Left end of building — Exit 1 |
| จุดที่ 2 | Reference Point 2 / Staircase 2 | Right end of building — Exit 2 |

### Left-side Measurements

| Thai | English | Value |
|------|---------|-------|
| ระยะห้องละ | Room width (each room) | 914 cm = 9.14 m |
| จากบันได 1 ไปบันได 2 | Distance from Staircase 1 to Staircase 2 | 6,400 cm = 64.0 m |
| ทางออกมีแค่ 2 ทาง | Only 2 exits available | Both staircases |
| ความกว้างทางเดิน | Corridor / aisle width | 190 cm = 1.9 m |
| ความกว้างบันได | Staircase width | 160 cm = 1.6 m |
| บันไดมี 9 ขั้นต่อครึ่งชั้น | Staircase: 9 steps per half-floor | — |
| ทางออกกว้าง | Exit opening width | 320 cm = 3.2 m |

### Diagram Layout

| Element | Description |
|---------|-------------|
| Horizontal bands | 4 floors (shown stacked) |
| Small rectangles per row | Room doors / openings along the corridor |
| Left boundary (จุดที่ 1) | Staircase 1 — Exit 1 |
| Right boundary (จุดที่ 2) | Staircase 2 — Exit 2 |

---

## Derived Calculations

```
Room width per room:    914 cm  =   9.14 m
Total corridor length: 6400 cm  =  64.00 m
Corridor width:         190 cm  =   1.90 m
Staircase width:        160 cm  =   1.60 m
Exit width:             320 cm  =   3.20 m
Steps per half-floor:   9 steps

Rooms per floor:   6400 ÷ 914  ≈  7 rooms
Total floors:      4
Total rooms:       7 × 4       = 28 rooms

Corridor area (per floor):   64.0 × 1.9  = 121.6 m²
Corridor area (all floors):  121.6 × 4   = 486.4 m²
```

---

## Evacuation Notes

- **Only 2 exits** — both are staircases (one at each end of the building)
- Rooms on left half → nearer to Staircase 1
- Rooms on right half → nearer to Staircase 2
- Room 4 (center) is equidistant from both exits (~32 m to each)
- Staircase width (160 cm) is the bottleneck — narrower than the corridor (190 cm)
- Each staircase has 9 steps per half-floor (18 steps per full floor)
