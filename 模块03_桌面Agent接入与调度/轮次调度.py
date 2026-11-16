import json
from copy import deepcopy


class Scheduler:
    # 固定轮流行动，便于复查每条消息是在谁的动作之前出现的。
    _seats = ("A", "B", "C")

    def __init__(self, game, collaboration, agents):
        # agents 将每个席位绑定到一个收发函数：输入视野字典，返回原始文本。
        if set(agents) != set(self._seats) or not all(callable(agent) for agent in agents.values()):
            raise ValueError("请为 A、B、C 各绑定一个收发函数")
        self._game = game
        self._collaboration = collaboration
        self._agents = dict(agents)
        self._turn = 0

    @property
    def current_seat(self):
        # 取余数把递增轮次映射为 A、B、C、A……。
        return self._seats[self._turn % len(self._seats)]

    def step(self):
        seat = self.current_seat
        observation = self._collaboration.observe(seat)
        self._turn += 1
        record = {"turn": self._turn, "input": observation, "raw_reply": None, "action": None}
        try:
            # 给适配器一份独立副本，原始观察保留给日志。
            reply = self._agents[seat](deepcopy(observation))
        except TimeoutError:
            record["result"] = {"ok": False, "error": "等待 Agent 回复超时"}
            return record

        record["raw_reply"] = reply
        if not isinstance(reply, str):
            record["result"] = {"ok": False, "error": "Agent 回复必须是文本"}
            return record

        # 先识别协作动作。移动、旋转和无效回复交给拼图核心校验。
        try:
            action = json.loads(reply)
        except ValueError:
            action = None
        if isinstance(action, dict) and action.get("action") in ("chat", "wait"):
            record["action"] = action
            try:
                if action["action"] == "chat":
                    # 发言身份来自当前轮次，回复只能提供消息正文。
                    self._collaboration.send_message(seat, action.get("text"))
                record["result"] = {"ok": True, "error": None}
            except ValueError as exc:
                record["result"] = {"ok": False, "error": str(exc)}
        else:
            execution = self._game.run_test_turn(seat, reply)
            # 只取动作和结果，日志输入仍使用实际发送的局部观察。
            record["action"] = execution["action"]
            record["result"] = execution["result"]
        return record
