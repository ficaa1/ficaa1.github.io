# A local preview server that answers Range requests, so the player can seek
# (python3 -m http.server always sends the whole file). GitHub Pages does this by itself.
# Usage: python3 tools/serve.py [port] [dir]
import os, re, sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Handler(SimpleHTTPRequestHandler):
    def send_head(self):
        m = re.fullmatch(r'bytes=(\d*)-(\d*)', self.headers.get('Range', ''))
        path = self.translate_path(self.path)
        if not m or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        a, b = m.groups()
        start, end = (size - int(b), size - 1) if not a else (int(a), min(int(b or size - 1), size - 1))
        if start < 0 or start > end:
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.end_headers()
            return None
        f = open(path, 'rb')
        f.seek(start)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.send_header('Accept-Ranges', 'bytes')
        self.end_headers()
        self.remaining = end - start + 1
        return f

    def copyfile(self, src, dst):
        n = getattr(self, 'remaining', None)
        if n is None:
            return super().copyfile(src, dst)
        while n > 0:
            chunk = src.read(min(65536, n))
            if not chunk:
                break
            dst.write(chunk)
            n -= len(chunk)

    def end_headers(self):
        if self.command == 'GET' and 'Range' not in self.headers:
            self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()


Handler.extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.jxl': 'image/jxl', '.mjs': 'text/javascript'}

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8767
    root = sys.argv[2] if len(sys.argv) > 2 else 'site'
    ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, directory=root)).serve_forever()
