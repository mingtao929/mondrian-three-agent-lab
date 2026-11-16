from dataclasses import asdict


# 当前关卡的线索分配：A 知道 B 的目标，B 知道 C 的，C 知道 A 的。
# 这只是平台内部的分配表，每次观察只返回其中一条线索。
_线索对象 = {"A": "B", "B": "C", "C": "A"}


class Collaboration:
    def __init__(self, game):
        # 保存第一模块的棋盘引用，观察时读取最新位置。
        self._game = game
        # 每局单独维护聊天记录，按消息进入的顺序追加。
        self._messages = []

    def observe(self, seat):
        # seat 由平台在接入时绑定，观察只接收 A、B、C 三个席位。
        if seat not in _线索对象:
            raise ValueError("未知席位")
        teammate = _线索对象[seat]
        # 复用第一模块的目标数据，只取当前席位有权知道的队友目标。
        clue = self._game.test_observation(teammate)["target"]
        # 明确列出可公开的字段。棋盘公开的是当前碎片位置和方向。
        # asdict 和 copy 返回新字典，外部修改快照不会改动平台状态。
        return {
            "seat": seat,
            "board": {"width": self._game.width, "height": self._game.height},
            "pieces": {owner: asdict(piece) for owner, piece in self._game.pieces.items()},
            "clue": {"for_seat": teammate, "target": clue},
            "messages": [message.copy() for message in self._messages],
        }

    def send_message(self, seat, text):
        # 平台填入发言席位，消息正文不能改变发送者字段。
        if seat not in _线索对象:
            raise ValueError("未知席位")
        if not isinstance(text, str) or not text.strip():
            raise ValueError("消息必须是非空文本")
        # strip 只用于检查空白，聊天记录保留原始正文。
        self._messages.append({"sender": seat, "text": text})
