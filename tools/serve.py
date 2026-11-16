#!/usr/bin/env python3
"""Preview server with no-cache headers.

Usage: serve.py [port] [redirect_root_to]
  port              default 8000
  redirect_root_to  if set, redirect "/" to this path (e.g. /app/)
"""
import http.server
import socketserver
import sys
import os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
REDIRECT = sys.argv[2] if len(sys.argv) > 2 else ''
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
os.chdir(ROOT)


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if REDIRECT and self.path.split('?')[0] == '/':
            self.send_response(302)
            self.send_header('Location', REDIRECT)
            self.end_headers()
            return
        super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('0.0.0.0', PORT), NoCacheHandler) as httpd:
    print(f'KREO preview on :{PORT} (root -> {REDIRECT or "/"})')
    httpd.serve_forever()
