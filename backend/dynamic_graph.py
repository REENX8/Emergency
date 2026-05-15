"""
dynamic_graph.py — Build a NetworkX graph from database building data.

Replaces the hardcoded build_evacuation_graph() for DB-backed buildings.
Active incidents automatically increase edge weights or block edges entirely.
"""

import networkx as nx
from sqlalchemy.orm import Session

from graph_builder import calculate_edge_weight
from models import Building, Node, Edge, Incident


def build_graph_from_db(
    building_id: int,
    db: Session,
    crowd_densities: dict[str, float] | None = None,
) -> nx.Graph:
    """
    Construct a weighted undirected NetworkX graph from the database.

    Active incidents are applied automatically:
      - fire:  the fire node is marked; its edges get smoke treatment upstream
      - smoke: edges adjacent to node get weight = inf (smoke_blocked)
      - crowd: edge weights multiplied by severity-based crowd penalty

    Args:
        building_id: database ID of the building
        db: SQLAlchemy session
        crowd_densities: optional override dict {node_key: density 0-1}

    Returns:
        nx.Graph with same edge attributes as graph_builder.build_evacuation_graph()
    """
    if crowd_densities is None:
        crowd_densities = {}

    # Load data from DB
    db_nodes  = db.query(Node).filter(Node.building_id == building_id).all()
    db_edges  = db.query(Edge).filter(Edge.building_id == building_id).all()
    active_incidents = (
        db.query(Incident)
        .filter(Incident.building_id == building_id, Incident.is_active == True)  # noqa: E712
        .all()
    )

    # Index active incidents by node_key
    smoke_nodes: set[str] = set()
    crowd_override: dict[str, float] = {}
    fire_nodes: set[str] = set()

    for inc in active_incidents:
        if inc.incident_type == "fire":
            fire_nodes.add(inc.node_key)
            smoke_nodes.add(inc.node_key)  # fire also produces smoke
        elif inc.incident_type == "smoke":
            smoke_nodes.add(inc.node_key)
        elif inc.incident_type == "crowd":
            # severity 0-1 maps to crowd density override
            existing = crowd_override.get(inc.node_key, 0.0)
            crowd_override[inc.node_key] = max(existing, inc.severity)

    # Merge DB crowd overrides with manual crowd_densities (manual wins)
    merged_crowd = {**crowd_override, **crowd_densities}

    G = nx.Graph()

    # Add nodes
    for n in db_nodes:
        attrs = {
            "type":     n.type,
            "floor":    n.floor_number,
            "x":        n.x,
            "y":        n.y,
            "label":    n.label or n.node_key,
            "capacity": n.capacity,
        }
        if n.node_key in fire_nodes:
            attrs["on_fire"] = True
        G.add_node(n.node_key, **attrs)

    # Add edges with calculated weights
    for e in db_edges:
        if e.u_key not in G or e.v_key not in G:
            continue  # orphaned edge (node deleted)

        density = (merged_crowd.get(e.u_key, 0.0) + merged_crowd.get(e.v_key, 0.0)) / 2.0
        weight    = calculate_edge_weight(e.distance_m, density, 0.0, e.is_stair)
        base_time = calculate_edge_weight(e.distance_m, 0.0,    0.0, e.is_stair)

        smoke_blocked = bool(e.u_key in smoke_nodes or e.v_key in smoke_nodes)

        G.add_edge(
            e.u_key, e.v_key,
            weight        = float("inf") if smoke_blocked else weight,
            distance      = e.distance_m,
            width         = e.width_m,
            is_stair      = e.is_stair,
            base_time     = base_time,
            crowd_density = round(density, 3),
            smoke_blocked = smoke_blocked,
        )

    return G


def get_exits_from_db(building_id: int, db: Session) -> list[str]:
    """Return node_keys of all exit nodes for the given building."""
    exits = (
        db.query(Node)
        .filter(Node.building_id == building_id, Node.type == "exit")
        .all()
    )
    return [n.node_key for n in exits]


def graph_to_cytoscape(G: nx.Graph) -> dict:
    """Convert nx.Graph → {nodes, edges} for Cytoscape.js (same format as main.py helper)."""
    nodes = []
    for node_id, data in G.nodes(data=True):
        nodes.append({
            "data": {
                "id":       node_id,
                "label":    data.get("label", node_id),
                "type":     data.get("type", "room"),
                "floor":    data.get("floor", 1),
                "capacity": data.get("capacity", 0),
                "on_fire":  data.get("on_fire", False),
            },
            "position": {"x": data.get("x", 0), "y": data.get("y", 0)},
        })

    edges = []
    seen = set()
    for u, v, data in G.edges(data=True):
        key = tuple(sorted([u, v]))
        if key in seen:
            continue
        seen.add(key)
        edges.append({
            "data": {
                "id":           f"{u}__{v}",
                "source":       u,
                "target":       v,
                "weight":       round(data.get("weight", 0) if data.get("weight") != float("inf") else 9999, 2),
                "distance":     data.get("distance", 0),
                "width":        data.get("width", 0),
                "crowd_density": round(data.get("crowd_density", 0), 2),
                "smoke_blocked": data.get("smoke_blocked", False),
                "is_stair":     data.get("is_stair", False),
            }
        })

    return {"nodes": nodes, "edges": edges}
