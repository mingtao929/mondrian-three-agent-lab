import unittest

from 模块01_拼图核心.拼图核心 import Puzzle
from 模块02_三方视野与通信.三方视野与通信 import Collaboration

from .轮次调度 import Scheduler


class SchedulerTests(unittest.TestCase):
    def test_schedule_shares_messages_and_records_actions(self):
        # 模拟三个独立席位，验证真实接入前的数据流。
        game = Puzzle()
        session = Collaboration(game)
        reply = '{"action":"move","dx":4,"dy":0}'
        scheduler = Scheduler(game, session, {
            "A": lambda view: '{"action":"chat","text":"B 的目标在第 4 列"}',
            "B": lambda view: reply if view["messages"] else "",
            "C": lambda view: '{"action":"wait"}',
        })
        records = [scheduler.step() for _ in range(3)]
        self.assertEqual([record["input"]["seat"] for record in records], ["A", "B", "C"])
        self.assertEqual(records[1]["raw_reply"], reply)
        self.assertEqual(records[1]["input"]["clue"]["for_seat"], "C")
        self.assertEqual(records[1]["input"]["pieces"]["B"]["x"], 0)
        self.assertEqual(records[1]["result"]["piece"]["x"], 4)
        self.assertEqual(game.pieces["B"].x, 4)

    def test_invalid_reply_consumes_turn_without_changing_board(self):
        # 保存无效回复，棋盘保持原状，下一轮交给 B。
        game = Puzzle()
        session = Collaboration(game)
        scheduler = Scheduler(game, session, dict.fromkeys("ABC", lambda view: "无效回复"))
        record = scheduler.step()
        self.assertFalse(record["result"]["ok"])
        self.assertEqual(record["raw_reply"], "无效回复")
        self.assertEqual(game.pieces["A"].x, 0)
        self.assertEqual(scheduler.step()["input"]["seat"], "B")

    def test_adapter_cannot_mutate_recorded_input(self):
        # 模拟适配器修改传入的视野，日志仍保留发送前的内容。
        def reply(view):
            view["pieces"]["A"]["x"] = 99
            return '{"action":"wait"}'

        game = Puzzle()
        scheduler = Scheduler(game, Collaboration(game), dict.fromkeys("ABC", reply))
        self.assertEqual(scheduler.step()["input"]["pieces"]["A"]["x"], 0)
        self.assertEqual(game.pieces["A"].x, 0)

    def test_timeout_is_recorded_without_a_reply(self):
        # 超时应有一条完整的失败记录，然后交给下一席位。
        def timeout(view):
            raise TimeoutError

        game = Puzzle()
        scheduler = Scheduler(game, Collaboration(game), dict.fromkeys("ABC", timeout))
        record = scheduler.step()
        self.assertEqual(record["turn"], 1)
        self.assertIsNone(record["raw_reply"])
        self.assertFalse(record["result"]["ok"])
        self.assertEqual(scheduler.step()["input"]["seat"], "B")
