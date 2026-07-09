"""
Building Layout Calculator
Computes evacuation metrics from the hand-drawn floor plan.
"""

ROOM_WIDTH_CM = 914
TOTAL_LENGTH_CM = 6400
CORRIDOR_WIDTH_CM = 190
STAIRCASE_WIDTH_CM = 160
EXIT_WIDTH_CM = 320
STEPS_PER_HALF_FLOOR = 9
TOTAL_FLOORS = 4
EXITS = 2

# Same speeds as the simulation engine (backend/graph_builder.py) so this
# standalone analysis and the API agree. The report (evacuation_report_final
# .pdf) allows 1.2-1.5 m/s for level walking; we use 1.4 throughout.
WALKING_SPEED_MS = 1.4
STAIR_SPEED_MS = 0.6
STEP_HEIGHT_CM = 18


def rooms_per_floor():
    return int(TOTAL_LENGTH_CM / ROOM_WIDTH_CM)


def total_rooms():
    return rooms_per_floor() * TOTAL_FLOORS


def corridor_area_per_floor_m2():
    return (TOTAL_LENGTH_CM / 100) * (CORRIDOR_WIDTH_CM / 100)


def total_corridor_area_m2():
    return corridor_area_per_floor_m2() * TOTAL_FLOORS


def room_x_centers():
    n = rooms_per_floor()
    return [int(ROOM_WIDTH_CM * i + ROOM_WIDTH_CM / 2) for i in range(n)]


def nearest_exit_distance_cm(x_center):
    dist_to_exit1 = x_center
    dist_to_exit2 = TOTAL_LENGTH_CM - x_center
    return min(dist_to_exit1, dist_to_exit2), ("exit_1" if dist_to_exit1 <= dist_to_exit2 else "exit_2")


def corridor_evacuation_time_s(distance_cm):
    return (distance_cm / 100) / WALKING_SPEED_MS


def stair_evacuation_time_s(num_floors_to_descend):
    total_steps = STEPS_PER_HALF_FLOOR * 2 * num_floors_to_descend
    step_height_m = STEP_HEIGHT_CM / 100
    vertical_dist_m = total_steps * step_height_m
    return vertical_dist_m / STAIR_SPEED_MS


def total_evacuation_time_s(distance_cm, floor_number):
    floors_to_ground = floor_number - 1
    return corridor_evacuation_time_s(distance_cm) + stair_evacuation_time_s(floors_to_ground)


def bottleneck_analysis():
    corridor_flow = CORRIDOR_WIDTH_CM / 100 * 1.3
    stair_flow = STAIRCASE_WIDTH_CM / 100 * 0.8
    return {
        "corridor_capacity_persons_per_sec": round(corridor_flow, 2),
        "staircase_capacity_persons_per_sec": round(stair_flow, 2),
        "bottleneck": "staircase" if stair_flow < corridor_flow else "corridor",
        "staircase_is_narrower_than_corridor": STAIRCASE_WIDTH_CM < CORRIDOR_WIDTH_CM,
    }


def main():
    print("=" * 60)
    print("  BUILDING LAYOUT CALCULATOR")
    print("  แปลนอาคารทางเดินหลายชั้น")
    print("=" * 60)

    print("\n--- DIMENSIONS (ขนาด) ---")
    print(f"  Room width (ระยะห้องละ):     {ROOM_WIDTH_CM} cm  =  {ROOM_WIDTH_CM/100:.2f} m")
    print(f"  Total corridor length:       {TOTAL_LENGTH_CM} cm  =  {TOTAL_LENGTH_CM/100:.2f} m")
    print(f"  Corridor width (ทางเดิน):    {CORRIDOR_WIDTH_CM} cm  =  {CORRIDOR_WIDTH_CM/100:.2f} m")
    print(f"  Staircase width (บันได):     {STAIRCASE_WIDTH_CM} cm  =  {STAIRCASE_WIDTH_CM/100:.2f} m")
    print(f"  Exit width (ทางออก):         {EXIT_WIDTH_CM} cm  =  {EXIT_WIDTH_CM/100:.2f} m")
    print(f"  Steps per half-floor:        {STEPS_PER_HALF_FLOOR} steps")

    print("\n--- ROOM COUNTS (จำนวนห้อง) ---")
    rpf = rooms_per_floor()
    print(f"  Rooms per floor:             {rpf}")
    print(f"  Total floors:                {TOTAL_FLOORS}")
    print(f"  Total rooms:                 {total_rooms()}")
    print(f"  Number of exits:             {EXITS}")

    print("\n--- AREAS (พื้นที่) ---")
    print(f"  Corridor area per floor:     {corridor_area_per_floor_m2():.1f} m²")
    print(f"  Total corridor area:         {total_corridor_area_m2():.1f} m²")

    print("\n--- EVACUATION DISTANCES & TIMES (ระยะและเวลาอพยพ) ---")
    centers = room_x_centers()
    print(f"\n  {'Room':<8} {'X-center(cm)':<16} {'Nearest Exit':<14} {'Dist(cm)':<12} {'Floor 1 time':<14} {'Floor 4 time'}")
    print("  " + "-" * 78)
    for i, xc in enumerate(centers):
        dist, exit_id = nearest_exit_distance_cm(xc)
        t1 = total_evacuation_time_s(dist, 1)
        t4 = total_evacuation_time_s(dist, 4)
        print(f"  R{i+1:<7} {xc:<16} {exit_id:<14} {dist:<12} {t1:<14.1f} {t4:.1f} sec")

    print("\n--- BOTTLENECK ANALYSIS (จุดคอขวด) ---")
    bn = bottleneck_analysis()
    print(f"  Corridor capacity:           {bn['corridor_capacity_persons_per_sec']} persons/sec per meter width")
    print(f"  Staircase capacity:          {bn['staircase_capacity_persons_per_sec']} persons/sec per meter width")
    print(f"  Bottleneck location:         {bn['bottleneck'].upper()}")
    if bn["staircase_is_narrower_than_corridor"]:
        diff = CORRIDOR_WIDTH_CM - STAIRCASE_WIDTH_CM
        print(f"  WARNING: Staircase is {diff} cm narrower than corridor — evacuation slowdown at stairs")

    print("\n--- WORST-CASE SCENARIO ---")
    max_dist, _ = nearest_exit_distance_cm(3200)
    worst_floor = TOTAL_FLOORS
    worst_time = total_evacuation_time_s(max_dist, worst_floor)
    print(f"  Farthest room from exit:     R4 (center), {max_dist} cm to nearest exit")
    print(f"  Worst-case floor:            Floor {worst_floor}")
    print(f"  Worst-case evacuation time:  {worst_time:.1f} seconds ({worst_time/60:.1f} minutes)")

    print("\n" + "=" * 60)


if __name__ == "__main__":
    main()
