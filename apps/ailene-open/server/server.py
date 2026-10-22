#!/usr/bin/env python3
"""
Ailene Open — Optional zero-dependency Python stdlib API server.

Serves:
  GET /api/health       — Health check
  GET /api/curriculum   — Full curriculum JSON
  GET /api/lessons/{id} — Single lesson by ID
  GET /api/quiz         — Quiz questions and results
  GET /                 — Serves web/index.html

The front-end is offline-first and does NOT require this server.
"""

import json
import os
import sys
import argparse
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from pathlib import Path


# Load curriculum data
SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_DIR = SCRIPT_DIR.parent
DATA_FILE = PROJECT_DIR / 'data' / 'curriculum.json'
WEB_DIR = PROJECT_DIR / 'web'

with open(DATA_FILE, 'r', encoding='utf-8') as f:
    CURRICULUM = json.load(f)


class AileneHandler(SimpleHTTPRequestHandler):
    """Custom handler for Ailene Open API + static files."""

    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        """Handle GET requests."""
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        # API routes
        if path == '/api/health':
            self.send_json({
                'status': 'ok',
                'app': 'ailene-open',
                'version': '1.0'
            })
            return

        if path == '/api/curriculum':
            lang = query.get('lang', ['en'])[0]
            self.send_json(CURRICULUM)
            return

        if path.startswith('/api/lessons/'):
            lesson_id = path.split('/')[-1]
            lesson = find_lesson(lesson_id)
            if lesson:
                self.send_json(lesson)
            else:
                self.send_error_json(404, 'Lesson not found')
            return

        if path == '/api/quiz':
            self.send_json({
                'questions': CURRICULUM.get('quiz_questions', []),
                'results': CURRICULUM.get('quiz_results', {})
            })
            return

        # Static files
        if path == '/':
            self.serve_file(WEB_DIR / 'index.html')
            return

        if path == '/mobile.html':
            self.serve_file(WEB_DIR / 'mobile.html')
            return

        if path.startswith('/'):
            # Serve from web/ directory
            file_path = WEB_DIR / path[1:]
            if file_path.exists() and file_path.is_file():
                self.serve_file(file_path)
            else:
                self.send_error(404, 'File not found')

    def send_json(self, data, status=200):
        """Send JSON response."""
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', len(body))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, status, message):
        """Send JSON error response."""
        self.send_json({'error': message}, status)

    def serve_file(self, file_path):
        """Serve a static file."""
        try:
            with open(file_path, 'rb') as f:
                content = f.read()
            self.send_response(200)
            if file_path.suffix == '.html':
                self.send_header('Content-Type', 'text/html; charset=utf-8')
            elif file_path.suffix == '.css':
                self.send_header('Content-Type', 'text/css; charset=utf-8')
            elif file_path.suffix == '.js':
                self.send_header('Content-Type', 'application/javascript; charset=utf-8')
            elif file_path.suffix == '.json':
                self.send_header('Content-Type', 'application/json; charset=utf-8')
            else:
                self.send_header('Content-Type', 'application/octet-stream')
            self.send_header('Content-Length', len(content))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(content)
        except FileNotFoundError:
            self.send_error(404, 'File not found')

    def log_message(self, format, *args):
        """Override to suppress logging if desired."""
        sys.stderr.write("%s - - [%s] %s\n" %
                         (self.address_string(),
                          self.log_date_time_string(),
                          format % args))


def find_lesson(lesson_id):
    """Find a lesson by ID."""
    for level in CURRICULUM.get('levels', []):
        for module in level.get('modules', []):
            for lesson in module.get('lessons', []):
                if lesson.get('id') == lesson_id:
                    return lesson
    return None


def main():
    parser = argparse.ArgumentParser(description='Ailene Open API Server')
    parser.add_argument('--port', type=int, default=8790, help='Port (default: 8790)')
    parser.add_argument('--host', type=str, default='127.0.0.1', help='Host (default: 127.0.0.1)')
    parser.add_argument('--no-browser', action='store_true', help='Do not open browser')
    args = parser.parse_args()

    server = HTTPServer((args.host, args.port), AileneHandler)
    url = f'http://{args.host}:{args.port}/'

    print(f'Ailene Open server running at {url}')
    print('Press Ctrl+C to stop.')

    if not args.no_browser:
        try:
            import webbrowser
            webbrowser.open(url)
        except Exception:
            pass

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down...')
        server.shutdown()


if __name__ == '__main__':
    main()
