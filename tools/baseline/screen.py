"""A minimal VT100/xterm screen for the DOSBox-X curses debugger on a private PTY (P3-01 subtask 02).

Only what the debugger's curses output uses: cursor addressing and movement, erase, scroll regions and scrolling,
line/character insert and delete, saved cursor and line feeds at the bottom margin. Attributes, modes, charset
designations and OSC strings are consumed and ignored. An escape sequence split across reads is kept until complete.
Full-screen clears are counted, because the debugger repaints the whole screen after each message-printing command
and only such a repaint is trusted for the register pane.
"""
import re

ROWS, COLS = 50, 160
_CSI_FINAL = re.compile(r"[@-~]")
MAX_PENDING = 256


class Screen:
    def __init__(self, rows=ROWS, cols=COLS):
        self.height, self.width = rows, cols
        self.cells = [[" "] * cols for _ in range(rows)]
        self.row = self.col = 0
        self.top, self.bottom = 0, rows - 1
        self.saved = (0, 0)
        self.pending = ""
        self.clears = 0
        self.version = 0  # bumped on every feed, so views can be cached

    # -- helpers -----------------------------------------------------------------------------------------------------
    def _blank(self):
        return [" "] * self.width

    def _clamp(self, row, col):
        self.row = max(0, min(self.height - 1, row))
        self.col = max(0, min(self.width - 1, col))

    def _scroll_up(self, count=1):
        for _ in range(min(count, self.bottom - self.top + 1)):
            del self.cells[self.top]
            self.cells.insert(self.bottom, self._blank())

    def _scroll_down(self, count=1):
        for _ in range(min(count, self.bottom - self.top + 1)):
            del self.cells[self.bottom]
            self.cells.insert(self.top, self._blank())

    def _line_feed(self):
        if self.row == self.bottom:
            self._scroll_up()
        elif self.row < self.height - 1:
            self.row += 1

    def _put(self, char):
        if self.col >= self.width:
            self.col = self.width - 1
        self.cells[self.row][self.col] = char
        self.col = min(self.col + 1, self.width - 1)

    # -- control sequences -------------------------------------------------------------------------------------------
    def _csi(self, body, final):
        if body[:1] in ("?", ">", "=", "<"):
            return  # private modes
        params = [int(part) if part.isdigit() else 0 for part in body.split(";")] if body else [0]
        first = params[0]
        count = first or 1
        if final in "Hf":
            column = params[1] if len(params) > 1 else 0
            self._clamp((first or 1) - 1, (column or 1) - 1)
        elif final == "d":
            self._clamp(count - 1, self.col)
        elif final in "G`":
            self._clamp(self.row, count - 1)
        elif final == "A":
            self._clamp(self.row - count, self.col)
        elif final == "B":
            self._clamp(self.row + count, self.col)
        elif final == "C":
            self._clamp(self.row, self.col + count)
        elif final == "D":
            self._clamp(self.row, self.col - count)
        elif final == "J":
            if first == 0:
                self.cells[self.row][self.col:] = [" "] * (self.width - self.col)
                for row in range(self.row + 1, self.height):
                    self.cells[row] = self._blank()
            elif first == 1:
                for row in range(self.row):
                    self.cells[row] = self._blank()
                self.cells[self.row][:self.col + 1] = [" "] * (self.col + 1)
            else:
                self.cells = [self._blank() for _ in range(self.height)]
                self.clears += 1
        elif final == "K":
            start = 0 if first in (1, 2) else self.col
            end = self.col + 1 if first == 1 else self.width
            self.cells[self.row][start:end] = [" "] * (end - start)
        elif final == "X":
            end = min(self.width, self.col + count)
            self.cells[self.row][self.col:end] = [" "] * (end - self.col)
        elif final == "S":
            self._scroll_up(count)
        elif final == "T":
            self._scroll_down(count)
        elif final == "r":
            top = (first or 1) - 1
            bottom = ((params[1] if len(params) > 1 else 0) or self.height) - 1
            if 0 <= top < bottom < self.height:
                self.top, self.bottom = top, bottom
            self.row = self.col = 0
        elif final in "LM" and self.top <= self.row <= self.bottom:
            for _ in range(min(count, self.bottom - self.row + 1)):
                if final == "L":
                    del self.cells[self.bottom]
                    self.cells.insert(self.row, self._blank())
                else:
                    del self.cells[self.row]
                    self.cells.insert(self.bottom, self._blank())
        elif final == "@":
            line = self.cells[self.row]
            self.cells[self.row] = (line[:self.col] + [" "] * count + line[self.col:])[:self.width]
        elif final == "P":
            line = self.cells[self.row]
            removed = min(count, self.width - self.col)
            self.cells[self.row] = line[:self.col] + line[self.col + removed:] + [" "] * removed

    def feed(self, data):
        """Applies terminal output bytes (decoded as Latin-1, so every byte maps to one character)."""
        self.version += 1
        text = self.pending + bytes(data).decode("latin-1")
        self.pending = ""
        index = 0
        length = len(text)
        while index < length:
            char = text[index]
            if char == "\x1b":
                consumed = self._escape(text, index)
                if consumed is None:
                    tail = text[index:]
                    self.pending = tail if len(tail) <= MAX_PENDING else ""
                    return
                index += consumed
                continue
            if char == "\r":
                self.col = 0
            elif char == "\n":
                self._line_feed()
            elif char == "\b":
                self.col = max(0, self.col - 1)
            elif char == "\t":
                self.col = min(self.width - 1, (self.col // 8 + 1) * 8)
            elif " " <= char < "\x7f":
                self._put(char)
            elif char >= "\xa0":
                self._put("?")
            index += 1

    def _escape(self, text, index):
        """Length of the escape sequence at `index`, applying it; None when it is incomplete."""
        if index + 1 >= len(text):
            return None
        kind = text[index + 1]
        if kind == "[":
            match = _CSI_FINAL.search(text, index + 2)
            if match is None:
                return None
            body = "".join(ch for ch in text[index + 2:match.start()] if ch.isdigit() or ch in ";?>=<")
            self._csi(body, match.group())
            return match.end() - index
        if kind == "]":  # OSC: up to BEL or ESC backslash
            for end in range(index + 2, len(text)):
                if text[end] == "\x07":
                    return end + 1 - index
                if text[end] == "\x1b" and end + 1 < len(text) and text[end + 1] == "\\":
                    return end + 2 - index
            return None
        if kind in "()*+":
            return 3 if index + 2 < len(text) else None
        if kind == "7":
            self.saved = (self.row, self.col)
        elif kind == "8":
            self._clamp(*self.saved)
        elif kind == "M":
            if self.row == self.top:
                self._scroll_down()
            else:
                self._clamp(self.row - 1, self.col)
        elif kind == "D":
            self._line_feed()
        elif kind == "E":
            self.col = 0
            self._line_feed()
        return 2

    # -- views ---------------------------------------------------------------------------------------------------------
    def lines(self):
        return ["".join(row).rstrip() for row in self.cells]
