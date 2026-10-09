import math
import unittest
from run_parking_test import AStarBenchmarker  # Import benchmarker


class TestAStarEdgeCases(unittest.TestCase):

    def setUp(self):
        """Set up a base 5x5 urban grid with parking lots for edge case testing."""
        self.grid_size = 5
        self.graph = {}
        self.positions = {}

        # 1. Build basic 5x5 grid
        for r in range(self.grid_size):
            for c in range(self.grid_size):
                node = f"Node_{r}_{c}"
                self.positions[node] = (r * 100, c * 100)
                self.graph[node] = []

        for r in range(self.grid_size):
            for c in range(self.grid_size):
                curr = f"Node_{r}_{c}"
                if r + 1 < self.grid_size:
                    nxt = f"Node_{r+1}_{c}"
                    self.graph[curr].append((nxt, 100))
                    self.graph[nxt].append((curr, 100))
                if c + 1 < self.grid_size:
                    nxt = f"Node_{r}_{c+1}"
                    self.graph[curr].append((nxt, 100))
                    self.graph[nxt].append((curr, 100))

        # 2. Attach target parking lots
        self.graph["Node_0_4"].append(("Lot_North", 50))
        self.graph["Lot_North"] = []
        self.positions["Lot_North"] = (0, 450)

        self.graph["Node_4_4"].append(("Lot_East", 50))
        self.graph["Lot_East"] = []
        self.positions["Lot_East"] = (450, 450)

    def _get_heuristics(self, goal):
        """Helper to calculate dynamic Euclidean distance heuristics."""
        goal_pos = self.positions[goal]
        return {
            node: math.hypot(pos[0] - goal_pos[0], pos[1] - goal_pos[1])
            for node, pos in self.positions.items()
        }

    # =========================================================================
    # TEST CASES
    # =========================================================================

    def test_construction_dead_end_reroute(self):
        """1. Construction (Rating 5) forces A* to reroute around a dead end."""
        start = "Node_0_0"
        goal = "Lot_North"
        heuristics = self._get_heuristics(goal)

        # Block the direct northern avenue (Node_0_1 -> Node_0_2)
        crowd_ratings = {
            "Node_0_1": 5,  # Completely blocked by construction
            "Lot_North": 1
        }

        benchmarker = AStarBenchmarker(self.graph, heuristics, crowd_ratings)
        res = benchmarker.search(start, goal)

        self.assertEqual(res["status"], "SUCCESS")
        self.assertNotIn("Node_0_1", res["path"], "Path should avoid the construction block.")

    def test_all_parking_lots_saturated(self):
        """2. Target parking hub becomes 100% full (Rating 5)."""
        start = "Node_0_0"
        goal = "Lot_North"
        heuristics = self._get_heuristics(goal)

        # Target lot is full (Rating 5 = Infinite multiplier)
        crowd_ratings = {"Lot_North": 5}

        benchmarker = AStarBenchmarker(self.graph, heuristics, crowd_ratings)
        res = benchmarker.search(start, goal)

        self.assertEqual(res["status"], "NO_PATH_FOUND")
        self.assertEqual(res["effective_cost"], float('inf'))
        self.assertEqual(res["path"], [])

    def test_disconnected_graph_no_path(self):
        """3. Isolate the goal with construction blocks on all access roads."""
        start = "Node_0_0"
        goal = "Lot_North"
        heuristics = self._get_heuristics(goal)

        # Isolate access node Node_0_4
        crowd_ratings = {
            "Node_0_3": 5,
            "Node_1_4": 5,
            "Lot_North": 1
        }

        benchmarker = AStarBenchmarker(self.graph, heuristics, crowd_ratings)
        res = benchmarker.search(start, goal)

        self.assertEqual(res["status"], "NO_PATH_FOUND")

    def test_rapid_capacity_adjustment_mid_flight(self):
        """4. Mid-route capacity drop forces higher travel cost recalculation."""
        goal = "Lot_North"
        heuristics = self._get_heuristics(goal)

        # Driver moves to Node_0_2, but Lot_North rapidly fills up (Rating 4 = 2.5x cost)
        updated_ratings = {"Lot_North": 4}
        mid_point = "Node_0_2"

        benchmarker = AStarBenchmarker(self.graph, heuristics, updated_ratings)
        res = benchmarker.search(mid_point, goal)

        self.assertEqual(res["status"], "SUCCESS")
        self.assertGreater(res["effective_cost"], 50 * 1.0)  # Base distance (50) * multiplier (2.5) = 125.0

    def test_multi_lot_failover_routing(self):
        """5. Automatically choose an open lot when primary lot is 100% full."""
        start = "Node_0_0"
        crowd_ratings = {
            "Lot_North": 5,  # Saturated
            "Lot_East": 1    # Available
        }

        # Check Lot_North
        bm_north = AStarBenchmarker(self.graph, self._get_heuristics("Lot_North"), crowd_ratings)
        res_north = bm_north.search(start, "Lot_North")

        # Check Lot_East
        bm_east = AStarBenchmarker(self.graph, self._get_heuristics("Lot_East"), crowd_ratings)
        res_east = bm_east.search(start, "Lot_East")

        self.assertEqual(res_north["status"], "NO_PATH_FOUND")
        self.assertEqual(res_east["status"], "SUCCESS")


if __name__ == "__main__":
    unittest.main(verbosity=2)