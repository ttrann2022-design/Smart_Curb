import heapq
import time


class AStarBenchmarker:
    def __init__(self, graph, heuristics, crowd_ratings):
        self.graph = graph                # Adjacency list
        self.heuristics = heuristics   
        self.crowd_ratings = crowd_ratings
        # Crowding scale multipliers (Dynamic Edge Weights)
        self.crowd_multipliers = {
            1: 1.0,
            2: 1.2,
            3: 1.5,
            4: 2.5,
            5: float('inf')  # Blocked / Saturated
        }

    def _get_edge_cost(self, neighbor, base_distance):
        rating = self.crowd_ratings.get(neighbor, 5)
        multiplier = self.crowd_multipliers.get(rating, float('inf'))
        return base_distance * multiplier

    def search(self, start, goal):
        start_time = time.perf_counter()

        # Priority Queue: (f_score, current_node)
        open_set = []
        heapq.heappush(open_set, (self.heuristics[start], start))

        came_from = {}
        g_score = {start: 0.0}

        # Metrics Tracking
        nodes_expanded = 0
        nodes_generated = 1
        max_open_set_size = 1

        while open_set:
            max_open_set_size = max(max_open_set_size, len(open_set))

            current_f, current = heapq.heappop(open_set)
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
                    "effective_cost": g_score[goal],
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
                    continue  # Skip full lots

                tentative_g = g_score[current] + weight

                if neighbor not in g_score or tentative_g < g_score[neighbor]:
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative_g
                    # Dynamic edge weight (tentative_g) + Static heuristic (heuristics[neighbor])
                    f_score = tentative_g + self.heuristics.get(neighbor, 0)

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


# Test scenarios
if __name__ == "__main__":
    # Sample road network leading to parking lots
    graph = {
        "User_Start": [("Intersection_1", 50), ("Intersection_2", 80)],
        "Intersection_1": [("Lot_A", 100), ("Intersection_3", 30)],
        "Intersection_2": [("Lot_B", 40)],
        "Intersection_3": [("Lot_A", 20), ("Lot_C", 110)],
        "Lot_A": [],
        "Lot_B": [],
        "Lot_C": []
    }

    # Static Euclidean distances to target destination (Lot_A)
    static_heuristics = {
        "User_Start": 120,
        "Intersection_1": 80,
        "Intersection_2": 150,
        "Intersection_3": 20,
        "Lot_A": 0,
        "Lot_B": 100,
        "Lot_C": 90
    }

    # Dynamic Crowd Ratings (1 = Empty, 5 = Full)
    crowd_ratings = {
        "Lot_A": 4,  # Heavy crowd (2.5x distance penalty)
        "Lot_B": 2,  # Light crowd
        "Lot_C": 1,  # Empty
        "Intersection_1": 1,
        "Intersection_2": 1,
        "Intersection_3": 1
    }

    benchmarker = AStarBenchmarker(graph, static_heuristics, crowd_ratings)
    results = benchmarker.search(start="User_Start", goal="Lot_A")

    print("=" * 40)
    print("        A* BENCHMARK RESULTS        ")
    print("=" * 40)
    print(f"Status:          {results['status']}")
    print(f"Optimal Path:    {' -> '.join(results['path'])}")
    print(f"Effective Cost:  {results['effective_cost']}")
    print("-" * 40)
    print("METRICS:")
    for metric, value in results["metrics"].items():
        print(f"  • {metric:<20}: {value}")
    print("=" * 40)