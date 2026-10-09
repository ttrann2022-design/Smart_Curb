import heapq
import math
import time


class AStarBenchmarker:
    def __init__(self, graph, heuristics, crowd_ratings, heuristic_weight=1.0):
        self.graph = graph                # Adjacency list: node -> [(neighbor, base_dist)]
        self.heuristics = heuristics       # Base Euclidean heuristics
        self.crowd_ratings = crowd_ratings
        self.heuristic_weight = heuristic_weight  # Weight for tuning (1.0 = admissible, >1.0 = greedy)
        
        # Dynamic Edge Weight Multipliers
        self.crowd_multipliers = {
            1: 1.0,   # Empty / Fast
            2: 1.2,   # Mild traffic
            3: 1.5,   # Moderate traffic
            4: 2.5,   # Heavy congestion
            5: float('inf')  # Blocked / Saturated
        }

    def _get_edge_cost(self, neighbor, base_distance):
        rating = self.crowd_ratings.get(neighbor, 1)
        multiplier = self.crowd_multipliers.get(rating, float('inf'))
        return base_distance * multiplier

    def search(self, start, goal):
        start_time = time.perf_counter()

        open_set = []
        start_h = self.heuristics.get(start, 0) * self.heuristic_weight
        heapq.heappush(open_set, (start_h, start))

        came_from = {}
        g_score = {start: 0.0}

        nodes_expanded = 0
        nodes_generated = 1
        max_open_set_size = 1

        while open_set:
            max_open_set_size = max(max_open_set_size, len(open_set))

            current_f, current = heapq.heappop(open_set)

            # Lazy deletion: skip stale entries in open_set
            if current in g_score and current_f > g_score[current] + (self.heuristics.get(current, 0) * self.heuristic_weight):
                continue

            nodes_expanded += 1

            if current == goal:
                execution_time_ms = (time.perf_counter() - start_time) * 1000

                # Reconstruct Path
                path = [current]
                while current in came_from:
                    current = came_from[current]
                    path.append(current)
                path.reverse()

                return {
                    "status": "SUCCESS",
                    "path": path,
                    "effective_cost": round(g_score[goal], 2),
                    "metrics": {
                        "execution_time_ms": round(execution_time_ms, 4),
                        "nodes_expanded": nodes_expanded,
                        "nodes_generated": nodes_generated,
                        "max_open_set_size": max_open_set_size,
                        "path_length_nodes": len(path)
                    }
                }

            for neighbor, base_distance in self.graph.get(current, []):
                weight = self._get_edge_cost(neighbor, base_distance)

                if weight == float('inf'):
                    continue  # Skip saturated nodes/edges

                tentative_g = g_score[current] + weight

                if neighbor not in g_score or tentative_g < g_score[neighbor]:
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative_g
                    
                    # f(n) = g(n) + w * h(n)
                    h_val = self.heuristics.get(neighbor, 0) * self.heuristic_weight
                    f_score = tentative_g + h_val

                    heapq.heappush(open_set, (f_score, neighbor))
                    nodes_generated += 1

        execution_time_ms = (time.perf_counter() - start_time) * 1000
        return {
            "status": "NO_PATH_FOUND",
            "path": [],
            "effective_cost": float('inf'),
            "metrics": {
                "execution_time_ms": round(execution_time_ms, 4),
                "nodes_expanded": nodes_expanded,
                "nodes_generated": nodes_generated,
                "max_open_set_size": max_open_set_size,
                "path_length_nodes": 0
            }
        }


