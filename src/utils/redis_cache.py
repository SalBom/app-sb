import requests
import os
import json

REDIS_URL = os.getenv("REDIS_REST_URL")
REDIS_TOKEN = os.getenv("REDIS_REST_TOKEN")

def redis_set(key: str, value, ex_seconds=300):
    """Guarda un valor en Redis con tiempo de expiración."""
    url = f"{REDIS_URL}/set/{key}"
    headers = {"Authorization": f"Bearer {REDIS_TOKEN}"}
    data = json.dumps(value)
    response = requests.post(url, headers=headers, json={"value": data, "ex": ex_seconds})
    return response.json()

def redis_get(key: str):
    """Recupera un valor desde Redis (si existe)."""
    url = f"{REDIS_URL}/get/{key}"
    headers = {"Authorization": f"Bearer {REDIS_TOKEN}"}
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        body = response.json()
        if body.get("result"):
            return json.loads(body["result"])
    return None
