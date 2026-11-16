import json
import unittest

from 模块01_拼图核心.拼图核心 import Puzzle

from .三方视野与通信 import Collaboration


class CollaborationTests(unittest.TestCase):
    def setUp(self):
        # 每项测试使用独立棋盘和独立聊天记录。
        self.game = Puzzle()
        self.session = Collaboration(self.game)

    def test_each_seat_receives_only_one_target_clue(self):
        # 每个席位知道下一席位的目标，自己的目标需要向队友询问。
        for seat, teammate in (("A", "B"), ("B", "C"), ("C", "A")):
            with self.subTest(seat=seat):
                view = self.session.observe(seat)
                self.assertEqual(set(view), {"seat", "board", "pieces", "clue", "messages"})
                self.assertEqual(view["clue"], {
                    "for_seat": teammate,
                    "target": self.game.test_observation(teammate)["target"],
                })
                self.assertEqual(set(view["pieces"]), {"A", "B", "C"})
                self.assertTrue(all(set(piece) == {"x", "y", "vertical"}
                                    for piece in view["pieces"].values()))
                # 确保观察可以直接发送为 JSON。
                json.dumps(view)

    def test_public_messages_are_ordered_and_observations_are_copies(self):
        # A 询问自己的目标，C 可以把私有线索主动分享给队友。
        self.session.send_message("A", "谁知道我的目标？")
        self.session.send_message("C", "A 的目标是 (3, 0)，竖放。")
        view = self.session.observe("B")
        self.assertEqual([m["sender"] for m in view["messages"]], ["A", "C"])
        self.assertEqual([m["text"] for m in view["messages"]],
                         ["谁知道我的目标？", "A 的目标是 (3, 0)，竖放。"])
        # 修改拿到的快照不能篡改聊天或棋盘。
        view["messages"][0]["text"] = "被修改"
        view["pieces"]["A"]["x"] = 99
        fresh = self.session.observe("C")
        self.assertEqual(fresh["messages"][0]["text"], "谁知道我的目标？")
        self.assertEqual(fresh["pieces"]["A"]["x"], 0)

    def test_public_positions_follow_the_game(self):
        # 游戏核心更新棋盘后，下一次观察应看到新位置。
        self.game.move("A", 3, 0)
        self.assertEqual(self.session.observe("B")["pieces"]["A"]["x"], 3)

    def test_invalid_seats_and_empty_messages_are_rejected(self):
        # 无效席位不能观察或发言，空白消息不能进入聊天。
        with self.assertRaises(ValueError):
            self.session.observe("D")
        with self.assertRaises(ValueError):
            self.session.send_message("D", "无效席位")
        with self.assertRaises(ValueError):
            self.session.send_message("A", "   ")
        self.assertEqual(self.session.observe("A")["messages"], [])
