#!/usr/bin/env python3
"""Portail Méridien — fenêtre sur la machine.

Sert le dépôt en statique et expose une petite API :
  GET  /api/status     état machine + dépôt (git, disque, versions)
  GET  /api/tree       arborescence du dépôt (hors .git, caches)
  GET  /api/file       lecture d'un fichier texte du dépôt (?path=relatif)
  GET  /api/galerie    contenu de portal/galerie + assets/showcase
  GET  /api/assets3d   inventaire 3D (glb, gltf, lots .kreo-asset.json)
  GET  /api/requests   commandes déposées dans portal/boite
  POST /api/request    déposer une commande {kind,title,details,priority}
  GET  /api/journal    fin du journal d'activité (?n=200)

Usage : portal-server.py [port]   (défaut 8080, écoute 0.0.0.0)
"""
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler
from socketserver import ThreadingTCPServer
from urllib.parse import parse_qs, urlparse

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
PORTAL = os.path.join(ROOT, 'portal')
BOITE = os.path.join(PORTAL, 'boite')
GALERIE = os.path.join(PORTAL, 'galerie')
JOURNAL = os.path.join(PORTAL, 'journal.log')

os.makedirs(BOITE, exist_ok=True)
os.makedirs(GALERIE, exist_ok=True)

_JLOCK = threading.Lock()

TEXT_EXT = {
    '.md', '.txt', '.json', '.js', '.mjs', '.css', '.html', '.htm', '.py',
    '.svg', '.yml', '.yaml', '.log', '.csv', '.sh', '.gitignore', '.glsl',
}
SKIP_DIRS = {'.git', 'node_modules', '__pycache__', '.venv', '.cache', '.mypy_cache',
             '.pytest_cache', '.ruff_cache', '.turbo', '.next', 'dist', 'build'}
MODEL_EXT = {'.glb', '.gltf'}
IMAGE_EXT = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}
MAX_READ = 256 * 1024
MAX_POST = 64 * 1024
KINDS = {'photo', 'modele', 'decors', 'vehicule', 'personnage', 'autre'}
PRIORITIES = {'basse', 'normale', 'haute'}


def journal(ligne):
    """Ajoute une ligne horodatée au journal d'activité."""
    stamp = datetime.now(timezone.utc).astimezone().strftime('%Y-%m-%d %H:%M:%S')
    with _JLOCK:
        with open(JOURNAL, 'a', encoding='utf-8') as fh:
            fh.write(f'[{stamp}] {ligne}\n')


if not os.path.exists(JOURNAL):
    journal('Portail Méridien initialisé — machine accessible.')
    journal('Triple 3D : en attente de connexion du service de génération.')


def git(*args):
    try:
        out = subprocess.run(['git', '-C', ROOT, *args],
                             capture_output=True, text=True, timeout=8)
        return out.stdout.strip() if out.returncode == 0 else ''
    except Exception:
        return ''


def du(path):
    total = 0
    for dirpath, dirnames, filenames in os.walk(path):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            try:
                total += os.path.getsize(os.path.join(dirpath, name))
            except OSError:
                pass
    return total


def api_status():
    usage = shutil.disk_usage(ROOT)
    dirty = bool(git('status', '--porcelain'))
    return {
        'ok': True,
        'now': datetime.now(timezone.utc).astimezone().isoformat(timespec='seconds'),
        'machine': socket.gethostname(),
        'platform': sys.platform,
        'python': sys.version.split()[0],
        'git': {
            'branch': git('rev-parse', '--abbrev-ref', 'HEAD'),
            'commit': git('rev-parse', '--short', 'HEAD'),
            'dirty': dirty,
        },
        'disk': {'free_go': round(usage.free / 1e9, 2), 'total_go': round(usage.total / 1e9, 2)},
        'workspace_mo': round(du(ROOT) / 1e6, 1),
        'triple3d': {'connected': False, 'note': 'en attente de connexion'},
    }


