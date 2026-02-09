import json, time, threading, functools, os
import redis

REDIS_URL = os.getenv("REDIS_URL")
r = redis.Redis.from_url(REDIS_URL) if REDIS_URL else None

def swr_cache(key_fn, ttl=30, bg_ttl=300):
    def decorator(handler):
        @functools.wraps(handler)
        def wrapper(*args, **kwargs):
            if not r:
                return handler(*args, **kwargs)
            key = key_fn(*args, **kwargs)
            raw = r.get(key)
            now = int(time.time())
            if raw:
                payload = json.loads(raw)
                if payload.get("ts", 0) + ttl >= now:
                    return payload["data"]
                def _bg_refresh():
                    try:
                        data = handler(*args, **kwargs)
                        r.setex(key, bg_ttl, json.dumps({"ts": int(time.time()), "data": data}))
                    except Exception:
                        pass
                threading.Thread(target=_bg_refresh, daemon=True).start()
                return payload["data"]
            data = handler(*args, **kwargs)
            r.setex(key, bg_ttl, json.dumps({"ts": int(time.time()), "data": data}))
            return data
        return wrapper
    return decorator