# =====================================================================
# LARGE-SCALE BENCHMARK SCENARIO (6x6 Grid + 8 Parking Hubs)
# =====================================================================
def build_large_city_network(grid_size=6):
    large_graph = {}
    positions = {}

    # 1. Build Grid Coordinates (100m road segments)
    for r in range(grid_size):
        for c in range(grid_size):
            node_id = f"Node_{r}_{c}"
            positions[node_id] = (r * 100, c * 100)
            large_graph[node_id] = []

    # 2. Build Grid Edges (Bi-directional urban avenues)
    for r in range(grid_size):
        for c in range(grid_size):
            curr = f"Node_{r}_{c}"
            if r + 1 < grid_size:
                nxt = f"Node_{r+1}_{c}"
                large_graph[curr].append((nxt, 100))
                large_graph[nxt].append((curr, 100))
            if c + 1 < grid_size:
                nxt = f"Node_{r}_{c+1}"
                large_graph[curr].append((nxt, 100))
                large_graph[nxt].append((curr, 100))

    # 3. Attach 8 Distinct Parking Lots across peripheral & central sectors
    parking_lots = {
        "Lot_North_Hub":     ("Node_0_3", 40, (0, 340)),
        "Lot_South_Hub":     ("Node_5_2", 40, (500, 240)),
        "Lot_East_Hub":      ("Node_5_5", 50, (550, 550)),
        "Lot_West_Hub":      ("Node_2_0", 30, (200, -30)),
        "Lot_Central_Hub":   ("Node_3_3", 20, (320, 320)),
        "Lot_NorthEast_Hub": ("Node_0_5", 40, (0, 540)),
        "Lot_SouthWest_Hub": ("Node_5_0", 40, (500, -40)),
        "Lot_OuterRing_Hub": ("Node_1_5", 60, (100, 560)),
    }

    for lot_name, (access_node, dist, pos) in parking_lots.items():
        large_graph[access_node].append((lot_name, dist))
        large_graph[lot_name] = []
        positions[lot_name] = pos

    return large_graph, positions, list(parking_lots.keys())


def compute_heuristics(positions, goal_node):
    goal_pos = positions[goal_node]
    heuristics = {}
    for node, (x, y) in positions.items():
        heuristics[node] = math.hypot(x - goal_pos[0], y - goal_pos[1])
    return heuristics


if __name__ == "__main__":
    grid_graph, node_positions, all_parking_lots = build_large_city_network(grid_size=6)
    start_node = "Node_0_0"

    # Dynamic Traffic & Crowding Levels (1 = Clear, 5 = Saturated)
    crowd_ratings = {
        # City Center bottlenecks
        "Node_2_2": 4, "Node_2_3": 5, "Node_3_2": 4, "Node_3_3": 3,
        # Parking Lot crowd occupancy
        "Lot_Central_Hub": 4,    # Heavy crowd (2.5x distance cost)
        "Lot_East_Hub": 2,       # Light crowd
        "Lot_North_Hub": 1,      # Uncrowded
        "Lot_South_Hub": 5,      # Fully saturated / blocked
        "Lot_West_Hub": 1,       # Uncrowded
        "Lot_NorthEast_Hub": 2,  # Light crowd
        "Lot_SouthWest_Hub": 3,  # Moderate crowd
        "Lot_OuterRing_Hub": 1,  # Uncrowded
    }

    print("=" * 60)
    print("      A* MULTI-PARKING LOT BENCHMARK (8 PARKING HUBS)      ")
    print("=" * 60)

    # Benchmark run across selected parking lots
    target_lots = ["Lot_East_Hub", "Lot_Central_Hub", "Lot_NorthEast_Hub"]

    for target_goal in target_lots:
        heuristics = compute_heuristics(node_positions, target_goal)

        print(f"\n>>> TARGET DESTINATION: {target_goal} (Rating: {crowd_ratings.get(target_goal, 1)})")
        print("-" * 60)

        for weight in [1.0, 1.25]:
            benchmarker = AStarBenchmarker(
                graph=grid_graph,
                heuristics=heuristics,
                crowd_ratings=crowd_ratings,
                heuristic_weight=weight
            )
            results = benchmarker.search(start=start_node, goal=target_goal)

            print(f"Weight: {weight:<4} | Status: {results['status']:<10} | "
                  f"Cost: {results['effective_cost']:<8} | "
                  f"Nodes Exp: {results['metrics']['nodes_expanded']:<4} | "
                  f"Time: {results['metrics']['execution_time_ms']} ms")
            print(f"Path: {' -> '.join(results['path'])}\n")