def api_tree():
    def build(rel, depth):
        abs_path = os.path.join(ROOT, rel)
        entries = []
        try:
            names = sorted(os.listdir(abs_path))
        except OSError:
            return entries
        for name in names:
            if name in SKIP_DIRS or name.startswith('.'):
                continue
            child_rel = os.path.join(rel, name) if rel else name
            abs_child = os.path.join(ROOT, child_rel)
            if os.path.isdir(abs_child):
                node = {'name': name, 'path': child_rel, 'type': 'dir', 'children': []}
                if depth > 0:
                    node['children'] = build(child_rel, depth - 1)
                entries.append(node)
            else:
                try:
                    size = os.path.getsize(abs_child)
                except OSError:
                    size = 0
                entries.append({'name': name, 'path': child_rel, 'type': 'file', 'size': size})
        return entries

    return {'root': ROOT, 'tree': build('', 3)}


def safe_path(rel):
    """Résout rel sous ROOT, refuse toute échappée. Retourne le chemin ou None."""
    if not rel:
        return None
    target = os.path.realpath(os.path.join(ROOT, rel))
    if target != ROOT and not target.startswith(ROOT + os.sep):
        return None
    return target


def api_file(query):
    rel = (query.get('path') or [''])[0]
    target = safe_path(rel)
    if not target or not os.path.isfile(target):
        return {'error': 'fichier introuvable'}, 404
    ext = os.path.splitext(target)[1].lower()
    if ext not in TEXT_EXT and os.path.basename(target) not in {'.gitignore'}:
        return {'error': 'type de fichier non lisible'}, 415
    if os.path.getsize(target) > MAX_READ:
        return {'error': 'fichier trop volumineux'}, 413
    with open(target, 'r', encoding='utf-8', errors='replace') as fh:
        content = fh.read()
    return {'path': rel, 'size': len(content), 'content': content}, 200


def scan_dir(rel, exts):
    abs_path = os.path.join(ROOT, rel)
    items = []
    if not os.path.isdir(abs_path):
        return items
    for name in sorted(os.listdir(abs_path)):
        abs_child = os.path.join(abs_path, name)
        if not os.path.isfile(abs_child):
            continue
        ext = os.path.splitext(name)[1].lower()
        if ext not in exts:
            continue
        items.append({
            'name': name,
            'path': os.path.join(rel, name).replace(os.sep, '/'),
            'ext': ext,
            'size': os.path.getsize(abs_child),
            'mtime': int(os.path.getmtime(abs_child)),
        })
    return items


def api_galerie():
    items = []
    for it in scan_dir('portal/galerie', IMAGE_EXT | MODEL_EXT):
        it['source'] = 'galerie'
        it['kind'] = 'modele' if it['ext'] in MODEL_EXT else 'image'
        items.append(it)
    for it in scan_dir('assets/showcase', IMAGE_EXT):
        it['source'] = 'showcase'
        it['kind'] = 'image'
        items.append(it)
    for it in scan_dir('game/meridien/art', {'.jpg', '.jpeg', '.png', '.webp'}):
        it['source'] = 'meridien'
        it['kind'] = 'image'
        items.append(it)
    return {'items': items}


def api_assets3d():
    found = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        rel_dir = os.path.relpath(dirpath, ROOT)
        if rel_dir.split(os.sep)[0] in {'assets', 'demo'} and 'vendor' in rel_dir:
            continue
        for name in filenames:
            ext = os.path.splitext(name)[1].lower()
            base = name.lower()
            if ext in MODEL_EXT or base.endswith('.kreo-asset.json'):
                abs_child = os.path.join(dirpath, name)
                found.append({
                    'name': name,
                    'path': os.path.relpath(abs_child, ROOT).replace(os.sep, '/'),
                    'kind': 'lot-kreo' if base.endswith('.kreo-asset.json') else 'modele',
                    'size': os.path.getsize(abs_child),
                })
    return {'items': sorted(found, key=lambda it: it['path'])}


