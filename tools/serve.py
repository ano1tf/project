#!/usr/bin/env python3
"""Preview server with no-cache headers (avoids stale CSS/JS in the browser)."""
import http.server
import socketserver
import os

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('0.0.0.0', 8000), NoCacheHandler) as httpd:
    print('KREO preview on http://0.0.0.0:8000 (no-cache)')
    httpd.serve_forever()
