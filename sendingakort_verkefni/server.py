"""Einfaldur Python-vefþjónn fyrir þróun / prófun á Sendingakorti.

Keyrsla: python server.py
Opna: http://localhost:5000

Engar auka Python-pakkar nauðsynlegir. Ekki tilbúið fyrir opinbera útgáfu.
"""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from urllib.parse import parse_qs, urlparse, urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import json
import time

HOST = "127.0.0.1"
PORT = 5000
PROJECT_DIR = Path(__file__).resolve().parent
GEOCODER = "https://nominatim.openstreetmap.org/search"
CACHE = {}
CACHE_LOCK = Lock()
LAST_REQUEST = 0.0


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PROJECT_DIR), **kwargs)

    def send_json(self, status, data):
        content = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/health":
            self.send_json(200, {"status": "ok", "application": "LEIÐ"})
            return
        if url.path == "/api/geocode":
            query = parse_qs(url.query).get("q", [""])[0].strip()
            if not query or len(query) > 180:
                self.send_json(400, {"error": "Sláðu inn gilt heimilisfang."})
                return
            self.lookup_address(query)
            return
        return super().do_GET()

    def lookup_address(self, query):
        global LAST_REQUEST
        cache_key = query.casefold()
        with CACHE_LOCK:
            if cache_key in CACHE:
                self.send_json(200, CACHE[cache_key])
                return
            # Miðlægt hámark: ein leit á hverjum 1,1 sekúndum.
            wait = max(0, 1.1 - (time.monotonic() - LAST_REQUEST))
            if wait:
                time.sleep(wait)
            LAST_REQUEST = time.monotonic()
            params = urlencode({
                "q": f"{query}, Ísland",
                "format": "jsonv2",
                "limit": "1",
                "countrycodes": "is",
            })
            request = Request(
                f"{GEOCODER}?{params}",
                headers={
                    "User-Agent": "LeidSendingakort-Demo/0.1 (local development, please replace for production)",
                    "Accept": "application/json",
                },
            )
            try:
                with urlopen(request, timeout=9) as response:
                    matches = json.loads(response.read().decode("utf-8"))
                if not matches:
                    self.send_json(404, {"error": "Heimilisfang fannst ekki."})
                    return
                result = {"lat": float(matches[0]["lat"]), "lng": float(matches[0]["lon"])}
                CACHE[cache_key] = result
                self.send_json(200, result)
            except (HTTPError, URLError, ValueError, KeyError, TimeoutError):
                self.send_json(502, {"error": "Ekki náðist samband við heimilisfangaþjónustu."})


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Sendingakort opið á http://{HOST}:{PORT}")
    print("Ýttu á Ctrl+C til að stoppa þjóninn.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nÞjónn stöðvaður.")
        server.server_close()
