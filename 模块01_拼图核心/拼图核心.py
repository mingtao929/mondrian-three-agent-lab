import argparse
import json
import sys
from dataclasses import asdict, dataclass, replace


# frozen=True 禁止直接修改碎片字段，移动和旋转会创建新的碎片状态。
@dataclass(frozen=True)
class Piece:
    # 坐标表示碎片左上角。旋转后仍以这个位置为锚点。
    # x 向右增大，y 向下增大。vertical 为 False 表示横放。
    x: int
    y: int
    vertical: bool = False

    def cells(self):
        # 接入测试关卡每块碎片占两格，竖放向下延伸，横放向右延伸。
        neighbor = (self.x, self.y + 1) if self.vertical else (self.x + 1, self.y)
        return {(self.x, self.y), neighbor}


class Puzzle:
    def __init__(self):
        # 棋盘宽七格、高四格，右侧留一列给横放碎片转向。
        self.width = 7
        self.height = 4
        # 每个席位拥有一块碎片。键是席位，值是碎片的当前位置。
        self.pieces = {"A": Piece(0, 0), "B": Piece(0, 1), "C": Piece(0, 2)}
        # 目标由游戏核心保管。接入测试只向当前席位公开自己的目标。
        self._targets = {
            "A": Piece(3, 0, vertical=True),
            "B": Piece(4, 1, vertical=True),
            "C": Piece(5, 2, vertical=True),
        }

    def move(self, agent, dx, dy, *, owner=None):
        # 根据移动量算出候选位置，只有检查通过才更新棋盘。
        # 例如 dx=3、dy=0 表示向右移三格。replace 复制碎片并替换指定字段。
        # owner 是回复声明的碎片归属，agent 是平台指定的实际行动席位。
        # 位移必须是整数格。布尔值虽属于 int 子类，但不是有效格数，所以用 type 精确判断。
        # 这项检查放在核心类里，任何调用方直连核心时也绕不过去。
        if type(dx) is not int or type(dy) is not int:
            raise ValueError("移动需要整数 dx 和 dy")
        piece = self.pieces[agent]
        candidate = replace(piece, x=piece.x + dx, y=piece.y + dy)
        self._place(agent, owner, candidate)

    def rotate(self, agent, *, owner=None):
        # 这块两格长的碎片旋转九十度后，在横放与竖放之间切换。
        piece = self.pieces[agent]
        self._place(agent, owner, replace(piece, vertical=not piece.vertical))

    def _place(self, agent, owner, candidate):
        # 如果动作指明了碎片归属，它必须与操作席位一致。
        if owner is not None and owner != agent:
            raise ValueError("只能操作自己的碎片")

        cells = candidate.cells()
        # 碎片占用的每一格都必须在棋盘内。
        if any(not (0 <= x < self.width and 0 <= y < self.height) for x, y in cells):
            raise ValueError("碎片超出棋盘")

        # 对照队友碎片的占用格，避免两块碎片重叠。
        # & 取两个集合的交集。只要共同占据一格，就拒绝动作。
        for other_agent, other_piece in self.pieces.items():
            if other_agent != agent and cells & other_piece.cells():
                raise ValueError("碎片与队友的碎片重叠")

        # 所有检查通过后才替换碎片，拒绝动作时原状态仍有效。
        self.pieces[agent] = candidate

    def is_solved(self):
        # 三块碎片都达到各自的目标位置和方向，才算通关。
        # 字典比较会逐个核对席位。Piece 比较会核对 x、y 和 vertical。
        return self.pieces == self._targets

    def test_observation(self, seat):
        # 只取当前席位的碎片和目标，转换为可发送的 JSON 数据。
        # asdict 将 Piece 转成普通字典，返回的数据可以独立修改。
        # 这个关卡公开自己的目标坐标，便于测试接入和动作执行。
        return {
            "seat": seat,
            "board": {"width": self.width, "height": self.height},
            "piece": asdict(self.pieces[seat]),
            "target": asdict(self._targets[seat]),
        }

    def run_test_turn(self, seat, raw_reply):
        # 保存动作之前的输入与回复原文，解析失败时也能追查。
        observation = self.test_observation(seat)
        action = None
        error = None
        try:
            # 先把 Agent 的文本回复转换为 Python 对象，再读取动作字段。
            parsed = json.loads(raw_reply)
            if not isinstance(parsed, dict):
                raise ValueError("回复必须是 JSON 对象")
            action = parsed
            kind = action.get("action")
            owner = action.get("owner", seat)
            # 席位由调用方指定，回复不能更换实际操作人。
            if owner != seat:
                raise ValueError("只能操作自己的碎片")

            if kind == "move":
                # 整数格校验已由 Puzzle.move 完成，这里只负责取出参数。
                dx, dy = action.get("dx"), action.get("dy")
                self.move(seat, dx, dy)
            elif kind == "rotate":
                self.rotate(seat)
            else:
                raise ValueError("动作必须是 move 或 rotate")
        except json.JSONDecodeError:
            # JSON 无法解析时，记录中保留回复原文，action 保持为空。
            error = "回复不是有效的 JSON"
        except ValueError as exc:
            # 格式合法但动作无效时，保留已解析的动作和拒绝原因。
            error = str(exc)

        # 游戏反馈只包含该席位的碎片，完整记录由研究者保管。
        # input 是动作执行前的观察，result.piece 是动作执行后的状态。
        result = {"ok": error is None, "piece": asdict(self.pieces[seat]), "error": error}
        return {"input": observation, "raw_reply": raw_reply, "action": action, "result": result}


if __name__ == "__main__":
    # 直接运行此文件才启动命令行。测试导入 Puzzle 时跳过这里。
    # 命令行固定一个席位。每行输入是一条模拟的 Agent 回复。
    parser = argparse.ArgumentParser(description="运行单席位接入测试")
    parser.add_argument("seat", choices=("A", "B", "C"))
    seat = parser.parse_args().seat
    game = Puzzle()

    # 标准输出发初始观察和动作反馈，标准错误单独写每轮记录。
    print(json.dumps(game.test_observation(seat)), flush=True)
    for turn, line in enumerate(sys.stdin, start=1):
        # 只去掉传输用的行尾换行，保留回复中的其他空格和原文。
        record = game.run_test_turn(seat, line.rstrip("\r\n"))
        # 每条记录单独占一行。flush 立即发送，方便外部程序逐轮读取。
        print(json.dumps({"turn": turn, **record}), file=sys.stderr, flush=True)
        print(json.dumps(record["result"]), flush=True)
