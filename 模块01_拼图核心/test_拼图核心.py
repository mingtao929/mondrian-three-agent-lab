import unittest

# 从同一个模块目录导入拼图核心，测试和实现放在一起便于查找。
from .拼图核心 import Puzzle


class PuzzleTests(unittest.TestCase):
    def setUp(self):
        # 每项测试从同一个初始关卡开始。
        self.game = Puzzle()

    def test_move_and_rotate(self):
        # A 把横放的碎片向右移动三格，再旋转成竖放。
        self.game.move("A", 3, 0)
        self.game.rotate("A")
        self.assertEqual(self.game.pieces["A"].cells(), {(3, 0), (3, 1)})

    def test_cannot_move_another_agents_piece(self):
        # A 请求移动 B 的碎片，程序应拒绝并保留原位。
        with self.assertRaises(ValueError):
            self.game.move("A", 3, 0, owner="B")
        self.assertEqual(self.game.pieces["B"].cells(), {(0, 1), (1, 1)})

    def test_invalid_actions_preserve_state(self):
        # 向左越界和原地旋转碰到 B 都不能改变棋盘。
        with self.assertRaises(ValueError):
            self.game.move("A", -1, 0)
        with self.assertRaises(ValueError):
            self.game.rotate("A")
        self.assertEqual(self.game.pieces["A"].cells(), {(0, 0), (1, 0)})

    def test_move_requires_integer_steps(self):
        # 核心类自己拒绝小数和布尔位移，绕过回复解析直接调用也拦得住。
        # 这两类值参与坐标运算后会污染碎片位置，所以必须挡在入口。
        for dx, dy in ((0.5, 0), (0, 0.5), (True, 0), (0, False)):
            with self.subTest(dx=dx, dy=dy):
                with self.assertRaises(ValueError):
                    self.game.move("A", dx, dy)
        self.assertEqual(self.game.pieces["A"].cells(), {(0, 0), (1, 0)})

    def test_all_pieces_must_reach_their_targets(self):
        # 任一碎片还未就位时，整局都没有完成。
        self.assertFalse(self.game.is_solved())
        for agent, column in (("A", 3), ("B", 4), ("C", 5)):
            self.assertFalse(self.game.is_solved())
            self.game.move(agent, column, 0)
            self.game.rotate(agent)
        self.assertTrue(self.game.is_solved())

    def test_connection_round_records_input_output_and_movement(self):
        # 同一轮记录发出的观察、收到的原文以及移动后的结果。
        # input 的横坐标仍应为 0，result 的横坐标应为 3。
        reply = '{"action":"move","dx":3,"dy":0}'
        record = self.game.run_test_turn("A", reply)
        self.assertEqual(record["input"]["piece"], {"x": 0, "y": 0, "vertical": False})
        self.assertEqual(record["input"]["target"], {"x": 3, "y": 0, "vertical": True})
        self.assertEqual(record["raw_reply"], reply)
        self.assertEqual(record["action"]["action"], "move")
        self.assertEqual(record["result"]["piece"]["x"], 3)
        self.assertTrue(record["result"]["ok"])
        self.assertTrue(self.game.run_test_turn("A", '{"action":"rotate"}')["result"]["piece"]["vertical"])

    def test_connection_round_records_failures_without_moving(self):
        # 记录格式错误、越界和越权，并确认每次失败都保留原状态。
        # subTest 让四种异常分别报告结果，某一项失败时仍会检查其余项。
        for reply in ('oops', '{"action":"move","dx":true,"dy":0}',
                      '{"action":"move","dx":-1,"dy":0}', '{"action":"rotate","owner":"B"}'):
            with self.subTest(reply=reply):
                record = self.game.run_test_turn("A", reply)
                self.assertEqual(record["raw_reply"], reply)
                self.assertFalse(record["result"]["ok"])
                self.assertEqual(self.game.pieces["A"].cells(), {(0, 0), (1, 0)})
                self.assertEqual(self.game.pieces["B"].cells(), {(0, 1), (1, 1)})

    def test_connection_observation_only_contains_own_target(self):
        # 测试关卡允许看到自己的目标，用来验证动作链路。
        for seat, x, y in (("A", 3, 0), ("B", 4, 1), ("C", 5, 2)):
            observation = self.game.test_observation(seat)
            self.assertEqual(set(observation), {"seat", "board", "piece", "target"})
            self.assertEqual(observation["target"], {"x": x, "y": y, "vertical": True})