def api_requests():
    items = []
    for name in sorted(os.listdir(BOITE), reverse=True):
        abs_child = os.path.join(BOITE, name)
        if not name.endswith('.json') or not os.path.isfile(abs_child):
            continue
        try:
            with open(abs_child, 'r', encoding='utf-8') as fh:
                data = json.load(fh)
        except (OSError, ValueError):
            continue
        data['file'] = name
        items.append(data)
    return {'items': items}


def api_journal(query):
    try:
        n = max(1, min(int((query.get('n') or ['200'])[0]), 1000))
    except ValueError:
        n = 200
    lines = []
    with _JLOCK:
        if os.path.exists(JOURNAL):
            with open(JOURNAL, 'r', encoding='utf-8') as fh:
                lines = fh.read().splitlines()
    return {'lines': lines[-n:]}


def new_request(payload):
    kind = str(payload.get('kind') or '').lower()
    title = str(payload.get('title') or '').strip()
    details = str(payload.get('details') or '').strip()
    priority = str(payload.get('priority') or 'normale').lower()
    if kind not in KINDS:
        return {'error': 'kind invalide'}, 400
    if not title or len(title) > 160:
        return {'error': 'titre requis (160 car. max)'}, 400
    if len(details) > 4000:
        return {'error': 'détails trop longs (4000 car. max)'}, 400
    if priority not in PRIORITIES:
        priority = 'normale'
    slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')[:40] or 'commande'
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
    name = f'{stamp}-{slug}.json'
    data = {
        'id': name[:-5],
        'kind': kind,
        'title': title,
        'details': details,
        'priority': priority,
        'status': 'en attente',
        'received': datetime.now(timezone.utc).astimezone().isoformat(timespec='seconds'),
    }
    with open(os.path.join(BOITE, name), 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    journal(f'Commande reçue — {kind} · {title} (priorité {priority})')
    return {'ok': True, 'request': data}, 201


class PortalHandler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write('[portail] %s\n' % (fmt % args))

    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        route = parsed.path.rstrip('/') or '/'
        query = parse_qs(parsed.query)
        if route == '/':
            self.send_response(302)
            self.send_header('Location', '/portal/')
            self.end_headers()
            return
        if route.startswith('/api/'):
            handlers = {
                '/api/status': lambda: (api_status(), 200),
                '/api/tree': lambda: (api_tree(), 200),
                '/api/file': lambda: api_file(query),
                '/api/galerie': lambda: (api_galerie(), 200),
                '/api/assets3d': lambda: (api_assets3d(), 200),
                '/api/requests': lambda: (api_requests(), 200),
                '/api/journal': lambda: (api_journal(query), 200),
            }
            handler = handlers.get(route)
            if not handler:
                self.send_json({'error': 'route inconnue'}, 404)
                return
            try:
                obj, code = handler()
            except Exception as exc:  # jamais laisser tomber une connexion
                self.send_json({'error': f'erreur serveur : {exc}'}, 500)
                return
            self.send_json(obj, code)
            return
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path.rstrip('/') != '/api/request':
            self.send_json({'error': 'route inconnue'}, 404)
            return
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_POST:
            self.send_json({'error': 'corps requis (64 Kio max)'}, 400)
            return
        try:
            payload = json.loads(self.rfile.read(length).decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            self.send_json({'error': 'JSON invalide'}, 400)
            return
        obj, code = new_request(payload)
        self.send_json(obj, code)


class PortalServer(ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    handler = partial(PortalHandler, directory=ROOT)
    with PortalServer(('0.0.0.0', port), handler) as httpd:
        print(f'Portail Méridien sur :{port} → /portal/ (racine dépôt : {ROOT})')
        journal(f'Serveur portail démarré sur le port {port}.')
        httpd.serve_forever()


if __name__ == '__main__':
    main()
